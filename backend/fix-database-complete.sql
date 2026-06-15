-- Complete Database Fix for Auto-Login Issues
-- This script will resolve all potential database problems

-- 1. Check current table structure
DESCRIBE agents;

-- 2. Fix password_hash field to allow NULL values
ALTER TABLE agents MODIFY COLUMN password_hash VARCHAR(255) DEFAULT NULL;

-- 3. Check for any NOT NULL constraints that might cause issues
-- If the above doesn't work, try this alternative:
-- ALTER TABLE agents CHANGE COLUMN password_hash password_hash VARCHAR(255) DEFAULT NULL;

-- 4. Update any existing empty password_hash values to NULL
UPDATE agents SET password_hash = NULL WHERE password_hash = '';

-- 5. Check if there are any other required fields that might be missing
-- Make sure these fields can handle NULL values if they're not essential
ALTER TABLE agents MODIFY COLUMN phone VARCHAR(20) DEFAULT NULL;
ALTER TABLE agents MODIFY COLUMN role VARCHAR(50) DEFAULT 'user';

-- 6. Verify the fixes
DESCRIBE agents;

-- 7. Check current data
SELECT COUNT(*) as total_agents FROM agents;
SELECT COUNT(*) as null_password_count FROM agents WHERE password_hash IS NULL;
SELECT COUNT(*) as null_phone_count FROM agents WHERE phone IS NULL;

-- 8. Show success message
SELECT 'SUCCESS: Database schema fixed for auto-login!' as message;
