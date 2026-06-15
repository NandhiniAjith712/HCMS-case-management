-- Simple fix for password_hash field issue (avoids deadlocks)
-- Run this in MySQL Workbench to fix auto-login

-- Step 1: Check current table structure
DESCRIBE agents;

-- Step 2: Add a new password_hash column with correct structure
ALTER TABLE agents ADD COLUMN password_hash_new VARCHAR(255) DEFAULT NULL;

-- Step 3: Copy data from old column to new column
UPDATE agents SET password_hash_new = password_hash WHERE password_hash IS NOT NULL;

-- Step 4: Drop the old password_hash column
ALTER TABLE agents DROP COLUMN password_hash;

-- Step 5: Rename the new column to password_hash
ALTER TABLE agents CHANGE COLUMN password_hash_new password_hash VARCHAR(255) DEFAULT NULL;

-- Step 6: Verify the fix
DESCRIBE agents;

-- Step 7: Check current data
SELECT COUNT(*) as total_agents FROM agents;
SELECT COUNT(*) as null_password_count FROM agents WHERE password_hash IS NULL;

-- Success message
SELECT 'SUCCESS: password_hash field fixed for auto-login!' as message;
