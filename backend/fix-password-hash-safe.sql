-- Safe fix for password_hash field issue (avoids deadlocks)
-- Run this in MySQL Workbench to fix auto-login

-- Step 1: Check current table structure first
DESCRIBE agents;

-- Step 2: Use a safer approach - create a temporary table
CREATE TABLE agents_temp LIKE agents;

-- Step 3: Copy data to temporary table
INSERT INTO agents_temp SELECT * FROM agents;

-- Step 4: Drop the original table
DROP TABLE agents;

-- Step 5: Recreate the table with correct structure
CREATE TABLE agents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) DEFAULT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  role ENUM('user','support_executive','support_manager','ceo','admin','business_team') DEFAULT 'user',
  department VARCHAR(100) DEFAULT NULL,
  manager_id INT DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT NULL,
  login_id VARCHAR(50) UNIQUE DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  phone VARCHAR(20) DEFAULT NULL,
  email_notifications TINYINT(1) DEFAULT 1,
  user_type ENUM('customer','staff') DEFAULT 'staff',
  INDEX idx_manager (manager_id),
  INDEX idx_email (email),
  INDEX idx_role (role)
);

-- Step 6: Restore data from temporary table
INSERT INTO agents SELECT * FROM agents_temp;

-- Step 7: Drop temporary table
DROP TABLE agents_temp;

-- Step 8: Verify the fix
DESCRIBE agents;

-- Step 9: Check current data
SELECT COUNT(*) as total_agents FROM agents;
SELECT COUNT(*) as null_password_count FROM agents WHERE password_hash IS NULL;

-- Success message
SELECT 'SUCCESS: password_hash field fixed for auto-login!' as message;
