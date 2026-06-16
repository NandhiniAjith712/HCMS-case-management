-- Migration: Email-to-Ticket Intake and Organizations
-- Created: 2026-05-11

-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  domain VARCHAR(100),
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_org_domain (domain),
  INDEX idx_org_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add organization_id to users and tickets
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INT AFTER tenant_id;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS organization_id INT AFTER tenant_id;

-- Add foreign key constraints
ALTER TABLE users ADD CONSTRAINT fk_user_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD CONSTRAINT fk_ticket_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- 3. Create incoming_emails table
CREATE TABLE IF NOT EXISTS incoming_emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  sender_email VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255),
  subject VARCHAR(255),
  body LONGTEXT,
  html_body LONGTEXT,
  message_id VARCHAR(255),
  thread_id VARCHAR(255),
  received_at DATETIME NOT NULL,
  processing_status ENUM('pending', 'processed', 'review_required', 'ignored', 'spam') DEFAULT 'pending',
  validation_result JSON,
  linked_ticket_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ie_message_id (message_id),
  INDEX idx_ie_status (processing_status),
  FOREIGN KEY (linked_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create mail_review_queue table
CREATE TABLE IF NOT EXISTS mail_review_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  email_id INT NOT NULL,
  review_status ENUM('pending', 'approved', 'rejected', 'ignored') DEFAULT 'pending',
  reviewed_by INT,
  review_action ENUM('create_ticket', 'link_ticket', 'ignore', 'mark_spam'),
  review_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (email_id) REFERENCES incoming_emails(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
