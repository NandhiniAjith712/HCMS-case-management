Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ITSM Backend Server Auto-Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to the script directory
Set-Location $PSScriptRoot

Write-Host "Starting backend server..." -ForegroundColor Green
Write-Host ""

try {
    # Start the server
    node server.js
} catch {
    Write-Host "Error starting server: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Server stopped. Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
