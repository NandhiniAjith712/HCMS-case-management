-- Migration: Staff password setup and reset flow
-- Run this to add columns for password-setup and forgot-password flows
-- Execute each statement. If you get "Duplicate column" errors, skip that statement.

-- 1. Allow password_hash to be NULL for newly created staff (before they set password)
ALTER TABLE agents MODIFY COLUMN password_hash VARCHAR(255) DEFAULT NULL;

-- 2. Add password setup token (for initial account setup)
ALTER TABLE agents ADD COLUMN password_setup_token VARCHAR(255) DEFAULT NULL;
ALTER TABLE agents ADD COLUMN password_setup_token_expires DATETIME DEFAULT NULL;

-- 3. Add password reset token (for forgot password)
ALTER TABLE agents ADD COLUMN password_reset_token VARCHAR(255) DEFAULT NULL;
ALTER TABLE agents ADD COLUMN password_reset_token_expires DATETIME DEFAULT NULL;
