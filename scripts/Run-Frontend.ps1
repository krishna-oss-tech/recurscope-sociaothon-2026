$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'frontend')
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8018'
Write-Host 'RecurScope Web starting on http://localhost:5188' -ForegroundColor Green
npm run dev
