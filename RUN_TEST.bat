@echo off
REM ============================================
REM QUICK TEST RUNNER
REM ============================================
REM This script helps you run the test from any directory
REM ============================================

echo.
echo ============================================
echo MULTITENANCY TEST RUNNER
echo ============================================
echo.

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo Current directory: %CD%
echo.

REM Check which test script to run
echo Choose test method:
echo 1. Full PowerShell test (recommended - comprehensive)
echo 2. Simple CMD test (uses curl - basic)
echo.
set /p choice="Enter choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo Running full PowerShell test...
    echo.
    if exist "test-multitenancy-auto.ps1" (
        powershell.exe -ExecutionPolicy Bypass -File "test-multitenancy-auto.ps1" %*
    ) else (
        echo ERROR: test-multitenancy-auto.ps1 not found!
        echo Please ensure you're in the project root directory.
    )
) else if "%choice%"=="2" (
    echo.
    echo Running simple CMD test...
    echo.
    if exist "test-multitenancy-simple.cmd" (
        call "test-multitenancy-simple.cmd"
    ) else (
        echo ERROR: test-multitenancy-simple.cmd not found!
        echo Please ensure you're in the project root directory.
    )
) else (
    echo Invalid choice. Exiting.
    exit /b 1
)

echo.
pause

