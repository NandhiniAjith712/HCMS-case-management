-- Quick Test Tenant Setup Script
-- Run this to create test tenants for multitenancy testing

-- Create test tenants
INSERT INTO tenants (name, subdomain, plan, status, max_users, max_tickets_per_month) 
VALUES 
  ('Company A', 'companya', 'premium', 'active', 50, 1000),
  ('Company B', 'companyb', 'basic', 'active', 20, 500),
  ('Company C', 'companyc', 'free', 'active', 10, 100)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Verify tenants created
SELECT id, name, subdomain, plan, status FROM tenants;

-- Check tenant_id columns exist
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME = 'tenant_id'
ORDER BY TABLE_NAME;

-- Count records per tenant (if any data exists)
SELECT 
  tenant_id,
  COUNT(*) as record_count
FROM tickets
GROUP BY tenant_id;

SELECT 
  tenant_id,
  COUNT(*) as record_count
FROM agents
GROUP BY tenant_id;

SELECT 
  tenant_id,
  COUNT(*) as record_count
FROM users
GROUP BY tenant_id;

