-- ============================================
-- MIGRATE SPOC USERS FROM users TO agents TABLE
-- This moves org_spoc and product_spoc to the agents table
-- ============================================

-- Step 1: Update agents table role enum to include org_spoc and product_spoc
ALTER TABLE agents 
MODIFY COLUMN role ENUM('agent','manager','support_manager','ceo','org_spoc','product_spoc') 
DEFAULT 'agent';

-- Step 2: Migrate existing org_spoc users from users to agents (skip if already exists)
INSERT IGNORE INTO agents (tenant_id, name, password_hash, email, role, department, manager_id, product_scope_id, is_active, created_at, last_login, phone, email_notifications, user_type, availability_status)
SELECT 
    tenant_id,
    name,
    password_hash,
    email,
    'org_spoc' as role,
    department,
    manager_id,
    product_scope_id,
    is_active,
    created_at,
    last_login,
    phone,
    email_notifications,
    'staff' as user_type,
    'available' as availability_status
FROM users 
WHERE role = 'org_spoc' AND password_hash IS NOT NULL;

-- Step 3: Migrate existing product_spoc users from users to agents (skip if already exists)
INSERT IGNORE INTO agents (tenant_id, name, password_hash, email, role, department, manager_id, product_scope_id, is_active, created_at, last_login, phone, email_notifications, user_type, availability_status)
SELECT 
    tenant_id,
    name,
    password_hash,
    email,
    'product_spoc' as role,
    department,
    manager_id,
    product_scope_id,
    is_active,
    created_at,
    last_login,
    phone,
    email_notifications,
    'staff' as user_type,
    'available' as availability_status
FROM users 
WHERE role = 'product_spoc' AND password_hash IS NOT NULL;

-- Step 4: Delete SPOC users from users table
DELETE FROM users WHERE role IN ('org_spoc', 'product_spoc');

-- Step 5: Update users table role enum to remove org_spoc and product_spoc
ALTER TABLE users 
MODIFY COLUMN role ENUM('user','admin','ceo','manager','business_team') 
DEFAULT 'user';

-- Step 6: Verify migration
SELECT 'Migration completed successfully' as status;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check SPOC users in agents table
-- SELECT id, name, email, role, tenant_id, product_scope_id FROM agents WHERE role IN ('org_spoc', 'product_spoc');

-- Check no SPOC users remain in users table
-- SELECT COUNT(*) as spo_count FROM users WHERE role IN ('org_spoc', 'product_spoc');
-- Expected: 0

-- Check agents table structure
-- DESCRIBE agents;
