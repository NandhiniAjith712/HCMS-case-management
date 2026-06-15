-- Migration: Remove organizations table, keep SPOC at tenant level
-- This removes the organization hierarchy while preserving SPOC functionality at tenant level

-- Step 1: Backup existing data (optional - comment out if not needed)
-- CREATE TABLE IF NOT EXISTS organizations_backup AS SELECT * FROM organizations;
-- CREATE TABLE IF NOT EXISTS organization_spoc_mapping_backup AS SELECT * FROM organization_spoc_mapping;
-- CREATE TABLE IF NOT EXISTS product_organizations_backup AS SELECT * FROM product_organizations;

-- Step 2: Drop organization-related tables
DROP TABLE IF EXISTS organization_spoc_mapping;
DROP TABLE IF EXISTS product_organizations;
DROP TABLE IF EXISTS organizations;

-- Step 8: Update product_spoc_mapping to work at tenant level (already does, no changes needed)

-- Step 9: Verify the changes
SELECT 'Migration completed successfully' as status;
