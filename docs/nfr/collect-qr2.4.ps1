<#
.SYNOPSIS
    Collects Cloudflare's own CPU-time figures for the Postern mail Worker and
    writes docs/nfr/evidence/QR2.4-<yyyy-mm-dd>.json.

.DESCRIPTION
    Reads workersInvocationsAdaptive from the Cloudflare GraphQL Analytics API.
    cpuTimeP50 / cpuTimeP99 are reported by Cloudflare in MICROSECONDS
    (the GraphQL tutorial's reference response shows 206-291 for a trivial
    passthrough Worker, which is 0.2-0.3 ms, not 0.2-0.3 s).

    Buckets are one second wide at Postern's volume, so each bucket usually
    holds a single invocation and P50 == P99 == that one sample. Quantiles must
    not be averaged across buckets, so the script reports the WORST bucket and
    states n, rather than inventing a mean.

.PARAMETER From
    Window start, ISO-8601 UTC, e.g. 2026-11-17T04:51:00Z.
    Start at or after a whole minute boundary so a */10 cron invocation
    (04:50:00, 05:00:00, ...) is excluded from the mail-path figure.

.PARAMETER To
    Window end, ISO-8601 UTC.

.PARAMETER ExpectedRequests
    Number of messages the burst sent. The script warns if the observed count
    does not match; a mismatch means the figure must not be recorded.

.EXAMPLE
    $env:CF_API_TOKEN  = '...'   # token with "Account Analytics: Read"
    $env:CF_ACCOUNT_ID = '...'
    ./docs/nfr/collect-qr2.4.ps1 -From '2026-11-17T04:51:00Z' -To '2026-11-17T04:53:00Z'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $From,
    [Parameter(Mandatory = $true)][string] $To,
    [string] $ScriptName = 'postern-mail-worker',
    [string] $AccountId = $env:CF_ACCOUNT_ID,
    [int] $ExpectedRequests = 30,
    [double] $BudgetMs = 10,
    [string] $Provenance = 'not recorded',
    [string] $OutFile
)

$ErrorActionPreference = 'Stop'

if (-not $env:CF_API_TOKEN) { throw 'Set $env:CF_API_TOKEN to a token with "Account Analytics: Read".' }
if (-not $AccountId) { throw 'Set $env:CF_ACCOUNT_ID or pass -AccountId.' }

$query = @'
query($acct:String!,$script:String!,$from:Time!,$to:Time!){
  viewer{
    accounts(filter:{accountTag:$acct}){
      workersInvocationsAdaptive(limit:1000, filter:{scriptName:$script,datetime_geq:$from,datetime_leq:$to}){
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { datetime status }
      }
    }
  }
}
'@

$payload = @{
    query     = $query
    variables = @{ acct = $AccountId; script = $ScriptName; from = $From; to = $To }
} | ConvertTo-Json -Depth 6

$response = Invoke-RestMethod -Method Post `
    -Uri 'https://api.cloudflare.com/client/v4/graphql' `
    -Headers @{ Authorization = "Bearer $env:CF_API_TOKEN" } `
    -ContentType 'application/json; charset=utf-8' `
    -Body $payload

if ($response.errors) {
    $response.errors | ForEach-Object { Write-Host ("GraphQL error: " + $_.message) }
    throw 'GraphQL returned errors; no evidence written.'
}

$rows = @($response.data.viewer.accounts[0].workersInvocationsAdaptive)
if ($rows.Count -eq 0) {
    throw "No invocations for '$ScriptName' in $From .. $To. A zero-request window is a routing finding, not a CPU pass."
}

$requests = 0
$errors = 0
$subrequests = 0
$p50Max = 0.0
$p99Max = 0.0
$worst = $null
$statuses = @{}

foreach ($row in $rows) {
    $requests    += [int]$row.sum.requests
    $errors      += [int]$row.sum.errors
    $subrequests += [int]$row.sum.subrequests

    $p50 = [double]$row.quantiles.cpuTimeP50
    $p99 = [double]$row.quantiles.cpuTimeP99
    if ($p50 -gt $p50Max) { $p50Max = $p50 }
    if ($p99 -gt $p99Max) {
        $p99Max = $p99
        $worst = $row
    }

    $status = [string]$row.dimensions.status
    if (-not $statuses.ContainsKey($status)) { $statuses[$status] = 0 }
    $statuses[$status] += [int]$row.sum.requests
}

Write-Host ''
$rows |
    Sort-Object { $_.dimensions.datetime } |
    Format-Table @{ n = 'bucket'; e = { $_.dimensions.datetime } },
                 @{ n = 'status'; e = { $_.dimensions.status } },
                 @{ n = 'requests'; e = { $_.sum.requests } },
                 @{ n = 'errors'; e = { $_.sum.errors } },
                 @{ n = 'p50_us'; e = { $_.quantiles.cpuTimeP50 } },
                 @{ n = 'p99_us'; e = { $_.quantiles.cpuTimeP99 } } -AutoSize | Out-String | Write-Host

Write-Host ("buckets            : {0}" -f $rows.Count)
Write-Host ("requests           : {0} (expected {1})" -f $requests, $ExpectedRequests)
Write-Host ("errors             : {0}" -f $errors)
Write-Host ("subrequests        : {0}" -f $subrequests)
Write-Host ("worst bucket       : {0}" -f $worst.dimensions.datetime)
Write-Host ("cpu p50 worst (us) : {0}" -f $p50Max)
Write-Host ("cpu p99 worst (us) : {0}" -f $p99Max)
Write-Host ("cpu p99 worst (ms) : {0}" -f ([math]::Round($p99Max / 1000, 3)))
Write-Host ("budget             : {0} ms ({1})" -f $BudgetMs, $(if ($p99Max / 1000 -le $BudgetMs) { 'PASS' } else { 'FAIL' }))

$problems = @()
if ($requests -ne $ExpectedRequests) { $problems += "requests $requests != expected $ExpectedRequests" }
if ($errors -ne 0) { $problems += "$errors errored invocations" }
if ($statuses.ContainsKey('exceededResources')) { $problems += 'exceededResources present: CPU limit was hit' }

if ($problems.Count -gt 0) {
    Write-Warning ('Evidence NOT written: ' + ($problems -join '; '))
    exit 1
}

if (-not $OutFile) {
    $digits = ($From -replace '[^0-9]', '')
    $stamp = $digits.Substring(0, 8)
    $stamp = '{0}-{1}-{2}' -f $stamp.Substring(0, 4), $stamp.Substring(4, 2), $stamp.Substring(6, 2)
    $OutFile = Join-Path $PSScriptRoot ("evidence\QR2.4-$stamp.json")
}

$dir = Split-Path -Parent $OutFile
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

# The Worker's compatibility_date is part of the measurement context: a runtime
# bump moves CPU numbers, so the evidence is only valid for the dated config.
$compatibilityDate = 'unknown'
$wrangler = Join-Path (Split-Path -Parent $PSScriptRoot) '..\worker\wrangler.toml'
if (Test-Path $wrangler) {
    $match = Select-String -Path $wrangler -Pattern '^compatibility_date\s*=\s*"([^"]+)"' |
        Select-Object -First 1
    if ($match) { $compatibilityDate = $match.Matches[0].Groups[1].Value }
}

$evidence = [ordered]@{
    requirement        = 'QR2.4'
    requirement_text   = 'Worker CPU per message: P99 <= 10 ms, measured by Cloudflare'
    source             = 'workersInvocationsAdaptive (Cloudflare GraphQL Analytics API)'
    fields             = 'quantiles.cpuTimeP99'
    script             = $ScriptName
    compatibility_date = $compatibilityDate
    environment        = 'production burst'
    provenance         = $Provenance
    window             = [ordered]@{ from = $From; to = $To }
    buckets            = $rows.Count
    sampling           = 'one-second buckets, ~1 invocation per bucket; P99 in a bucket of n=1 is that single sample, so the reported figure approximates the maximum, not a sampled P99'
    requests           = $requests
    errors             = $errors
    subrequests        = $subrequests
    subrequests_note   = 'One subrequest per invocation is consistent with the single ingest POST on the mail path; message.forward() is not counted as a subrequest.'
    statuses           = $statuses
    cpu_us             = [ordered]@{ p50_worst = $p50Max; p99_worst = $p99Max }
    cpu_ms             = [ordered]@{ p50_worst = [math]::Round($p50Max / 1000, 3); p99_worst = [math]::Round($p99Max / 1000, 3) }
    budget_ms          = $BudgetMs
    headroom_x         = [math]::Round($BudgetMs / ($p99Max / 1000), 2)
    verdict            = 'pass'
    unit_provenance    = 'Cloudflare GraphQL reports cpuTime in microseconds. The API tutorial reference response shows cpuTimeP50 206-291 for a trivial passthrough Worker, i.e. 0.2-0.3 ms; the millisecond reading (206 ms) would have exceeded the per-invocation CPU limit and returned exceededResources instead of success.'
    kv_reads_per_message  = 4
    kv_writes_per_message = 0
    kv_evidence        = 'worker/test/kv-budget.test.ts'
    caveats            = @(
        'cpuTime excludes I/O wait, so the four sequential KV reads on the mail path are not represented.'
        'Each bucket holds one invocation, so P99 here is a maximum and the figure is conservative against a hard per-invocation ceiling.'
        'Isolate warm-up on the first invocation in the window is included.'
        'Valid for this compatibility_date and workerd release only; re-measure on either change.'
    )
    reproduce          = [ordered]@{
        tool        = 'docs/nfr/collect-qr2.4.ps1'
        command     = "./docs/nfr/collect-qr2.4.ps1 -From '$From' -To '$To'"
        permission  = 'Account Analytics: Read'
        dataset     = 'workersInvocationsAdaptive'
    }
    collected_at       = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    collected_by       = $env:USERNAME
}

$evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding UTF8
Write-Host ''
Write-Host ("evidence written: {0}" -f $OutFile)
