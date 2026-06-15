@echo off
REM ============================================
REM SIMPLE MULTITENANCY TEST (CMD with curl)
REM ============================================
REM This is a simpler version using curl commands
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo MULTITENANCY SIMPLE TEST
echo ============================================
echo.

REM Configuration
set BASE_URL=http://localhost:5000
set TENANT1_EMAIL=
set TENANT1_PASSWORD=
set TENANT2_EMAIL=
set TENANT2_PASSWORD=

REM Check if curl is available
where curl >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: curl is not installed or not in PATH
    echo Please install curl or use the PowerShell version
    echo Download from: https://curl.se/windows/
    pause
    exit /b 1
)

REM Get credentials if not set
if "%TENANT1_EMAIL%"=="" (
    echo Enter Tenant 1 credentials:
    set /p TENANT1_EMAIL="Email/Login ID: "
    set /p TENANT1_PASSWORD="Password: "
)

if "%TENANT2_EMAIL%"=="" (
    echo.
    echo Enter Tenant 2 credentials:
    set /p TENANT2_EMAIL="Email/Login ID: "
    set /p TENANT2_PASSWORD="Password: "
)

echo.
echo ============================================
echo PHASE 1: TESTING LOGIN
echo ============================================
echo.

REM Test Tenant 1 Login
echo Testing Tenant 1 Login...
curl -s -X POST "%BASE_URL%/api/auth/global-login" ^
    -H "Content-Type: application/json" ^
    -H "X-Tenant-ID: 1" ^
    -d "{\"login_id\":\"%TENANT1_EMAIL%\",\"password\":\"%TENANT1_PASSWORD%\"}" > temp_t1_login.json

if %errorlevel% neq 0 (
    echo [FAIL] Tenant 1 Login failed - Check server is running
) else (
    echo [OK] Tenant 1 Login response saved to temp_t1_login.json
    type temp_t1_login.json
)

echo.
echo Testing Tenant 2 Login...
curl -s -X POST "%BASE_URL%/api/auth/global-login" ^
    -H "Content-Type: application/json" ^
    -H "X-Tenant-ID: 2" ^
    -d "{\"login_id\":\"%TENANT2_EMAIL%\",\"password\":\"%TENANT2_PASSWORD%\"}" > temp_t2_login.json

if %errorlevel% neq 0 (
    echo [FAIL] Tenant 2 Login failed - Check server is running
) else (
    echo [OK] Tenant 2 Login response saved to temp_t2_login.json
    type temp_t2_login.json
)

echo.
echo ============================================
echo PHASE 2: EXTRACT TOKENS
echo ============================================
echo.

REM Extract tokens using PowerShell (for JSON parsing)
for /f "delims=" %%i in ('powershell -Command "$json = Get-Content temp_t1_login.json | ConvertFrom-Json; if ($json.success) { $json.data.token } else { 'FAILED' }"') do set TOKEN1=%%i

for /f "delims=" %%i in ('powershell -Command "$json = Get-Content temp_t2_login.json | ConvertFrom-Json; if ($json.success) { $json.data.token } else { 'FAILED' }"') do set TOKEN2=%%i

if "%TOKEN1%"=="FAILED" (
    echo [ERROR] Could not extract Tenant 1 token
    goto :end
)

if "%TOKEN2%"=="FAILED" (
    echo [ERROR] Could not extract Tenant 2 token
    goto :end
)

echo [OK] Tokens extracted successfully
echo Tenant 1 Token: %TOKEN1:~0,30%...
echo Tenant 2 Token: %TOKEN2:~0,30%...

echo.
echo ============================================
echo PHASE 3: TEST TICKET ISOLATION
echo ============================================
echo.

echo Getting tickets for Tenant 1...
curl -s -X GET "%BASE_URL%/api/tickets" ^
    -H "Authorization: Bearer %TOKEN1%" ^
    -H "X-Tenant-ID: 1" ^
    -H "Content-Type: application/json" > temp_t1_tickets.json

if %errorlevel% equ 0 (
    echo [OK] Tenant 1 tickets retrieved
    powershell -Command "$json = Get-Content temp_t1_tickets.json | ConvertFrom-Json; if ($json.success) { Write-Host 'Found' $json.data.Count 'tickets for Tenant 1' }"
) else (
    echo [FAIL] Could not retrieve Tenant 1 tickets
)

echo.
echo Getting tickets for Tenant 2...
curl -s -X GET "%BASE_URL%/api/tickets" ^
    -H "Authorization: Bearer %TOKEN2%" ^
    -H "X-Tenant-ID: 2" ^
    -H "Content-Type: application/json" > temp_t2_tickets.json

if %errorlevel% equ 0 (
    echo [OK] Tenant 2 tickets retrieved
    powershell -Command "$json = Get-Content temp_t2_tickets.json | ConvertFrom-Json; if ($json.success) { Write-Host 'Found' $json.data.Count 'tickets for Tenant 2' }"
) else (
    echo [FAIL] Could not retrieve Tenant 2 tickets
)

echo.
echo ============================================
echo PHASE 4: TEST CROSS-TENANT SECURITY
echo ============================================
echo.

echo Testing: Tenant 1 trying to access Tenant 2 data (should FAIL)...
curl -s -X GET "%BASE_URL%/api/tickets" ^
    -H "Authorization: Bearer %TOKEN1%" ^
    -H "X-Tenant-ID: 2" ^
    -H "Content-Type: application/json" > temp_cross_access.json

powershell -Command "$json = Get-Content temp_cross_access.json | ConvertFrom-Json; if ($json.success) { Write-Host '[SECURITY ISSUE] Cross-tenant access allowed!' -ForegroundColor Red } else { Write-Host '[OK] Cross-tenant access correctly blocked' -ForegroundColor Green }"

echo.
echo ============================================
echo PHASE 5: TEST TICKET CREATION
echo ============================================
echo.

echo Creating test ticket for Tenant 1...
curl -s -X POST "%BASE_URL%/api/tickets" ^
    -H "Authorization: Bearer %TOKEN1%" ^
    -H "X-Tenant-ID: 1" ^
    -H "Content-Type: application/json" ^
    -d "{\"name\":\"Test User T1\",\"email\":\"test1@tenant1.com\",\"issue_title\":\"Auto Test - Tenant 1\",\"description\":\"Automated test ticket\"}" > temp_create_t1.json

if %errorlevel% equ 0 (
    powershell -Command "$json = Get-Content temp_create_t1.json | ConvertFrom-Json; if ($json.success) { Write-Host '[OK] Ticket created for Tenant 1 with tenant_id:' $json.data.tenant_id -ForegroundColor Green } else { Write-Host '[FAIL]' $json.message -ForegroundColor Red }"
) else (
    echo [FAIL] Could not create ticket for Tenant 1
)

echo.
echo Creating test ticket for Tenant 2...
curl -s -X POST "%BASE_URL%/api/tickets" ^
    -H "Authorization: Bearer %TOKEN2%" ^
    -H "X-Tenant-ID: 2" ^
    -H "Content-Type: application/json" ^
    -d "{\"name\":\"Test User T2\",\"email\":\"test2@tenant2.com\",\"issue_title\":\"Auto Test - Tenant 2\",\"description\":\"Automated test ticket\"}" > temp_create_t2.json

if %errorlevel% equ 0 (
    powershell -Command "$json = Get-Content temp_create_t2.json | ConvertFrom-Json; if ($json.success) { Write-Host '[OK] Ticket created for Tenant 2 with tenant_id:' $json.data.tenant_id -ForegroundColor Green } else { Write-Host '[FAIL]' $json.message -ForegroundColor Red }"
) else (
    echo [FAIL] Could not create ticket for Tenant 2
)

:end
echo.
echo ============================================
echo TEST SUMMARY
echo ============================================
echo.
echo Check the following files for detailed results:
echo - temp_t1_login.json (Tenant 1 login response)
echo - temp_t2_login.json (Tenant 2 login response)
echo - temp_t1_tickets.json (Tenant 1 tickets)
echo - temp_t2_tickets.json (Tenant 2 tickets)
echo - temp_cross_access.json (Cross-tenant access test)
echo - temp_create_t1.json (Tenant 1 ticket creation)
echo - temp_create_t2.json (Tenant 2 ticket creation)
echo.
echo To clean up temporary files, run: del temp_*.json
echo.
pause

