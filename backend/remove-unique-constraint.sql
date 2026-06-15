-- Remove the unique constraint that prevents multiple SLA rules per module
-- This allows multiple SLA rules for the same module with different issue types

USE tick_system;

-- Drop the unique constraint
ALTER TABLE sla_configurations DROP INDEX unique_sla_config;

-- Verify the constraint is removed
SHOW INDEX FROM sla_configurations;
