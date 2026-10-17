$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$apiPort = 8018
$webPort = 5188

function Stop-WithMessage([string]$message) {
  Write-Host "`nSETUP STOPPED: $message" -ForegroundColor Red
  Write-Host 'Fix the named issue, then double-click START_RECURSCOPE.bat again.' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '         RecurScope MVP v0.5' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host 'Dedicated ports: Web 5188 | API 8018'
Write-Host 'This deliberately does not use JanSetu ports 5173 / 8000.'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-WithMessage 'Node.js was not found. Install Node.js 20+ and reopen this launcher.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-WithMessage 'npm was not found. Reinstall Node.js with npm and reopen this launcher.' }
if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) { Stop-WithMessage 'Python was not found. Install Python 3.11+ and enable PATH / Python Launcher.' }

foreach ($port in @($apiPort, $webPort)) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    $pids = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    Stop-WithMessage "Port $port is already in use (process ID $pids). Close the app using that port; the launcher will not attach RecurScope to another project's server."
  }
}

$venvPython = Join-Path $backend '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Host "`nCreating Python environment..." -ForegroundColor Yellow
  Push-Location $root
  try {
    if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv (Join-Path $backend '.venv') }
    else { & python -m venv (Join-Path $backend '.venv') }
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Could not create the backend virtual environment.' }
  } finally { Pop-Location }
}

Write-Host "`nChecking backend packages..." -ForegroundColor Yellow
& $venvPython -c 'import fastapi, uvicorn, sqlalchemy, pydantic, PIL, multipart'
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Installing backend requirements (first launch may take several minutes)...' -ForegroundColor Yellow
  & $venvPython -m pip install -r (Join-Path $backend 'requirements.txt')
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Backend dependency installation failed. Check internet access and the pip error in this window.' }
}

$viteBin = Join-Path $frontend 'node_modules\vite\bin\vite.js'
if (-not (Test-Path $viteBin)) {
  Write-Host "`nInstalling frontend packages (first launch may take several minutes)..." -ForegroundColor Yellow
  Push-Location $frontend
  try { & npm install; if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'npm install failed. Check internet access and the npm error in this window.' } }
  finally { Pop-Location }
}

$backendScript = Join-Path $PSScriptRoot 'Run-Backend.ps1'
$frontendScript = Join-Path $PSScriptRoot 'Run-Frontend.ps1'
Write-Host "`nStarting API..." -ForegroundColor Cyan
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $backend -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$backendScript`"") | Out-Null

$apiReady = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$apiPort/health" -TimeoutSec 2
    if ($health.ok -eq $true -and $health.service -eq 'recurscope-api') { $apiReady = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $apiReady) { Stop-WithMessage 'RecurScope API did not become healthy within 90 seconds. Read the RecurScope API terminal for the exact error; do not open JanSetu on port 5173 as a workaround.' }

Write-Host 'API health verified.' -ForegroundColor Green
Write-Host 'Starting RecurScope web app...' -ForegroundColor Cyan
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $frontend -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$frontendScript`"") | Out-Null
$webReady = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$webPort" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200 -and $response.Content -match 'RecurScope') { $webReady = $true; break }
    if ($response.StatusCode -eq 200) { $webReady = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $webReady) { Stop-WithMessage 'The RecurScope web server did not respond. Read the RecurScope Web terminal.' }

Write-Host "`nSUCCESS: RecurScope API and web server are responding." -ForegroundColor Green
Write-Host 'Opening http://localhost:5188 (NOT localhost:5173).' -ForegroundColor Green
Start-Process 'http://localhost:5188'
Write-Host 'Log in with admin / admin123. All seeded records are simulated.'
Write-Host 'Keep the RecurScope API and RecurScope Web terminal windows open while using the app.'
