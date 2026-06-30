-- Create cases table for HCMS v2 API
-- This table mirrors the tickets table structure with HCMS terminology

CREATE TABLE IF NOT EXISTS cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  status ENUM('new', 'in_progress', 'escalated', 'closed', 'waiting') DEFAULT 'new',
  created_by INT NOT NULL,
  assigned_to INT,
  tenant_id INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  reopened_at TIMESTAMP NULL,
  reopened_reason TEXT,
  employee_closed TINYINT(1) DEFAULT 0,
  resolution_summary TEXT,
  satisfaction_rating INT NULL,
  
  INDEX idx_status (status),
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_created_by (created_by),
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_priority (priority),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Copy existing tickets data to cases table
INSERT INTO cases (id, title, description, category, priority, status, created_by, assigned_to, tenant_id, created_at, updated_at, closed_at, reopened_at, reopened_reason, employee_closed, resolution_summary, satisfaction_rating)
SELECT 
  id, 
  issue_title as title, 
  description, 
  category, 
  CASE 
    WHEN priority = 'urgent' THEN 'critical'
    ELSE priority 
  END as priority,
  status,
  user_id as created_by,
  current_owner_id as assigned_to,
  tenant_id,
  created_at,
  updated_at,
  closed_at,
  reopened_at,
  reopened_reason,
  employee_closed,
  resolution_summary,
  satisfaction_rating
FROM tickets
ON DUPLICATE KEY UPDATE 
  title = VALUES(title),
  description = VALUES(description),
  category = VALUES(category),
  priority = VALUES(priority),
  status = VALUES(status),
  created_by = VALUES(created_by),
  assigned_to = VALUES(assigned_to),
  updated_at = VALUES(updated_at);
