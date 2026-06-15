-- ============================================
-- COMPLETE ORGANIZATION HIERARCHY REMOVAL
-- Run this on your cloud database to remove all organization-related tables, columns, and data
-- ============================================

-- Step 1: Drop foreign key constraints first (if they exist)
-- Note: IF EXISTS not supported for foreign keys in MySQL, so we use ALTER TABLE ... DROP FOREIGN KEY
-- Run these individually and ignore errors if they don't exist

ALTER TABLE modules DROP FOREIGN KEY fk_modules_organization;
ALTER TABLE agents DROP FOREIGN KEY fk_agents_organization;
ALTER TABLE products DROP FOREIGN KEY fk_products_organization;
ALTER TABLE tickets DROP FOREIGN KEY fk_tickets_organization;
ALTER TABLE users DROP FOREIGN KEY fk_users_organization;

-- Step 2: Drop organization-related tables
DROP TABLE IF EXISTS organization_spoc_mapping;
DROP TABLE IF EXISTS product_organizations;
DROP TABLE IF EXISTS organizations;

-- Step 3: Remove organization_id columns from all tables
-- Note: MySQL doesn't support DROP COLUMN IF EXISTS, so we ignore errors if column doesn't exist
ALTER TABLE users DROP COLUMN organization_id;
ALTER TABLE tickets DROP COLUMN organization_id;
ALTER TABLE products DROP COLUMN organization_id;
ALTER TABLE agents DROP COLUMN organization_id;
ALTER TABLE modules DROP COLUMN organization_id;

-- Step 4: Remove is_external column (was used for org-based external users, no longer needed)
ALTER TABLE users DROP COLUMN is_external;

-- Step 5: Remove JSON columns that stored organization data
ALTER TABLE products DROP COLUMN organization_ids;

-- Step 6: Clean up any views that might reference organizations
DROP VIEW IF EXISTS v_organization_tickets;
DROP VIEW IF EXISTS v_organization_users;
DROP VIEW IF EXISTS v_organization_products;

-- Step 7: Verify cleanup
SELECT 'Migration completed successfully' as status;

-- ============================================
-- VERIFICATION QUERIES (Run these after migration to verify)
-- ============================================

-- Check that org tables are gone
-- SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '%organization%';
-- Expected: Empty result

-- Check that org columns are gone from key tables
-- DESCRIBE users;  -- should NOT have organization_id or is_external
-- DESCRIBE tickets; -- should NOT have organization_id
-- DESCRIBE products; -- should NOT have organization_id or organization_ids
-- DESCRIBE agents; -- should NOT have organization_id
-- DESCRIBE modules; -- should NOT have organization_id

-- Check that product_spoc_mapping still exists (SPOC functionality preserved)
-- SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_spoc_mapping';
-- Expected: product_spoc_mapping exists

-- Check that tenants table exists (tenant isolation maintained)
-- SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants';
-- Expected: tenants table exists
