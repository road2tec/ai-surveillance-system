# Creates server/.env, ai-service/.env and client/.env from the examples (never overwrites existing files)
# and replaces the placeholder secrets with fresh random values. The ingest key is shared by server and AI service.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function New-Secret([int]$bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $_.ToString('x2') })
}

foreach ($app in 'server', 'ai-service', 'client') {
  $envFile = Join-Path $root "$app\.env"
  if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root "$app\.env.example") $envFile
    Write-Host "[OK] created $app\.env"
  } else {
    Write-Host "[--] $app\.env already exists, kept as is"
  }
}

$serverEnv = Join-Path $root 'server\.env'
$aiEnv = Join-Path $root 'ai-service\.env'
$server = Get-Content $serverEnv -Raw
$ai = Get-Content $aiEnv -Raw

if ($server -match 'JWT_SECRET=replace-with-a-long-random-string') {
  $server = $server -replace 'JWT_SECRET=.*', ('JWT_SECRET=' + (New-Secret 48))
  Write-Host '[OK] generated JWT_SECRET'
}
if ($server -match 'INGEST_API_KEY=change-me-ingest-key') {
  $server = $server -replace 'INGEST_API_KEY=.*', ('INGEST_API_KEY=' + (New-Secret 24))
  Write-Host '[OK] generated INGEST_API_KEY'
}
# Keep the AI service key identical to the server's.
$key = [regex]::Match($server, 'INGEST_API_KEY=(.*)').Groups[1].Value.Trim()
$ai = $ai -replace 'INGEST_API_KEY=.*', "INGEST_API_KEY=$key"

# UTF-8 without BOM: Windows PowerShell's "-Encoding utf8" adds one, which corrupts the first variable name.
$utf8 = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText($serverEnv, $server.TrimEnd() + "`r`n", $utf8)
[IO.File]::WriteAllText($aiEnv, $ai.TrimEnd() + "`r`n", $utf8)
Write-Host '[OK] server and AI service share the same INGEST_API_KEY'
