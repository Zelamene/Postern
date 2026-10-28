$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previousConnectionString = [Environment]::GetEnvironmentVariable('POSTERN_MIGRATOR_CONNECTION_STRING', 'Process')

Push-Location $repositoryRoot
try {
    $configuration = docker compose config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw 'Reading the Compose database configuration failed.'
    }

    $settings = $configuration.services.db.environment
    foreach ($name in @('POSTGRES_DB', 'POSTERN_MIGRATOR_ROLE', 'POSTERN_MIGRATOR_PASSWORD')) {
        $value = $settings.$name
        if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith('replace-with-', [StringComparison]::OrdinalIgnoreCase)) {
            throw "Set a local value for $name in env\db.env before applying migrations."
        }
    }

    $connection = [System.Data.Common.DbConnectionStringBuilder]::new()
    $connection['Host'] = 'localhost'
    $connection['Port'] = '5432'
    $connection['Database'] = $settings.POSTGRES_DB
    $connection['Username'] = $settings.POSTERN_MIGRATOR_ROLE
    $connection['Password'] = $settings.POSTERN_MIGRATOR_PASSWORD
    $connection['Search Path'] = 'postern'
    $env:POSTERN_MIGRATOR_CONNECTION_STRING = $connection.ConnectionString

    dotnet tool restore
    if ($LASTEXITCODE -ne 0) {
        throw 'Restoring the local dotnet tools failed.'
    }

    dotnet ef database update --project backend\src\Postern.Infrastructure --startup-project backend\src\Postern.Api
    if ($LASTEXITCODE -ne 0) {
        throw 'Applying the EF Core migrations failed.'
    }
}
finally {
    if ($null -eq $previousConnectionString) {
        Remove-Item Env:\POSTERN_MIGRATOR_CONNECTION_STRING -ErrorAction SilentlyContinue
    }
    else {
        $env:POSTERN_MIGRATOR_CONNECTION_STRING = $previousConnectionString
    }

    Pop-Location
}
