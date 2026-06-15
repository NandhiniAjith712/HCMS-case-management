# Multitenancy Testing Script
# This script helps you test multitenancy with your actual credentials

Write-Host "`n=== MULTITENANCY TESTING SCRIPT ===" -ForegroundColor Cyan
Write-Host "`nSTEP 1: First, get your user credentials from database" -ForegroundColor Yellow
Write-Host "Run these SQL queries to find users:" -ForegroundColor White
Write-Host "`n-- For Tenant 1:" -ForegroundColor Green
Write-Host "SELECT id, name, email, login_id, role, tenant_id FROM agents WHERE tenant_id = 1;" -ForegroundColor Gray
Write-Host "SELECT id, name, email, role, tenant_id FROM users WHERE tenant_id = 1;" -ForegroundColor Gray
Write-Host "`n-- For Tenant 2:" -ForegroundColor Green
Write-Host "SELECT id, name, email, login_id, role, tenant_id FROM agents WHERE tenant_id = 2;" -ForegroundColor Gray
Write-Host "SELECT id, name, email, role, tenant_id FROM users WHERE tenant_id = 2;" -ForegroundColor Gray

Write-Host "`n`nSTEP 2: Enter your test credentials below" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Gray

# Get credentials from user
$tenant1Email = Read-Host "Enter Tenant 1 user email/login_id"
$tenant1Password = Read-Host "Enter Tenant 1 password" -AsSecureString
$tenant1PasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($tenant1Password))

$tenant2Email = Read-Host "`nEnter Tenant 2 user email/login_id"
$tenant2Password = Read-Host "Enter Tenant 2 password" -AsSecureString
$tenant2PasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($tenant2Password))

# Initialize variables
$token1 = $null
$token2 = $null
$tenant1Id = $null
$tenant2Id = $null

Write-Host "`n`n=== TESTING TENANT 1 LOGIN ===" -ForegroundColor Cyan
Write-Host "Attempting login for Tenant 1..." -ForegroundColor Yellow

try {
    $loginData1 = @{
        login_id = $tenant1Email
        password = $tenant1PasswordPlain
    } | ConvertTo-Json

    $headers1 = @{
        "Content-Type" = "application/json"
        "X-Tenant-ID" = "1"
    }

    $response1 = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/global-login" `
        -Method POST `
        -Headers $headers1 `
        -Body $loginData1 `
        -ErrorAction Stop

    Write-Host "✅ Tenant 1 Login SUCCESS!" -ForegroundColor Green
    Write-Host "   User: $($response1.data.user.name)" -ForegroundColor White
    Write-Host "   Email: $($response1.data.user.email)" -ForegroundColor White
    Write-Host "   Role: $($response1.data.user.role)" -ForegroundColor White
    Write-Host "   Tenant ID: $($response1.data.user.tenant_id)" -ForegroundColor Cyan
    Write-Host "   Token: $($response1.data.token.Substring(0, 30))..." -ForegroundColor Gray
    
    $token1 = $response1.data.token
    $tenant1Id = $response1.data.user.tenant_id

    # Test getting tickets for tenant 1
    Write-Host "`n📋 Testing Ticket Retrieval for Tenant 1..." -ForegroundColor Yellow
    $ticketHeaders1 = @{
        "Authorization" = "Bearer $token1"
        "X-Tenant-ID" = $tenant1Id.ToString()
        "Content-Type" = "application/json"
    }

    $tickets1 = Invoke-RestMethod -Uri "http://localhost:5000/api/tickets" `
        -Method GET `
        -Headers $ticketHeaders1 `
        -ErrorAction Stop

    Write-Host "✅ Retrieved $($tickets1.data.Count) tickets for Tenant 1" -ForegroundColor Green
    if ($tickets1.data.Count -gt 0) {
        Write-Host "   Sample tickets:" -ForegroundColor White
        foreach ($ticket in ($tickets1.data | Select-Object -First 3)) {
            Write-Host "   - Ticket #$($ticket.id): $($ticket.issue_title) (Tenant: $($ticket.tenant_id))" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Tenant 1 Login FAILED!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) {
        try {
            $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host "   Details: $($errorDetails.message)" -ForegroundColor Yellow
        } catch {
            Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
        }
    }
    $token1 = $null
}

Write-Host "`n`n=== TESTING TENANT 2 LOGIN ===" -ForegroundColor Cyan
Write-Host "Attempting login for Tenant 2..." -ForegroundColor Yellow

try {
    $loginData2 = @{
        login_id = $tenant2Email
        password = $tenant2PasswordPlain
    } | ConvertTo-Json

    $headers2 = @{
        "Content-Type" = "application/json"
        "X-Tenant-ID" = "2"
    }

    $response2 = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/global-login" `
        -Method POST `
        -Headers $headers2 `
        -Body $loginData2 `
        -ErrorAction Stop

    Write-Host "✅ Tenant 2 Login SUCCESS!" -ForegroundColor Green
    Write-Host "   User: $($response2.data.user.name)" -ForegroundColor White
    Write-Host "   Email: $($response2.data.user.email)" -ForegroundColor White
    Write-Host "   Role: $($response2.data.user.role)" -ForegroundColor White
    Write-Host "   Tenant ID: $($response2.data.user.tenant_id)" -ForegroundColor Cyan
    Write-Host "   Token: $($response2.data.token.Substring(0, 30))..." -ForegroundColor Gray
    
    $token2 = $response2.data.token
    $tenant2Id = $response2.data.user.tenant_id

    # Test getting tickets for tenant 2
    Write-Host "`n📋 Testing Ticket Retrieval for Tenant 2..." -ForegroundColor Yellow
    $ticketHeaders2 = @{
        "Authorization" = "Bearer $token2"
        "X-Tenant-ID" = $tenant2Id.ToString()
        "Content-Type" = "application/json"
    }

    $tickets2 = Invoke-RestMethod -Uri "http://localhost:5000/api/tickets" `
        -Method GET `
        -Headers $ticketHeaders2 `
        -ErrorAction Stop

    Write-Host "✅ Retrieved $($tickets2.data.Count) tickets for Tenant 2" -ForegroundColor Green
    if ($tickets2.data.Count -gt 0) {
        Write-Host "   Sample tickets:" -ForegroundColor White
        foreach ($ticket in ($tickets2.data | Select-Object -First 3)) {
            Write-Host "   - Ticket #$($ticket.id): $($ticket.issue_title) (Tenant: $($ticket.tenant_id))" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Tenant 2 Login FAILED!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) {
        try {
            $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host "   Details: $($errorDetails.message)" -ForegroundColor Yellow
        } catch {
            Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
        }
    }
    $token2 = $null
}

Write-Host "`n`n=== TESTING CROSS-TENANT ACCESS (Security Test) ===" -ForegroundColor Cyan

if ($token1 -ne $null -and $token2 -ne $null) {
    Write-Host "Testing if Tenant 1 token can access Tenant 2 data..." -ForegroundColor Yellow
    
    try {
        $crossHeaders = @{
            "Authorization" = "Bearer $token1"
            "X-Tenant-ID" = "2"
            "Content-Type" = "application/json"
        }

        $crossTickets = Invoke-RestMethod -Uri "http://localhost:5000/api/tickets" `
            -Method GET `
            -Headers $crossHeaders `
            -ErrorAction Stop

        Write-Host "❌ SECURITY ISSUE: Cross-tenant access allowed!" -ForegroundColor Red
        Write-Host "   This should be blocked by verifyTenantAccess middleware" -ForegroundColor Yellow
    } catch {
        Write-Host "✅ SECURITY WORKING: Cross-tenant access blocked!" -ForegroundColor Green
        Write-Host "   Error (expected): $($_.Exception.Message)" -ForegroundColor Gray
    }
}
else {
    Write-Host "⚠️ Skipping cross-tenant test (one or both logins failed)" -ForegroundColor Yellow
}

Write-Host "`n`n=== TEST SUMMARY ===" -ForegroundColor Cyan
if ($token1 -ne $null) {
    Write-Host "✅ Tenant 1 Login: SUCCESS" -ForegroundColor Green
}
else {
    Write-Host "❌ Tenant 1 Login: FAILED" -ForegroundColor Red
}

if ($token2 -ne $null) {
    Write-Host "✅ Tenant 2 Login: SUCCESS" -ForegroundColor Green
}
else {
    Write-Host "❌ Tenant 2 Login: FAILED" -ForegroundColor Red
}

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Check browser localStorage after login" -ForegroundColor White
Write-Host "2. Test in browser DevTools Network tab" -ForegroundColor White
Write-Host "3. Verify tenant_id is stored in userData" -ForegroundColor White
Write-Host "4. Check all API calls include X-Tenant-ID header" -ForegroundColor White

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
