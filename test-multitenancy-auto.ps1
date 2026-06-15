# ============================================
# AUTOMATIC MULTITENANCY TESTING SCRIPT
# ============================================
# This script automatically tests multitenancy without manual input
# It tests: Login, Data Isolation, Cross-Tenant Security, API Endpoints
# ============================================

param(
    [string]$BaseUrl = "http://localhost:5000",
    [string]$Tenant1Email = "",
    [string]$Tenant1Password = "",
    [string]$Tenant2Email = "",
    [string]$Tenant2Password = "",
    [switch]$CreateTestData = $false
)

# Color output functions
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Test { param($msg) Write-Host $msg -ForegroundColor Magenta }

# Test results tracking
$script:TestResults = @{
    Total = 0
    Passed = 0
    Failed = 0
    Tests = @()
}

function Add-TestResult {
    param($TestName, $Passed, $Message, $Details = "")
    $script:TestResults.Total++
    if ($Passed) {
        $script:TestResults.Passed++
        Write-Success "✅ PASS: $TestName"
    } else {
        $script:TestResults.Failed++
        Write-Error "❌ FAIL: $TestName - $Message"
    }
    if ($Details) { Write-Host "   $Details" -ForegroundColor Gray }
    $script:TestResults.Tests += @{
        Name = $TestName
        Passed = $Passed
        Message = $Message
        Details = $Details
    }
}

# API Helper Functions
function Invoke-API {
    param(
        [string]$Method = "GET",
        [string]$Endpoint,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [switch]$IgnoreErrors = $false
    )
    
    try {
        $uri = "$BaseUrl$Endpoint"
        $params = @{
            Uri = $uri
            Method = $Method
            Headers = $Headers
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return @{ Success = $true; Data = $response; Error = $null }
    } catch {
        if ($IgnoreErrors) {
            return @{ Success = $false; Data = $null; Error = $_.Exception.Message }
        }
        $errorMsg = $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            try {
                $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
                $errorMsg = $errorDetails.message
            } catch {
                $errorMsg = $_.ErrorDetails.Message
            }
        }
        return @{ Success = $false; Data = $null; Error = $errorMsg }
    }
}

# ============================================
# PHASE 1: DISCOVER TEST USERS
# ============================================
Write-Info "`n=== PHASE 1: DISCOVERING TEST USERS ===" -ForegroundColor Cyan

$tenant1Creds = $null
$tenant2Creds = $null

# Try to find users in database via common test credentials
$commonTestUsers = @(
    @{ Tenant = 1; Email = "admin@tenant1.com"; Password = "password123"; LoginId = "admin1" },
    @{ Tenant = 1; Email = "user1@tenant1.com"; Password = "password123"; LoginId = "user1" },
    @{ Tenant = 1; Email = "agent1@tenant1.com"; Password = "password123"; LoginId = "agent1" },
    @{ Tenant = 2; Email = "admin@tenant2.com"; Password = "password123"; LoginId = "admin2" },
    @{ Tenant = 2; Email = "user2@tenant2.com"; Password = "password123"; LoginId = "user2" },
    @{ Tenant = 2; Email = "agent2@tenant2.com"; Password = "password123"; LoginId = "agent2" }
)

# Use provided credentials or try common test credentials
if ($Tenant1Email -and $Tenant1Password) {
    $tenant1Creds = @{ Email = $Tenant1Email; Password = $Tenant1Password; Tenant = 1 }
    Write-Info "Using provided Tenant 1 credentials: $Tenant1Email"
} else {
    Write-Warning "No Tenant 1 credentials provided. Trying common test credentials..."
    foreach ($user in $commonTestUsers | Where-Object { $_.Tenant -eq 1 }) {
        $tenant1Creds = @{ Email = $user.Email; Password = $user.Password; LoginId = $user.LoginId; Tenant = 1 }
        break
    }
}

if ($Tenant2Email -and $Tenant2Password) {
    $tenant2Creds = @{ Email = $Tenant2Email; Password = $Tenant2Password; Tenant = 2 }
    Write-Info "Using provided Tenant 2 credentials: $Tenant2Email"
} else {
    Write-Warning "No Tenant 2 credentials provided. Trying common test credentials..."
    foreach ($user in $commonTestUsers | Where-Object { $_.Tenant -eq 2 }) {
        $tenant2Creds = @{ Email = $user.Email; Password = $user.Password; LoginId = $user.LoginId; Tenant = 2 }
        break
    }
}

if (-not $tenant1Creds -or -not $tenant2Creds) {
    Write-Error "`n❌ ERROR: Could not determine test credentials!"
    Write-Host "`nPlease provide credentials using parameters:" -ForegroundColor Yellow
    Write-Host "  .\test-multitenancy-auto.ps1 -Tenant1Email 'user1@tenant1.com' -Tenant1Password 'pass' -Tenant2Email 'user2@tenant2.com' -Tenant2Password 'pass'" -ForegroundColor Gray
    Write-Host "`nOr ensure you have test users in the database with common credentials." -ForegroundColor Yellow
    exit 1
}

# ============================================
# PHASE 2: TEST LOGIN FOR BOTH TENANTS
# ============================================
Write-Info "`n=== PHASE 2: TESTING LOGIN ===" -ForegroundColor Cyan

$token1 = $null
$token2 = $null
$tenant1Id = $null
$tenant2Id = $null
$user1Data = $null
$user2Data = $null

# Test Tenant 1 Login
Write-Test "Testing Tenant 1 Login..."
$loginId1 = if ($tenant1Creds.LoginId) { $tenant1Creds.LoginId } else { $tenant1Creds.Email }
$loginBody1 = @{
    login_id = $loginId1
    password = $tenant1Creds.Password
} | ConvertTo-Json

$loginHeaders1 = @{
    "Content-Type" = "application/json"
    "X-Tenant-ID" = "1"
}

$loginResult1 = Invoke-API -Method POST -Endpoint "/api/auth/global-login" -Headers $loginHeaders1 -Body $loginBody1

if ($loginResult1.Success -and $loginResult1.Data.success) {
    $token1 = $loginResult1.Data.data.token
    $tenant1Id = $loginResult1.Data.data.user.tenant_id
    $user1Data = $loginResult1.Data.data.user
    Add-TestResult -TestName "Tenant 1 Login" -Passed $true -Message "Login successful" -Details "User: $($user1Data.name), Tenant ID: $tenant1Id"
} else {
    Add-TestResult -TestName "Tenant 1 Login" -Passed $false -Message $loginResult1.Error
    Write-Error "Cannot continue without Tenant 1 login. Please check credentials."
    exit 1
}

# Test Tenant 2 Login
Write-Test "Testing Tenant 2 Login..."
$loginId2 = if ($tenant2Creds.LoginId) { $tenant2Creds.LoginId } else { $tenant2Creds.Email }
$loginBody2 = @{
    login_id = $loginId2
    password = $tenant2Creds.Password
} | ConvertTo-Json

$loginHeaders2 = @{
    "Content-Type" = "application/json"
    "X-Tenant-ID" = "2"
}

$loginResult2 = Invoke-API -Method POST -Endpoint "/api/auth/global-login" -Headers $loginHeaders2 -Body $loginBody2

if ($loginResult2.Success -and $loginResult2.Data.success) {
    $token2 = $loginResult2.Data.data.token
    $tenant2Id = $loginResult2.Data.data.user.tenant_id
    $user2Data = $loginResult2.Data.data.user
    Add-TestResult -TestName "Tenant 2 Login" -Passed $true -Message "Login successful" -Details "User: $($user2Data.name), Tenant ID: $tenant2Id"
} else {
    Add-TestResult -TestName "Tenant 2 Login" -Passed $false -Message $loginResult2.Error
    Write-Error "Cannot continue without Tenant 2 login. Please check credentials."
    exit 1
}

# Verify tenant IDs in tokens
Write-Test "Verifying tenant_id in JWT tokens..."
if ($tenant1Id -eq 1 -and $tenant2Id -eq 2) {
    Add-TestResult -TestName "JWT Token Tenant ID" -Passed $true -Message "Tokens contain correct tenant_id"
} else {
    Add-TestResult -TestName "JWT Token Tenant ID" -Passed $false -Message "Token tenant_id mismatch: T1=$tenant1Id, T2=$tenant2Id"
}

# ============================================
# PHASE 3: TEST DATA ISOLATION - TICKETS
# ============================================
Write-Info "`n=== PHASE 3: TESTING DATA ISOLATION (TICKETS) ===" -ForegroundColor Cyan

# Get tickets for Tenant 1
Write-Test "Fetching tickets for Tenant 1..."
$ticketHeaders1 = @{
    "Authorization" = "Bearer $token1"
    "X-Tenant-ID" = $tenant1Id.ToString()
    "Content-Type" = "application/json"
}

$tickets1Result = Invoke-API -Method GET -Endpoint "/api/tickets" -Headers $ticketHeaders1
$tickets1 = @()
if ($tickets1Result.Success -and $tickets1Result.Data.success) {
    $tickets1 = $tickets1Result.Data.data
    Add-TestResult -TestName "Tenant 1 Tickets Retrieval" -Passed $true -Message "Retrieved $($tickets1.Count) tickets"
    
    # Verify all tickets belong to tenant 1
    $wrongTenantTickets = $tickets1 | Where-Object { $_.tenant_id -ne $tenant1Id }
    if ($wrongTenantTickets.Count -eq 0) {
        Add-TestResult -TestName "Tenant 1 Tickets Isolation" -Passed $true -Message "All tickets belong to Tenant 1"
    } else {
        Add-TestResult -TestName "Tenant 1 Tickets Isolation" -Passed $false -Message "Found $($wrongTenantTickets.Count) tickets from other tenants"
    }
} else {
    Add-TestResult -TestName "Tenant 1 Tickets Retrieval" -Passed $false -Message $tickets1Result.Error
}

# Get tickets for Tenant 2
Write-Test "Fetching tickets for Tenant 2..."
$ticketHeaders2 = @{
    "Authorization" = "Bearer $token2"
    "X-Tenant-ID" = $tenant2Id.ToString()
    "Content-Type" = "application/json"
}

$tickets2Result = Invoke-API -Method GET -Endpoint "/api/tickets" -Headers $ticketHeaders2
$tickets2 = @()
if ($tickets2Result.Success -and $tickets2Result.Data.success) {
    $tickets2 = $tickets2Result.Data.data
    Add-TestResult -TestName "Tenant 2 Tickets Retrieval" -Passed $true -Message "Retrieved $($tickets2.Count) tickets"
    
    # Verify all tickets belong to tenant 2
    $wrongTenantTickets = $tickets2 | Where-Object { $_.tenant_id -ne $tenant2Id }
    if ($wrongTenantTickets.Count -eq 0) {
        Add-TestResult -TestName "Tenant 2 Tickets Isolation" -Passed $true -Message "All tickets belong to Tenant 2"
    } else {
        Add-TestResult -TestName "Tenant 2 Tickets Isolation" -Passed $false -Message "Found $($wrongTenantTickets.Count) tickets from other tenants"
    }
} else {
    Add-TestResult -TestName "Tenant 2 Tickets Retrieval" -Passed $false -Message $tickets2Result.Error
}

# Verify no overlap between tenant tickets
if ($tickets1.Count -gt 0 -and $tickets2.Count -gt 0) {
    $ticketIds1 = $tickets1 | ForEach-Object { $_.id }
    $ticketIds2 = $tickets2 | ForEach-Object { $_.id }
    $overlap = $ticketIds1 | Where-Object { $ticketIds2 -contains $_ }
    
    if ($overlap.Count -eq 0) {
        Add-TestResult -TestName "Ticket ID Isolation" -Passed $true -Message "No ticket ID overlap between tenants"
    } else {
        Add-TestResult -TestName "Ticket ID Isolation" -Passed $false -Message "Found $($overlap.Count) overlapping ticket IDs: $($overlap -join ', ')"
    }
}

# ============================================
# PHASE 4: TEST DATA ISOLATION - PRODUCTS
# ============================================
Write-Info "`n=== PHASE 4: TESTING DATA ISOLATION (PRODUCTS) ===" -ForegroundColor Cyan

# Get products for Tenant 1
Write-Test "Fetching products for Tenant 1..."
$products1Result = Invoke-API -Method GET -Endpoint "/api/sla/products" -Headers $ticketHeaders1
$products1 = @()
if ($products1Result.Success -and $products1Result.Data.success) {
    $products1 = if ($products1Result.Data.data -is [Array]) { $products1Result.Data.data } else { @() }
    Add-TestResult -TestName "Tenant 1 Products Retrieval" -Passed $true -Message "Retrieved $($products1.Count) products"
    
    # Verify all products belong to tenant 1
    $wrongTenantProducts = $products1 | Where-Object { $_.tenant_id -ne $tenant1Id }
    if ($wrongTenantProducts.Count -eq 0) {
        Add-TestResult -TestName "Tenant 1 Products Isolation" -Passed $true -Message "All products belong to Tenant 1"
    } else {
        Add-TestResult -TestName "Tenant 1 Products Isolation" -Passed $false -Message "Found $($wrongTenantProducts.Count) products from other tenants"
    }
} else {
    Add-TestResult -TestName "Tenant 1 Products Retrieval" -Passed $false -Message $products1Result.Error -Details "Endpoint may not exist or require different permissions"
}

# Get products for Tenant 2
Write-Test "Fetching products for Tenant 2..."
$products2Result = Invoke-API -Method GET -Endpoint "/api/sla/products" -Headers $ticketHeaders2
$products2 = @()
if ($products2Result.Success -and $products2Result.Data.success) {
    $products2 = if ($products2Result.Data.data -is [Array]) { $products2Result.Data.data } else { @() }
    Add-TestResult -TestName "Tenant 2 Products Retrieval" -Passed $true -Message "Retrieved $($products2.Count) products"
    
    # Verify all products belong to tenant 2
    $wrongTenantProducts = $products2 | Where-Object { $_.tenant_id -ne $tenant2Id }
    if ($wrongTenantProducts.Count -eq 0) {
        Add-TestResult -TestName "Tenant 2 Products Isolation" -Passed $true -Message "All products belong to Tenant 2"
    } else {
        Add-TestResult -TestName "Tenant 2 Products Isolation" -Passed $false -Message "Found $($wrongTenantProducts.Count) products from other tenants"
    }
} else {
    Add-TestResult -TestName "Tenant 2 Products Retrieval" -Passed $false -Message $products2Result.Error -Details "Endpoint may not exist or require different permissions"
}

# ============================================
# PHASE 5: TEST CROSS-TENANT ACCESS (SECURITY)
# ============================================
Write-Info "`n=== PHASE 5: TESTING CROSS-TENANT SECURITY ===" -ForegroundColor Cyan

# Test: Tenant 1 trying to access Tenant 2's tickets
if ($tickets2.Count -gt 0) {
    Write-Test "Testing: Tenant 1 accessing Tenant 2's ticket..."
    $ticket2Id = $tickets2[0].id
    $crossHeaders = @{
        "Authorization" = "Bearer $token1"
        "X-Tenant-ID" = $tenant2Id.ToString()
        "Content-Type" = "application/json"
    }
    
    $crossTicketResult = Invoke-API -Method GET -Endpoint "/api/tickets/$ticket2Id" -Headers $crossHeaders -IgnoreErrors
    if (-not $crossTicketResult.Success) {
        Add-TestResult -TestName "Cross-Tenant Ticket Access Blocked" -Passed $true -Message "Access correctly denied"
    } else {
        Add-TestResult -TestName "Cross-Tenant Ticket Access Blocked" -Passed $false -Message "SECURITY ISSUE: Cross-tenant access allowed!"
    }
} else {
    Add-TestResult -TestName "Cross-Tenant Ticket Access Blocked" -Passed $false -Message "Skipped: No Tenant 2 tickets available"
}

# Test: Tenant 1 trying to list Tenant 2's tickets
Write-Test "Testing: Tenant 1 listing Tenant 2's tickets..."
$crossListHeaders = @{
    "Authorization" = "Bearer $token1"
    "X-Tenant-ID" = $tenant2Id.ToString()
    "Content-Type" = "application/json"
}

$crossListResult = Invoke-API -Method GET -Endpoint "/api/tickets" -Headers $crossListHeaders -IgnoreErrors
if (-not $crossListResult.Success) {
    Add-TestResult -TestName "Cross-Tenant Ticket List Blocked" -Passed $true -Message "Access correctly denied"
} else {
    # Check if returned tickets belong to tenant 2 (should be empty or blocked)
    $crossTickets = if ($crossListResult.Data.success) { $crossListResult.Data.data } else { @() }
    $tenant1TicketsInList = $crossTickets | Where-Object { $_.tenant_id -eq $tenant1Id }
    if ($tenant1TicketsInList.Count -eq 0) {
        Add-TestResult -TestName "Cross-Tenant Ticket List Blocked" -Passed $true -Message "No cross-tenant data returned"
    } else {
        Add-TestResult -TestName "Cross-Tenant Ticket List Blocked" -Passed $false -Message "SECURITY ISSUE: Cross-tenant tickets visible!"
    }
}

# Test: Tenant 2 trying to access Tenant 1's tickets
if ($tickets1.Count -gt 0) {
    Write-Test "Testing: Tenant 2 accessing Tenant 1's ticket..."
    $ticket1Id = $tickets1[0].id
    $crossHeaders2 = @{
        "Authorization" = "Bearer $token2"
        "X-Tenant-ID" = $tenant1Id.ToString()
        "Content-Type" = "application/json"
    }
    
    $crossTicketResult2 = Invoke-API -Method GET -Endpoint "/api/tickets/$ticket1Id" -Headers $crossHeaders2 -IgnoreErrors
    if (-not $crossTicketResult2.Success) {
        Add-TestResult -TestName "Reverse Cross-Tenant Ticket Access Blocked" -Passed $true -Message "Access correctly denied"
    } else {
        Add-TestResult -TestName "Reverse Cross-Tenant Ticket Access Blocked" -Passed $false -Message "SECURITY ISSUE: Cross-tenant access allowed!"
    }
}

# ============================================
# PHASE 6: TEST TICKET CREATION
# ============================================
Write-Info "`n=== PHASE 6: TESTING TICKET CREATION ===" -ForegroundColor Cyan

# Create ticket for Tenant 1
Write-Test "Creating test ticket for Tenant 1..."
$newTicket1 = @{
    name = "Test User Tenant1"
    email = "testuser1@tenant1.com"
    issue_title = "Auto Test Ticket - Tenant 1"
    description = "This is an automated test ticket for Tenant 1 multitenancy testing"
    product = "Test Product"
}

$createTicket1Result = Invoke-API -Method POST -Endpoint "/api/tickets" -Headers $ticketHeaders1 -Body $newTicket1
if ($createTicket1Result.Success -and $createTicket1Result.Data.success) {
    $createdTicket1 = $createTicket1Result.Data.data
    if ($createdTicket1.tenant_id -eq $tenant1Id) {
        Add-TestResult -TestName "Tenant 1 Ticket Creation" -Passed $true -Message "Ticket created with correct tenant_id"
    } else {
        Add-TestResult -TestName "Tenant 1 Ticket Creation" -Passed $false -Message "Ticket created with wrong tenant_id: $($createdTicket1.tenant_id)"
    }
} else {
    Add-TestResult -TestName "Tenant 1 Ticket Creation" -Passed $false -Message $createTicket1Result.Error
}

# Create ticket for Tenant 2
Write-Test "Creating test ticket for Tenant 2..."
$newTicket2 = @{
    name = "Test User Tenant2"
    email = "testuser2@tenant2.com"
    issue_title = "Auto Test Ticket - Tenant 2"
    description = "This is an automated test ticket for Tenant 2 multitenancy testing"
    product = "Test Product"
}

$createTicket2Result = Invoke-API -Method POST -Endpoint "/api/tickets" -Headers $ticketHeaders2 -Body $newTicket2
if ($createTicket2Result.Success -and $createTicket2Result.Data.success) {
    $createdTicket2 = $createTicket2Result.Data.data
    if ($createdTicket2.tenant_id -eq $tenant2Id) {
        Add-TestResult -TestName "Tenant 2 Ticket Creation" -Passed $true -Message "Ticket created with correct tenant_id"
    } else {
        Add-TestResult -TestName "Tenant 2 Ticket Creation" -Passed $false -Message "Ticket created with wrong tenant_id: $($createdTicket2.tenant_id)"
    }
} else {
    Add-TestResult -TestName "Tenant 2 Ticket Creation" -Passed $false -Message $createTicket2Result.Error
}

# ============================================
# PHASE 7: TEST USER DATA ISOLATION
# ============================================
Write-Info "`n=== PHASE 7: TESTING USER DATA ISOLATION ===" -ForegroundColor Cyan

# Get users for Tenant 1 (if endpoint exists and user has permission)
Write-Test "Fetching users for Tenant 1..."
$users1Result = Invoke-API -Method GET -Endpoint "/api/users" -Headers $ticketHeaders1 -IgnoreErrors
if ($users1Result.Success -and $users1Result.Data.success) {
    $users1 = if ($users1Result.Data.data -is [Array]) { $users1Result.Data.data } else { @() }
    $wrongTenantUsers = $users1 | Where-Object { $_.tenant_id -ne $tenant1Id }
    if ($wrongTenantUsers.Count -eq 0) {
        Add-TestResult -TestName "Tenant 1 Users Isolation" -Passed $true -Message "All users belong to Tenant 1"
    } else {
        Add-TestResult -TestName "Tenant 1 Users Isolation" -Passed $false -Message "Found $($wrongTenantUsers.Count) users from other tenants"
    }
} else {
    Add-TestResult -TestName "Tenant 1 Users Retrieval" -Passed $false -Message "Skipped: Endpoint not accessible or requires different permissions"
}

# Get users for Tenant 2
Write-Test "Fetching users for Tenant 2..."
$users2Result = Invoke-API -Method GET -Endpoint "/api/users" -Headers $ticketHeaders2 -IgnoreErrors
if ($users2Result.Success -and $users2Result.Data.success) {
    $users2 = if ($users2Result.Data.data -is [Array]) { $users2Result.Data.data } else { @() }
    $wrongTenantUsers = $users2 | Where-Object { $_.tenant_id -ne $tenant2Id }
    if ($wrongTenantUsers.Count -eq 0) {
        Add-TestResult -TestName "Tenant 2 Users Isolation" -Passed $true -Message "All users belong to Tenant 2"
    } else {
        Add-TestResult -TestName "Tenant 2 Users Isolation" -Passed $false -Message "Found $($wrongTenantUsers.Count) users from other tenants"
    }
} else {
    Add-TestResult -TestName "Tenant 2 Users Retrieval" -Passed $false -Message "Skipped: Endpoint not accessible or requires different permissions"
}

# ============================================
# PHASE 8: TEST HEADER VALIDATION
# ============================================
Write-Info "`n=== PHASE 8: TESTING HEADER VALIDATION ===" -ForegroundColor Cyan

# Test: Request without X-Tenant-ID header
Write-Test "Testing request without X-Tenant-ID header..."
$noHeaderResult = Invoke-API -Method GET -Endpoint "/api/tickets" -Headers @{
    "Authorization" = "Bearer $token1"
    "Content-Type" = "application/json"
} -IgnoreErrors

# This should either fail or default to tenant 1
if (-not $noHeaderResult.Success) {
    Add-TestResult -TestName "Missing X-Tenant-ID Header" -Passed $true -Message "Request correctly rejected without header"
} else {
    Add-TestResult -TestName "Missing X-Tenant-ID Header" -Passed $false -Message "Request accepted without X-Tenant-ID header (may be security issue)"
}

# Test: Request with invalid tenant ID
Write-Test "Testing request with invalid tenant ID..."
$invalidTenantResult = Invoke-API -Method GET -Endpoint "/api/tickets" -Headers @{
    "Authorization" = "Bearer $token1"
    "X-Tenant-ID" = "999"
    "Content-Type" = "application/json"
} -IgnoreErrors

if (-not $invalidTenantResult.Success) {
    Add-TestResult -TestName "Invalid Tenant ID Rejection" -Passed $true -Message "Invalid tenant ID correctly rejected"
} else {
    Add-TestResult -TestName "Invalid Tenant ID Rejection" -Passed $false -Message "Invalid tenant ID accepted (may be security issue)"
}

# ============================================
# FINAL SUMMARY
# ============================================
Write-Info "`n`n============================================" -ForegroundColor Cyan
Write-Info "=== TEST SUMMARY ===" -ForegroundColor Cyan
Write-Info "============================================" -ForegroundColor Cyan

Write-Host "`nTotal Tests: $($script:TestResults.Total)" -ForegroundColor White
Write-Success "Passed: $($script:TestResults.Passed)"
Write-Error "Failed: $($script:TestResults.Failed)"

$passRate = if ($script:TestResults.Total -gt 0) {
    [math]::Round(($script:TestResults.Passed / $script:TestResults.Total) * 100, 2)
} else { 0 }

Write-Host "`nPass Rate: $passRate%" -ForegroundColor $(if ($passRate -ge 80) { "Green" } elseif ($passRate -ge 60) { "Yellow" } else { "Red" })

if ($script:TestResults.Failed -gt 0) {
    Write-Info "`n=== FAILED TESTS ===" -ForegroundColor Yellow
    foreach ($test in $script:TestResults.Tests | Where-Object { -not $_.Passed }) {
        Write-Error "  ❌ $($test.Name): $($test.Message)"
        if ($test.Details) {
            Write-Host "     $($test.Details)" -ForegroundColor Gray
        }
    }
}

Write-Info "`n=== RECOMMENDATIONS ===" -ForegroundColor Cyan
if ($script:TestResults.Failed -eq 0) {
    Write-Success "✅ All multitenancy tests passed! Your system is properly isolated."
} else {
    Write-Warning "⚠️  Some tests failed. Please review the failed tests above."
    Write-Warning "   - Check that verifyTenantAccess middleware is applied to all routes"
    Write-Warning "   - Verify database queries include tenant_id filtering"
    Write-Warning "   - Ensure JWT tokens include tenant_id"
    Write-Warning "   - Check that X-Tenant-ID header is validated"
}

Write-Info "`n=== DONE ===" -ForegroundColor Cyan
Write-Host ""

