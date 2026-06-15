-- ============================================
-- FIND OR CREATE TEST USERS FOR MULTITENANCY
-- ============================================

-- STEP 1: Check existing tenants
SELECT id, name, subdomain, status FROM tenants;

-- STEP 2: Check existing users/agents per tenant
-- Tenant 1 Staff/Agents
SELECT 
    id, 
    name, 
    email, 
    login_id, 
    role, 
    tenant_id,
    is_active
FROM agents 
WHERE tenant_id = 1;

-- Tenant 1 Customers
SELECT 
    id, 
    name, 
    email, 
    role, 
    tenant_id,
    is_active
FROM users 
WHERE tenant_id = 1;

-- Tenant 2 Staff/Agents
SELECT 
    id, 
    name, 
    email, 
    login_id, 
    role, 
    tenant_id,
    is_active
FROM agents 
WHERE tenant_id = 2;

-- Tenant 2 Customers
SELECT 
    id, 
    name, 
    email, 
    role, 
    tenant_id,
    is_active
FROM users 
WHERE tenant_id = 2;

-- ============================================
-- CREATE TEST USERS (if needed)
-- ============================================

-- Create Tenant 1 Test Agent (password: "password123")
-- Password hash for "password123" using bcrypt
INSERT INTO agents (
    tenant_id, 
    name, 
    email, 
    login_id, 
    password_hash, 
    role, 
    is_active, 
    created_at
) VALUES (
    1,
    'Tenant 1 Admin',
    'admin1@tenant1.com',
    'admin1',
    '$2a$10$rOzJusTP7XqY5Z5q5q5q5u5q5q5q5q5q5q5q5q5q5q5q5q5q5q5q',  -- Replace with actual bcrypt hash
    'admin',
    TRUE,
    NOW()
)
ON DUPLICATE KEY UPDATE name = name;

-- Create Tenant 1 Test Customer
INSERT INTO users (
    tenant_id,
    name,
    email,
    role,
    is_active,
    created_at
) VALUES (
    1,
    'Tenant 1 Customer',
    'customer1@tenant1.com',
    'user',
    TRUE,
    NOW()
)
ON DUPLICATE KEY UPDATE name = name;

-- Create Tenant 2 Test Agent
INSERT INTO agents (
    tenant_id, 
    name, 
    email, 
    login_id, 
    password_hash, 
    role, 
    is_active, 
    created_at
) VALUES (
    2,
    'Tenant 2 Admin',
    'admin2@tenant2.com',
    'admin2',
    '$2a$10$rOzJusTP7XqY5Z5q5q5q5u5q5q5q5q5q5q5q5q5q5q5q5q5q5q5q',  -- Replace with actual bcrypt hash
    'admin',
    TRUE,
    NOW()
)
ON DUPLICATE KEY UPDATE name = name;

-- Create Tenant 2 Test Customer
INSERT INTO users (
    tenant_id,
    name,
    email,
    role,
    is_active,
    created_at
) VALUES (
    2,
    'Tenant 2 Customer',
    'customer2@tenant2.com',
    'user',
    TRUE,
    NOW()
)
ON DUPLICATE KEY UPDATE name = name;

-- ============================================
-- GENERATE PASSWORD HASH (Run in Node.js)
-- ============================================
-- To generate a proper bcrypt hash, run this in Node.js:
-- 
-- const bcrypt = require('bcryptjs');
-- const hash = bcrypt.hashSync('password123', 10);
-- console.log(hash);
-- 
-- Then use that hash in the INSERT statements above

-- ============================================
-- QUICK CHECK: Verify users exist
-- ============================================
SELECT 
    'Tenant 1 Agents' as type,
    COUNT(*) as count
FROM agents WHERE tenant_id = 1
UNION ALL
SELECT 
    'Tenant 1 Users' as type,
    COUNT(*) as count
FROM users WHERE tenant_id = 1
UNION ALL
SELECT 
    'Tenant 2 Agents' as type,
    COUNT(*) as count
FROM agents WHERE tenant_id = 2
UNION ALL
SELECT 
    'Tenant 2 Users' as type,
    COUNT(*) as count
FROM users WHERE tenant_id = 2;




