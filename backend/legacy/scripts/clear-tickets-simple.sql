-- Clear all tickets while preserving database structure
-- This script only deletes from tables that exist

-- Temporarily disable safe update mode
SET SQL_SAFE_UPDATES = 0;

-- Start transaction for safety
START TRANSACTION;

-- Delete from main tables that we know exist
DELETE FROM assigned;
DELETE FROM tickets;

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
