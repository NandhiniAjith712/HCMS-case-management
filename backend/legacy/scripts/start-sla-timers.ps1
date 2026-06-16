Write-Host "🚀 Starting SLA Timer Initialization..." -ForegroundColor Green
Write-Host ""

try {
    node initialize-sla-timers.js
} catch {
    Write-Host "❌ Error running SLA timer initialization: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
