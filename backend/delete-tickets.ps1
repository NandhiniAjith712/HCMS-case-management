# PowerShell script to delete all tickets while preserving database structure
Write-Host "🗑️  Starting ticket deletion process..." -ForegroundColor Yellow

# Database connection parameters
$server = "localhost"
$database = "tick_system"
$username = "root"
$password = ""

try {
    # Create MySQL connection string
    $connectionString = "Server=$server;Database=$database;Uid=$username;Pwd=$password;"
    
    Write-Host "🔌 Connecting to database..." -ForegroundColor Blue
    
    # Load MySQL .NET connector (if available)
    try {
        [System.Reflection.Assembly]::LoadWithPartialName("MySql.Data") | Out-Null
        $connection = New-Object MySql.Data.MySqlClient.MySqlConnection($connectionString)
        $connection.Open()
        Write-Host "✅ Connected to MySQL database successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ MySQL .NET connector not available, trying alternative method..." -ForegroundColor Red
        
        # Alternative: Use mysql command line
        Write-Host "📝 Using MySQL command line approach..." -ForegroundColor Yellow
        
        # Create SQL file
        $sqlContent = @"
-- Delete all tickets and related data
-- This preserves database structure while removing ticket data

-- Start transaction
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
"@
        
        $sqlContent | Out-File -FilePath "delete-tickets.sql" -Encoding UTF8
        Write-Host "📄 SQL file created: delete-tickets.sql" -ForegroundColor Green
        
        Write-Host "🚀 Execute this SQL file in your MySQL client:" -ForegroundColor Yellow
        Write-Host "mysql -u root -p tick_system < delete-tickets.sql" -ForegroundColor Cyan
        
        return
    }
    
    # If we get here, we have a connection
    Write-Host "📊 Checking current database state..." -ForegroundColor Blue
    
    # Check current counts
    $command = $connection.CreateCommand()
    
    $command.CommandText = "SELECT COUNT(*) as count FROM tickets"
    $reader = $command.ExecuteReader()
    $reader.Read()
    $ticketCount = $reader["count"]
    $reader.Close()
    
    $command.CommandText = "SELECT COUNT(*) as count FROM assigned"
    $reader = $command.ExecuteReader()
    $reader.Read()
    $assignedCount = $reader["count"]
    $reader.Close()
    
    Write-Host "Current tickets: $ticketCount" -ForegroundColor White
    Write-Host "Current assignments: $assignedCount" -ForegroundColor White
    
    # Ask for confirmation
    Write-Host "`n⚠️  WARNING: This will delete ALL tickets and related data!" -ForegroundColor Red
    Write-Host "This action cannot be undone." -ForegroundColor Red
    Write-Host "`nTables that will be affected:" -ForegroundColor Yellow
    Write-Host "- tickets (main ticket data)" -ForegroundColor White
    Write-Host "- assigned (ticket assignments)" -ForegroundColor White
    Write-Host "- tick_system_replies (ticket replies)" -ForegroundColor White
    Write-Host "- tick_system_whatsapp_messages (WhatsApp messages)" -ForegroundColor White
    
    $confirmation = Read-Host "`nType 'YES' to confirm deletion"
    if ($confirmation -ne "YES") {
        Write-Host "❌ Deletion cancelled by user" -ForegroundColor Red
        return
    }
    
    Write-Host "`n🔄 Starting deletion process..." -ForegroundColor Yellow
    
    # Start transaction
    $command.CommandText = "START TRANSACTION"
    $command.ExecuteNonQuery()
    
    # Delete in order
    Write-Host "🗑️  Deleting ticket assignments..." -ForegroundColor Yellow
    $command.CommandText = "DELETE FROM assigned"
    $command.ExecuteNonQuery()
    
    Write-Host "🗑️  Deleting ticket replies..." -ForegroundColor Yellow
    $command.CommandText = "DELETE FROM tick_system_replies"
    $command.ExecuteNonQuery()
    
    Write-Host "🗑️  Deleting WhatsApp messages..." -ForegroundColor Yellow
    $command.CommandText = "DELETE FROM tick_system_whatsapp_messages"
    $command.ExecuteNonQuery()
    
    Write-Host "🗑️  Deleting main tickets..." -ForegroundColor Yellow
    $command.CommandText = "DELETE FROM tickets"
    $command.ExecuteNonQuery()
    
    # Commit transaction
    $command.CommandText = "COMMIT"
    $command.ExecuteNonQuery()
    
    Write-Host "✅ Transaction committed successfully" -ForegroundColor Green
    
    # Verify deletion
    Write-Host "`n🔍 Verifying deletion..." -ForegroundColor Blue
    
    $command.CommandText = "SELECT COUNT(*) as count FROM tickets"
    $reader = $command.ExecuteReader()
    $reader.Read()
    $newTicketCount = $reader["count"]
    $reader.Close()
    
    Write-Host "✅ Tickets after deletion: $newTicketCount" -ForegroundColor Green
    
    Write-Host "`n🎉 SUCCESS: All tickets deleted successfully!" -ForegroundColor Green
    Write-Host "✅ Database structure preserved" -ForegroundColor Green
    Write-Host "✅ Other data (agents, products, modules, SLA) preserved" -ForegroundColor Green
    Write-Host "✅ You can now test ticket creation and assignment functionality" -ForegroundColor Green
    
}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace: $($_.Exception.StackTrace)" -ForegroundColor Red
}
finally {
    if ($connection -and $connection.State -eq "Open") {
        $connection.Close()
        Write-Host "🔌 Database connection closed" -ForegroundColor Blue
    }
    
    # Clean up SQL file if it was created
    if (Test-Path "delete-tickets.sql") {
        Remove-Item "delete-tickets.sql"
        Write-Host "🧹 SQL file cleaned up" -ForegroundColor Blue
    }
}
