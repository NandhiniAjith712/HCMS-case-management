-- Fix password_hash field issue for auto-login
-- This script will resolve the "Field 'password_hash' doesn't have a default value" error

-- First, let's check the current structure of the agents table
DESCRIBE agents;

-- Check if there are any NULL password_hash values
SELECT COUNT(*) as null_password_count FROM agents WHERE password_hash IS NULL;

-- Update the password_hash field to allow NULL values and set default
ALTER TABLE agents MODIFY COLUMN password_hash VARCHAR(255) DEFAULT NULL;

-- If the above doesn't work, try this alternative approach
-- ALTER TABLE agents CHANGE COLUMN password_hash password_hash VARCHAR(255) DEFAULT NULL;

-- Set a default value for existing NULL password_hash records
UPDATE agents SET password_hash = NULL WHERE password_hash = '';

-- Verify the fix
DESCRIBE agents;

-- Check for any remaining issues
SELECT COUNT(*) as total_agents FROM agents;
SELECT COUNT(*) as null_password_count FROM agents WHERE password_hash IS NULL;

-- Show success message
SELECT 'SUCCESS: password_hash field fixed for auto-login!' as message;
