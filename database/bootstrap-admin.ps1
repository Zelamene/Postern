param(
    [Parameter(Mandatory = $true)]
    [string]$Email
)

$ErrorActionPreference = 'Stop'

if ($Email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    throw 'Enter the email address of an existing, active Postern account.'
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previousPostgresUser = [Environment]::GetEnvironmentVariable('POSTGRES_USER', 'Process')
$previousPostgresDb = [Environment]::GetEnvironmentVariable('POSTGRES_DB', 'Process')

Push-Location $repositoryRoot
try {
    $configuration = docker compose config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw 'Reading the Compose database configuration failed.'
    }

    $settings = $configuration.services.db.environment
    foreach ($name in @('POSTGRES_USER', 'POSTGRES_DB')) {
        $value = $settings.$name
        if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith('replace-with-', [StringComparison]::OrdinalIgnoreCase)) {
            throw "Set a local value for $name in env\db.env before provisioning the admin."
        }

        Set-Item -Path "Env:$name" -Value $value
    }

    $emailParts = $Email.Trim().Split('@')
    if ($emailParts.Length -ne 2) {
        throw 'Enter a valid email address.'
    }

    $domain = ([System.Globalization.IdnMapping]::new()).GetAscii($emailParts[1]).ToLowerInvariant()
    $localPart = $emailParts[0].Normalize([System.Text.NormalizationForm]::FormC).ToUpperInvariant()
    $escapedEmail = "$localPart@$domain".Replace("'", "''")
    $sql = @'
BEGIN;
DO $$
DECLARE
    target_id uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM postern.users WHERE is_admin) THEN
        RAISE EXCEPTION 'An administrator already exists; refusing to replace it.';
    END IF;

    SELECT id INTO target_id
    FROM postern.users
    WHERE normalized_email = '__ADMIN_EMAIL__'
      AND status = 'active'
    FOR UPDATE;

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'No active account exists for the supplied email.';
    END IF;

    UPDATE postern.users SET is_admin = TRUE WHERE id = target_id;
END
$$;
COMMIT;
'@
    $sql = $sql.Replace('__ADMIN_EMAIL__', $escapedEmail)
    $sql | docker compose exec -T `
        -e POSTGRES_USER `
        -e POSTGRES_DB `
        db psql -v ON_ERROR_STOP=1 --username $settings.POSTGRES_USER --dbname $settings.POSTGRES_DB

    if ($LASTEXITCODE -ne 0) {
        throw 'Admin provisioning failed. No account was promoted.'
    }

    Write-Output 'Admin provisioned. Sign in at /admin and complete authenticator setup.'
}
finally {
    foreach ($name in @('POSTGRES_USER', 'POSTGRES_DB')) {
        $previousValue = if ($name -eq 'POSTGRES_USER') { $previousPostgresUser } else { $previousPostgresDb }
        if ($null -eq $previousValue) {
            Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item -Path "Env:$name" -Value $previousValue
        }
    }

    Pop-Location
}
