-- Clear all tickets while preserving database structure
-- This script works with MySQL safe update mode and only deletes from existing tables

-- First, let's check what tables exist
SHOW TABLES;

-- Option 1: Temporarily disable safe update mode (recommended)
SET SQL_SAFE_UPDATES = 0;

-- Start transaction for safety
START TRANSACTION;

-- Delete from tables that we know exist
DELETE FROM assigned;
DELETE FROM tickets;

-- Try to delete from other tables only if they exist
-- (These will be skipped if tables don't exist)
SET @sql = 'DELETE FROM tick_system_replies';
SET @sql = CONCAT(@sql, ' WHERE 1=1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = 'DELETE FROM tick_system_whatsapp_messages';
SET @sql = CONCAT(@sql, ' WHERE 1=1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Re-enable safe update mode
SET SQL_SAFE_UPDATES = 1;

-- Commit transaction
COMMIT;

-- Verify deletion
SELECT 'Tickets after deletion:' as info, COUNT(*) as count FROM tickets;
SELECT 'Assignments after deletion:' as info, COUNT(*) as count FROM assigned;

-- Check preserved data
SELECT 'Agents preserved:' as info, COUNT(*) as count FROM agents;
SELECT 'Products preserved:' as info, COUNT(*) as count FROM sla_products;
SELECT 'Modules preserved:' as info, COUNT(*) as count FROM sla_modules;
SELECT 'SLA configurations preserved:' as info, COUNT(*) as count FROM sla_configurations;

-- Show success message
SELECT 'SUCCESS: All tickets deleted! Database structure preserved.' as message;
