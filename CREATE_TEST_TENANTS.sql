-- SQL Script to Create Test Tenants
-- Run this in your MySQL database

-- Create Tenant 1: Company A
INSERT INTO tenants (
  name, 
  subdomain, 
  plan, 
  status, 
  max_users, 
  max_tickets_per_month,
  whatsapp_enabled,
  email_enabled
) VALUES (
  'Company A',
  'companya',
  'premium',
  'active',
  50,
  1000,
  TRUE,
  TRUE
);

-- Create Tenant 2: Company B
INSERT INTO tenants (
  name, 
  subdomain, 
  plan, 
  status, 
  max_users, 
  max_tickets_per_month,
  whatsapp_enabled,
  email_enabled
) VALUES (
  'Company B',
  'companyb',
  'basic',
  'active',
  20,
  500,
  FALSE,
  TRUE
);

-- Create Tenant 3: Company C (Optional)
INSERT INTO tenants (
  name, 
  subdomain, 
  plan, 
  status, 
  max_users, 
  max_tickets_per_month,
  whatsapp_enabled,
  email_enabled
) VALUES (
  'Company C',
  'companyc',
  'free',
  'active',
  10,
  100,
  FALSE,
  TRUE
);

-- Verify tenants were created
SELECT id, name, subdomain, plan, status, created_at FROM tenants ORDER BY id;

