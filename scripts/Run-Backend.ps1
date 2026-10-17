$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'backend')
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
$env:CORS_ORIGINS = 'http://localhost:5188,http://127.0.0.1:5188'
$env:SECRET_KEY = 'local-only-recurscope-demo-key-change-before-deployment'
Write-Host 'RecurScope API starting on http://127.0.0.1:8018' -ForegroundColor Cyan
& $python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8018
