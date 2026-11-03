$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previousInviteHash = [Environment]::GetEnvironmentVariable('POSTERN_BOOTSTRAP_INVITE_HASH', 'Process')

Push-Location $repositoryRoot
try {
    $configuration = docker compose config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw 'Reading the Compose database configuration failed.'
    }

    $settings = $configuration.services.db.environment
    foreach ($name in @('POSTGRES_USER', 'POSTGRES_DB')) {
        if ([string]::IsNullOrWhiteSpace($settings.$name)) {
            throw "Set $name in env\db.env before creating an invite."
        }
    }

    $randomBytes = New-Object byte[] 32
    $randomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomNumberGenerator.GetBytes($randomBytes)
    }
    finally {
        $randomNumberGenerator.Dispose()
    }

    $inviteCode = 'postern-invite_' + [Convert]::ToBase64String(
        $randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $inviteHash = [BitConverter]::ToString(
            $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($inviteCode))).Replace('-', '')
    }
    finally {
        $sha256.Dispose()
    }
    $env:POSTERN_BOOTSTRAP_INVITE_HASH = $inviteHash
    $inviteId = [Guid]::NewGuid().ToString()
    $sql = @'
\getenv invite_hash POSTERN_BOOTSTRAP_INVITE_HASH
INSERT INTO postern.invite_codes (id, code_hash, expires_at)
VALUES (:'invite_id', :'invite_hash', CURRENT_TIMESTAMP + INTERVAL '7 days');
'@

    $sql | docker compose exec -T `
        -e POSTERN_BOOTSTRAP_INVITE_HASH `
        db psql -v ON_ERROR_STOP=1 -v "invite_id=$inviteId" `
        --username $settings.POSTGRES_USER --dbname $settings.POSTGRES_DB

    if ($LASTEXITCODE -ne 0) {
        throw 'Creating the invite failed.'
    }

    Write-Output "One-time invite code (expires in 7 days): $inviteCode"
}
finally {
    if ($null -eq $previousInviteHash) {
        Remove-Item Env:\POSTERN_BOOTSTRAP_INVITE_HASH -ErrorAction SilentlyContinue
    }
    else {
        $env:POSTERN_BOOTSTRAP_INVITE_HASH = $previousInviteHash
    }

    Pop-Location
}
