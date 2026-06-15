-- Clear all tickets while preserving database structure
-- This script works with MySQL safe update mode

-- Option 1: Temporarily disable safe update mode (recommended)
SET SQL_SAFE_UPDATES = 0;

-- Start transaction for safety
START TRANSACTION;

-- Delete in order to respect foreign key constraints
DELETE FROM assigned;
DELETE FROM tick_system_replies;
DELETE FROM tick_system_whatsapp_messages;
DELETE FROM tickets;

-- Re-enable safe update mode
SET SQL_SAFE_UPDATES = 1;

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
