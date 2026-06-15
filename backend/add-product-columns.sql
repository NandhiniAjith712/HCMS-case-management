-- Add new columns to products table
ALTER TABLE products 
ADD COLUMN modules TEXT AFTER description,
ADD COLUMN issue_type VARCHAR(100) AFTER modules,
ADD COLUMN template VARCHAR(500) AFTER issue_type;

-- Update existing products with default values if needed
UPDATE products SET modules = 'General' WHERE modules IS NULL;
UPDATE products SET issue_type = 'Technical Support' WHERE issue_type IS NULL; 