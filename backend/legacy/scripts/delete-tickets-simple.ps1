# Simple PowerShell script to delete all tickets
Write-Host "🗑️  Starting ticket deletion process..." -ForegroundColor Yellow

# Create SQL file for deletion
$sqlContent = @"
-- Delete all tickets and related data
-- This preserves database structure while removing ticket data

-- Start transaction for safety
START TRANSACTION;

-- Delete in order to respect foreign key constraints
DELETE FROM assigned;
DELETE FROM tick_system_replies;
DELETE FROM tick_system_whatsapp_messages;
DELETE FROM tickets;

-- Commit transaction
COMMIT;

-- Verify deletion
SELECT 'Tickets after deletion:' as info, COUNT(*) as count FROM tickets;
SELECT 'Assignments after deletion:' as info, COUNT(*) as count FROM assigned;
SELECT 'Replies after deletion:' as info, COUNT(*) as count FROM tick_system_replies;
SELECT 'WhatsApp messages after deletion:' as info, COUNT(*) as count FROM tick_system_whatsapp_messages;

-- Check preserved data
SELECT 'Agents preserved:' as info, COUNT(*) as count FROM agents;
SELECT 'Products preserved:' as info, COUNT(*) as count FROM sla_products;
SELECT 'Modules preserved:' as info, COUNT(*) as count FROM sla_modules;
SELECT 'SLA configurations preserved:' as info, COUNT(*) as count FROM sla_configurations;

-- Show success message
SELECT 'SUCCESS: All tickets deleted! Database structure preserved.' as message;
"@

# Write SQL content to file
$sqlContent | Out-File -FilePath "delete-tickets-simple.sql" -Encoding UTF8
Write-Host "📄 SQL file created: delete-tickets-simple.sql" -ForegroundColor Green

Write-Host "`n🚀 Execute this SQL file in your MySQL client:" -ForegroundColor Yellow
Write-Host "mysql -u root -p tick_system < delete-tickets-simple.sql" -ForegroundColor Cyan

Write-Host "`n📝 Or copy-paste this SQL directly into MySQL Workbench:" -ForegroundColor Yellow
Write-Host $sqlContent -ForegroundColor White

Write-Host "`n✅ Script completed successfully!" -ForegroundColor Green
