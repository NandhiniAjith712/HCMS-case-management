# PowerShell script to execute SQL commands directly
Write-Host "🗑️  Executing ticket deletion SQL..." -ForegroundColor Yellow

# Database connection parameters
$server = "localhost"
$database = "tick_system"
$username = "root"
$password = ""

try {
    # Try to load MySQL .NET connector
    try {
        [System.Reflection.Assembly]::LoadWithPartialName("MySql.Data") | Out-Null
        $connectionString = "Server=$server;Database=$database;Uid=$username;Pwd=$password;"
        $connection = New-Object MySql.Data.MySqlClient.MySqlConnection($connectionString)
        $connection.Open()
        Write-Host "✅ Connected to MySQL database successfully" -ForegroundColor Green
        
        $command = $connection.CreateCommand()
        
        # Execute the SQL commands
        Write-Host "🔄 Disabling safe update mode..." -ForegroundColor Blue
        $command.CommandText = "SET SQL_SAFE_UPDATES = 0"
        $command.ExecuteNonQuery()
        
        Write-Host "🔄 Starting transaction..." -ForegroundColor Blue
        $command.CommandText = "START TRANSACTION"
        $command.ExecuteNonQuery()
        
        Write-Host "🗑️  Deleting from assigned table..." -ForegroundColor Yellow
        $command.CommandText = "DELETE FROM assigned"
        $command.ExecuteNonQuery()
        
        Write-Host "🗑️  Deleting from tickets table..." -ForegroundColor Yellow
        $command.CommandText = "DELETE FROM tickets"
        $command.ExecuteNonQuery()
        
        Write-Host "🔄 Re-enabling safe update mode..." -ForegroundColor Blue
        $command.CommandText = "SET SQL_SAFE_UPDATES = 1"
        $command.ExecuteNonQuery()
        
        Write-Host "✅ Committing transaction..." -ForegroundColor Green
        $command.CommandText = "COMMIT"
        $command.ExecuteNonQuery()
        
        # Verify deletion
        Write-Host "🔍 Verifying deletion..." -ForegroundColor Blue
        
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
        
        Write-Host "✅ Tickets after deletion: $ticketCount" -ForegroundColor Green
        Write-Host "✅ Assignments after deletion: $assignedCount" -ForegroundColor Green
        
        Write-Host "`n🎉 SUCCESS: All tickets deleted successfully!" -ForegroundColor Green
        Write-Host "✅ Database structure preserved" -ForegroundColor Green
        Write-Host "✅ You can now test ticket creation and assignment functionality" -ForegroundColor Green
        
    } catch {
        Write-Host "❌ MySQL .NET connector not available" -ForegroundColor Red
        Write-Host "📝 Please run the SQL manually in MySQL Workbench:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "1. Open MySQL Workbench" -ForegroundColor White
        Write-Host "2. Connect to your tick_system database" -ForegroundColor White
        Write-Host "3. Copy and paste the content from clear-tickets-simple.sql" -ForegroundColor White
        Write-Host "4. Execute the script" -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($connection -and $connection.State -eq "Open") {
        $connection.Close()
        Write-Host "🔌 Database connection closed" -ForegroundColor Blue
    }
}
