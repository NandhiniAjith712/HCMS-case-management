@echo off
echo 🗑️  Clearing all tickets from database...
echo.
echo This will delete ALL tickets while preserving database structure.
echo.
echo Choose an option:
echo 1. Run SQL directly in MySQL (recommended)
echo 2. View SQL content
echo.
set /p choice="Enter your choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo 🚀 Opening MySQL command line...
    echo.
    echo Copy and paste the content from clear-tickets.sql
    echo Or run: mysql -u root -p tick_system < clear-tickets.sql
    echo.
    pause
) else if "%choice%"=="2" (
    echo.
    echo 📄 SQL Content:
    echo ========================================
    type clear-tickets.sql
    echo ========================================
    echo.
    echo Copy this SQL and run it in MySQL Workbench or command line.
    echo.
    pause
) else (
    echo Invalid choice. Please run the script again.
    pause
)
