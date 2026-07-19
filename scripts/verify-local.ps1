param(
  [string]$DatabaseName = ("online_shop_verify_" + (Get-Date -Format "yyyyMMddHHmmss")),
  [string]$PostgresUser = "postgres",
  [string]$PostgresPassword = "postgres",
  [int]$ApiPort = 3110,
  [int]$AppPort = 5190
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $root "Api"
$appDir = Join-Path $root "App"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$createdb = "C:\Program Files\PostgreSQL\17\bin\createdb.exe"
$apiProcess = $null
$appProcess = $null

function Stop-PortProcess([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 } |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue }
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Url"
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  if (!(Test-Path $psql) -or !(Test-Path $createdb)) {
    throw "PostgreSQL CLI tools not found at C:\Program Files\PostgreSQL\17\bin. Install PostgreSQL locally or update this script path."
  }

  Write-Host "== Local deploy verification =="
  Write-Host "Database: $DatabaseName"
  Write-Host "API: http://127.0.0.1:$ApiPort"
  Write-Host "App: http://127.0.0.1:$AppPort"

  Stop-PortProcess $ApiPort
  Stop-PortProcess $AppPort

  $env:PGPASSWORD = $PostgresPassword
  & $createdb -h localhost -p 5432 -U $PostgresUser $DatabaseName
  if ($LASTEXITCODE -ne 0) {
    throw "createdb failed with exit code $LASTEXITCODE"
  }

  $databaseUrl = "postgresql://${PostgresUser}:${PostgresPassword}@localhost:5432/${DatabaseName}?schema=public"

  Push-Location $apiDir
  try {
    $env:DATABASE_URL = $databaseUrl
    Invoke-Checked "npm.cmd" @("run", "prisma:validate")
    Invoke-Checked "npm.cmd" @("run", "prisma:deploy")
    Invoke-Checked "npm.cmd" @("run", "typecheck")
    Invoke-Checked "npm.cmd" @("run", "build")
  } finally {
    Pop-Location
  }

  Push-Location $appDir
  try {
    Invoke-Checked "npm.cmd" @("run", "lint")
    Invoke-Checked "npm.cmd" @("run", "typecheck")
    Invoke-Checked "npm.cmd" @("run", "test")
    Invoke-Checked "npm.cmd" @("run", "build")
  } finally {
    Pop-Location
  }

  $apiEnv = @{
    DATABASE_URL = $databaseUrl
    JWT_SECRET = "local_verify_secret_not_for_git"
    NODE_ENV = "development"
    PORT = "$ApiPort"
  }

  foreach ($key in $apiEnv.Keys) {
    [Environment]::SetEnvironmentVariable($key, $apiEnv[$key], "Process")
  }
  $apiProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -WorkingDirectory $apiDir -PassThru -WindowStyle Hidden

  [Environment]::SetEnvironmentVariable("VITE_API_BASE_URL", "http://127.0.0.1:$ApiPort", "Process")
  $appProcess = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$AppPort") -WorkingDirectory $appDir -PassThru -WindowStyle Hidden

  Wait-HttpOk "http://127.0.0.1:$ApiPort/health"
  Wait-HttpOk "http://127.0.0.1:$AppPort"

  Push-Location $appDir
  try {
    $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:$AppPort"
    Invoke-Checked "node.exe" @(".\scripts\local-smoke-test.cjs")
  } finally {
    Pop-Location
  }

  Write-Host "== Local verification passed. Deploy is safe to do manually. =="
} finally {
  if ($apiProcess) { Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue }
  if ($appProcess) { Stop-Process -Id $appProcess.Id -ErrorAction SilentlyContinue }
  Stop-PortProcess $ApiPort
  Stop-PortProcess $AppPort
}
