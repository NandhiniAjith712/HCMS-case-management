-- Remove unnecessary SLA columns from products table
-- Since SLA is now managed through modules and sla_configurations tables

ALTER TABLE products 
DROP COLUMN modules,
DROP COLUMN issue_type,
DROP COLUMN template,
DROP COLUMN sla_time_minutes,
DROP COLUMN priority_level; 