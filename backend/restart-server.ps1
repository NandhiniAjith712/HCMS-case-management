Write-Host "Stopping server on port 5000..." -ForegroundColor Yellow

# Find and stop the process on port 5000
$processes = Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object -ExpandProperty OwningProcess
foreach ($pid in $processes) {
    Write-Host "Stopping process $pid" -ForegroundColor Red
    Stop-Process -Id $pid -Force
}

Write-Host "Waiting 3 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "Starting server..." -ForegroundColor Green
node server.js
