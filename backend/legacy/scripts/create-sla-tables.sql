-- Create SLA Management Tables

-- 1. Modules table (sub-components of products)
CREATE TABLE IF NOT EXISTS modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 2. SLA Configurations table (individual SLA rules for product-module combinations)
CREATE TABLE IF NOT EXISTS sla_configurations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  module_id INT NOT NULL,
  issue_type VARCHAR(100) NOT NULL,
  sla_time_minutes INT NOT NULL COMMENT 'Response time in minutes',
  priority_level ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P2',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_sla_config (product_id, module_id, issue_type)
);

-- 3. Add some sample data
INSERT INTO modules (product_id, name, description, created_by) VALUES
(1, 'User Authentication', 'Login, logout, password reset functionality', 1),
(1, 'User Management', 'User creation, profile management, roles', 1),
(1, 'Security', 'Access control, permissions, audit logs', 1);

INSERT INTO sla_configurations (product_id, module_id, issue_type, sla_time_minutes, priority_level, description, created_by) VALUES
(1, 1, 'Login Issues', 30, 'P1', 'User cannot login to system', 1),
(1, 1, 'Password Reset', 60, 'P2', 'User forgot password', 1),
(1, 2, 'User Creation', 120, 'P2', 'New user account creation', 1),
(1, 3, 'Security Breach', 15, 'P0', 'Critical security issues', 1); 