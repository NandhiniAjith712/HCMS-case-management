-- Support Calls Table for ITSM System
-- This table logs support calls from external systems (GRC, INMOD, etc.)

CREATE TABLE IF NOT EXISTS support_calls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product VARCHAR(100) NOT NULL COMMENT 'Product/system that generated the support call (GRC, INMOD, etc.)',
    context JSON COMMENT 'Additional context information about the support call',
    current_page VARCHAR(255) COMMENT 'Page/context where support was requested',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the support call was made',
    source VARCHAR(100) DEFAULT 'external_integration' COMMENT 'Source of the support call',
    status ENUM('pending', 'in_progress', 'resolved', 'closed') DEFAULT 'pending' COMMENT 'Status of the support call',
    assigned_to INT COMMENT 'Agent assigned to handle the support call',
    resolution_notes TEXT COMMENT 'Notes about how the support call was resolved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user_id (user_id),
    INDEX idx_product (product),
    INDEX idx_timestamp (timestamp),
    INDEX idx_status (status),
    INDEX idx_source (source),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add some sample data for testing
INSERT INTO support_calls (user_id, product, context, current_page, source, status) VALUES
(1, 'GRC', '{"email": "admin@example.com", "name": "Admin User", "currentPage": "Dashboard"}', 'Dashboard', 'external_integration', 'resolved'),
(1, 'INMOD', '{"email": "admin@example.com", "name": "Admin User", "currentPage": "Support"}', 'Support', 'external_integration', 'pending');

-- Create a view for easy access to support call information
CREATE OR REPLACE VIEW support_calls_view AS
SELECT 
    sc.id,
    sc.product,
    sc.current_page,
    sc.timestamp,
    sc.source,
    sc.status,
    u.name as user_name,
    u.email as user_email,
    u.phone as user_phone,
    a.name as agent_name,
    sc.context,
    sc.resolution_notes,
    sc.created_at,
    sc.updated_at
FROM support_calls sc
LEFT JOIN users u ON sc.user_id = u.id
LEFT JOIN agents a ON sc.assigned_to = a.id
ORDER BY sc.timestamp DESC;
