$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$requiredSettings = @(
    'POSTGRES_USER',
    'POSTGRES_DB',
    'POSTERN_MIGRATOR_ROLE',
    'POSTERN_MIGRATOR_PASSWORD',
    'POSTERN_APP_ROLE',
    'POSTERN_APP_PASSWORD'
)
$previousEnvironment = @{}

foreach ($name in $requiredSettings) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

Push-Location $repositoryRoot
try {
    $configuration = docker compose config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw 'Reading the Compose database configuration failed.'
    }

    $settings = $configuration.services.db.environment

    foreach ($name in $requiredSettings) {
        $value = $settings.$name
        if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith('replace-with-', [StringComparison]::OrdinalIgnoreCase)) {
            throw "Set a local value for $name in env\db.env before initializing database roles."
        }

        Set-Item -Path "Env:$name" -Value $value
    }

    Get-Content -Raw 'database\init\10-postern-roles.sql' |
        docker compose exec -T `
            -e POSTGRES_USER `
            -e POSTGRES_DB `
            -e POSTERN_MIGRATOR_ROLE `
            -e POSTERN_MIGRATOR_PASSWORD `
            -e POSTERN_APP_ROLE `
            -e POSTERN_APP_PASSWORD `
            db psql -v ON_ERROR_STOP=1 --username $settings.POSTGRES_USER --dbname $settings.POSTGRES_DB

    if ($LASTEXITCODE -ne 0) {
        throw 'Database role initialization failed.'
    }
}
finally {
    foreach ($name in $requiredSettings) {
        $previousValue = $previousEnvironment[$name]
        if ($null -eq $previousValue) {
            Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item -Path "Env:$name" -Value $previousValue
        }
    }

    Pop-Location
}
