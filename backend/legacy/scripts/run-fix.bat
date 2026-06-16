@echo off
echo 🔧 Fixing password_hash field for auto-login...
echo.
echo 📋 Copy and paste this SQL into MySQL Workbench:
echo.
echo ========================================
echo ALTER TABLE agents MODIFY COLUMN password_hash VARCHAR(255) DEFAULT NULL;
echo ========================================
echo.
echo 📝 Steps:
echo 1. Open MySQL Workbench
echo 2. Connect to your tick_system database
echo 3. Create a new query tab
echo 4. Paste the SQL above
echo 5. Execute the query
echo.
echo ✅ After running the SQL, try the auto-login again!
echo.
pause
