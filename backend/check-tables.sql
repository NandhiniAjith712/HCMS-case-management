-- Check what tables exist in the database
SHOW TABLES;

-- Check table structure for ticket-related tables
DESCRIBE tickets;
DESCRIBE assigned;

-- Check if other tables exist
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'tick_system' 
AND TABLE_NAME LIKE '%reply%' 
OR TABLE_NAME LIKE '%whatsapp%'
OR TABLE_NAME LIKE '%message%';
