# PowerShell script to help fix the password_hash field issue
Write-Host "🔧 Auto-Login Database Fix" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow
Write-Host ""

Write-Host "📋 Copy and paste this SQL into MySQL Workbench:" -ForegroundColor Green
Write-Host ""
Write-Host "ALTER TABLE agents MODIFY COLUMN password_hash VARCHAR(255) NULL;" -ForegroundColor White
Write-Host "ALTER TABLE agents ALTER COLUMN password_hash SET DEFAULT NULL;" -ForegroundColor White
Write-Host "UPDATE agents SET password_hash = NULL WHERE password_hash = '';" -ForegroundColor White
Write-Host ""

Write-Host "📝 Steps to fix:" -ForegroundColor Cyan
Write-Host "1. Open MySQL Workbench" -ForegroundColor White
Write-Host "2. Connect to your tick_system database" -ForegroundColor White
Write-Host "3. Create a new query tab (Ctrl+T)" -ForegroundColor White
Write-Host "4. Paste the SQL commands above" -ForegroundColor White
Write-Host "5. Execute the query (Ctrl+Shift+Enter)" -ForegroundColor White
Write-Host ""

Write-Host "✅ After running the SQL:" -ForegroundColor Green
Write-Host "- The auto-login should work without errors" -ForegroundColor White
Write-Host "- Try the auto-login URL again" -ForegroundColor White
Write-Host ""

Write-Host "🔗 Test URL:" -ForegroundColor Yellow
Write-Host "localhost:3000/auto-login/srihariharan220@gmail.com/GRC/8825734812" -ForegroundColor White
Write-Host ""

Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
