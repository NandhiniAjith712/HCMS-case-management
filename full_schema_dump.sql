-- full_schema_dump.sql
-- Generated from currently used backend SQL paths in this codebase.
-- MySQL 8+ compatible (Workbench importable).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `itsm` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `itsm`;

-- ----------------------------
-- Core multitenancy table
-- ----------------------------
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `subdomain` VARCHAR(50) NOT NULL,
  `domain` VARCHAR(100) NULL,
  `status` ENUM('active','suspended','inactive') DEFAULT 'active',
  `plan` ENUM('free','basic','premium','enterprise') DEFAULT 'free',
  `max_users` INT DEFAULT 10,
  `max_tickets_per_month` INT DEFAULT 100,
  `whatsapp_enabled` TINYINT(1) DEFAULT 0,
  `email_enabled` TINYINT(1) DEFAULT 1,
  `custom_branding` JSON NULL,
  `settings` JSON NULL,
  `created_by` INT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_tenants_subdomain` (`subdomain`),
  KEY `idx_tenants_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Users / Agents
-- ----------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `email` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `role` ENUM('user','agent','manager','support_manager','ceo','business_team') DEFAULT 'user',
  `user_type` VARCHAR(30) NULL,
  `department` VARCHAR(100) NULL,
  `manager_id` INT NULL,
  `phone` VARCHAR(20) NULL,
  `email_notifications` TINYINT(1) DEFAULT 1,
  `welcome_url_sent` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `last_login` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_users_tenant_email` (`tenant_id`,`email`),
  KEY `idx_users_tenant` (`tenant_id`),
  KEY `idx_users_manager` (`manager_id`),
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_users_manager` FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `login_id` VARCHAR(50) NULL,
  `password_hash` VARCHAR(255) NULL,
  `password_setup_token` VARCHAR(255) NULL,
  `password_setup_token_expires` DATETIME NULL,
  `password_reset_token` VARCHAR(255) NULL,
  `password_reset_token_expires` DATETIME NULL,
  `role` ENUM('agent','manager','support_manager','ceo','admin','support_agent','user') DEFAULT 'agent',
  `department` VARCHAR(100) NULL,
  `category` VARCHAR(100) NULL,
  `manager_id` INT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `active_tickets` INT NOT NULL DEFAULT 0,
  `escalation_count` INT NOT NULL DEFAULT 0,
  `avg_response_minutes` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `avg_resolution_minutes` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `last_login` DATETIME NULL,
  `last_logout` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_agents_tenant_email` (`tenant_id`,`email`),
  UNIQUE KEY `uq_agents_tenant_login_id` (`tenant_id`,`login_id`),
  KEY `idx_agents_tenant` (`tenant_id`),
  KEY `idx_agents_manager` (`manager_id`),
  KEY `idx_agents_role` (`role`),
  CONSTRAINT `fk_agents_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agents_manager` FOREIGN KEY (`manager_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Product / SLA
-- ----------------------------
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(50) NULL,
  `description` TEXT NULL,
  `sla_time_minutes` INT NOT NULL DEFAULT 480,
  `priority_level` ENUM('P0','P1','P2','P3') DEFAULT 'P2',
  `escalation_time_minutes` INT DEFAULT 240,
  `escalation_level` ENUM('manager','technical_manager','ceo') DEFAULT 'manager',
  `status` ENUM('active','inactive') DEFAULT 'active',
  `created_by` INT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_products_tenant` (`tenant_id`),
  KEY `idx_products_status` (`status`),
  CONSTRAINT `fk_products_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_products_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `modules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `product_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('active','inactive') DEFAULT 'active',
  `created_by` INT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_modules_tenant` (`tenant_id`),
  KEY `idx_modules_product` (`product_id`),
  KEY `idx_modules_status` (`status`),
  CONSTRAINT `fk_modules_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_modules_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_modules_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sla_configurations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `product_id` INT NOT NULL,
  `module_id` INT NOT NULL,
  `issue_name` VARCHAR(150) NOT NULL,
  `issue_description` TEXT NULL,
  `priority_level` ENUM('P0','P1','P2','P3') DEFAULT 'P2',
  `response_time_minutes` INT NOT NULL,
  `resolution_time_minutes` INT NOT NULL,
  `business_hours_only` TINYINT(1) DEFAULT 1,
  `escalation_time_minutes` INT NULL,
  `escalation_level` ENUM('manager','technical_manager','ceo') DEFAULT 'manager',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_by` INT NULL,
  `updated_by` INT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_sla_per_tenant` (`tenant_id`,`product_id`,`module_id`,`issue_name`,`priority_level`),
  KEY `idx_sla_tenant` (`tenant_id`),
  KEY `idx_sla_module_active` (`module_id`,`is_active`),
  CONSTRAINT `fk_sla_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sla_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sla_module` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sla_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sla_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tickets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `user_id` INT NULL,
  `name` VARCHAR(30) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `mobile` VARCHAR(20) NULL,
  `country_code` VARCHAR(10) NULL,
  `product` VARCHAR(100) NULL,
  `product_id` INT NULL,
  `module` VARCHAR(100) NULL,
  `module_id` INT NULL,
  `description` TEXT NOT NULL,
  `issue_type` VARCHAR(50) NULL,
  `issue_type_other` VARCHAR(100) NULL,
  `issue_title` VARCHAR(150) NULL,
  `utm_description` VARCHAR(255) NULL,
  `attachment_name` VARCHAR(255) NULL,
  `attachment_type` VARCHAR(191) NULL,
  `attachment` LONGBLOB NULL,
  `assigned_to` INT NULL,
  `assigned_by` INT NULL,
  `priority` ENUM('low','medium','high','urgent') DEFAULT 'medium',
  `ai_predicted_priority` ENUM('low','medium','high','urgent') NULL,
  `ai_priority_reason` TEXT NULL,
  `ai_priority_confidence` ENUM('low','medium','high') NULL,
  `priority_overridden_by_manager` INT NULL,
  `priority_override_reason` TEXT NULL,
  `priority_overridden_at` DATETIME NULL,
  `status` ENUM('new','in_progress','resolved','closed','escalated') DEFAULT 'new',
  `category` VARCHAR(100) NULL,
  `subcategory` VARCHAR(100) NULL,
  `satisfaction_rating` INT NULL,
  `satisfaction_comment` TEXT NULL,
  `first_response_at` DATETIME NULL,
  `resolved_at` DATETIME NULL,
  `closed_at` DATETIME NULL,
  `resolution_time` INT NULL,
  `sla_first_response_met` TINYINT(1) NULL,
  `sla_reminder_30_sent` TINYINT(1) DEFAULT 0,
  `sla_reminder_15_sent` TINYINT(1) DEFAULT 0,
  `inactivity_reminder_level` TINYINT DEFAULT 0,
  `is_reopened` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_tickets_tenant` (`tenant_id`),
  KEY `idx_tickets_user` (`user_id`),
  KEY `idx_tickets_assigned_to` (`assigned_to`),
  KEY `idx_tickets_product` (`product_id`),
  KEY `idx_tickets_module` (`module_id`),
  KEY `idx_tickets_status` (`status`),
  KEY `idx_tickets_priority` (`priority`),
  CONSTRAINT `fk_tickets_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tickets_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tickets_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `agents`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tickets_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tickets_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tickets_module` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sla_timers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `ticket_id` INT NOT NULL,
  `sla_configuration_id` INT NOT NULL,
  `timer_type` ENUM('response','resolution','escalation') NOT NULL,
  `start_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `pause_time` DATETIME NULL,
  `resume_time` DATETIME NULL,
  `total_elapsed_minutes` INT DEFAULT 0,
  `sla_deadline` DATETIME NOT NULL,
  `status` ENUM('active','paused','completed','breached') DEFAULT 'active',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_sla_timers_tenant` (`tenant_id`),
  KEY `idx_sla_timers_ticket` (`ticket_id`),
  KEY `idx_sla_timers_type` (`timer_type`),
  CONSTRAINT `fk_sla_timers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sla_timers_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sla_timers_config` FOREIGN KEY (`sla_configuration_id`) REFERENCES `sla_configurations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `escalations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `ticket_id` INT NOT NULL,
  `sla_timer_id` INT NULL,
  `from_level` ENUM('agent','manager','technical_manager','ceo') NULL,
  `to_level` ENUM('manager','technical_manager','ceo') NULL,
  `reason` TEXT NULL,
  -- Legacy/alternate columns used by current route inserts
  `escalated_from` VARCHAR(50) NULL,
  `escalated_to` INT NULL,
  `escalation_reason` TEXT NULL,
  `escalated_by` INT NOT NULL,
  `escalated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('pending','in_progress','resolved') DEFAULT 'pending',
  `resolved_at` DATETIME NULL,
  KEY `idx_escalations_tenant` (`tenant_id`),
  KEY `idx_escalations_ticket` (`ticket_id`),
  KEY `idx_escalations_status` (`status`),
  CONSTRAINT `fk_escalations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_escalations_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_escalations_timer` FOREIGN KEY (`sla_timer_id`) REFERENCES `sla_timers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_escalations_by_agent` FOREIGN KEY (`escalated_by`) REFERENCES `agents`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Messaging / Chat
-- ----------------------------
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `ticket_id` INT NOT NULL,
  `sender_type` ENUM('user','agent','system') NOT NULL,
  `sender_id` INT NULL,
  `sender_name` VARCHAR(100) NOT NULL,
  `message` TEXT NOT NULL,
  `channel` ENUM('email','whatsapp','platform_chat') NOT NULL,
  `external_id` VARCHAR(255) NULL,
  `is_internal` TINYINT(1) DEFAULT 0,
  `is_read` TINYINT(1) DEFAULT 0,
  `read_at` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_ticket_messages_ticket` (`ticket_id`),
  KEY `idx_ticket_messages_tenant` (`tenant_id`),
  KEY `idx_ticket_messages_created_at` (`created_at`),
  KEY `idx_ticket_messages_channel` (`channel`),
  CONSTRAINT `fk_ticket_messages_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_messages_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_attachment_analyses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  `attachment_signature` VARCHAR(128) NOT NULL,
  `attachment_name` VARCHAR(255) NULL,
  `attachment_type` VARCHAR(100) NULL,
  `summary` TEXT NOT NULL,
  `key_points_json` LONGTEXT NULL,
  `document_type` VARCHAR(120) NULL,
  `recommended_focus` TEXT NULL,
  `analysis_status` ENUM('completed','failed') NOT NULL DEFAULT 'completed',
  `analysis_error` VARCHAR(255) NULL,
  `analyzed_by` INT NULL,
  `analyzed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_taa_ticket_signature` (`ticket_id`, `attachment_signature`),
  KEY `idx_taa_tenant_ticket` (`tenant_id`, `ticket_id`),
  CONSTRAINT `fk_taa_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_taa_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_feedback` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  `user_id` INT NULL,
  `rating` TINYINT NOT NULL,
  `feedback_text` TEXT NOT NULL,
  `ai_sentiment` ENUM('positive','neutral','negative') NULL,
  `ai_feedback_summary` TEXT NULL,
  `ai_key_theme` VARCHAR(255) NULL,
  `ai_improvement_signal` TEXT NULL,
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_feedback_ticket` (`ticket_id`),
  KEY `idx_feedback_tenant_submitted` (`tenant_id`, `submitted_at`),
  KEY `idx_feedback_tenant_sentiment` (`tenant_id`, `ai_sentiment`),
  KEY `idx_feedback_tenant_theme` (`tenant_id`, `ai_key_theme`),
  CONSTRAINT `fk_feedback_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_feedback_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `ticket_id` INT NOT NULL,
  `session_id` VARCHAR(100) NOT NULL,
  `agent_id` INT NULL,
  `customer_id` INT NULL,
  `status` ENUM('active','paused','closed') DEFAULT 'active',
  `started_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `ended_at` DATETIME NULL,
  `last_activity_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_chat_sessions_tenant_session` (`tenant_id`,`session_id`),
  KEY `idx_chat_sessions_ticket` (`ticket_id`),
  KEY `idx_chat_sessions_status` (`status`),
  CONSTRAINT `fk_chat_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_sessions_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_sessions_agent` FOREIGN KEY (`agent_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_sessions_customer` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_participants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `session_id` VARCHAR(100) NOT NULL,
  `user_id` INT NULL,
  `user_type` ENUM('agent','customer') NOT NULL,
  `user_name` VARCHAR(100) NOT NULL,
  `joined_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME NULL,
  `is_typing` TINYINT(1) DEFAULT 0,
  `last_typing_at` DATETIME NULL,
  UNIQUE KEY `uq_chat_participants_active_key` (`tenant_id`,`session_id`,`user_id`,`user_type`),
  KEY `idx_chat_participants_session` (`session_id`),
  KEY `idx_chat_participants_type` (`user_type`),
  CONSTRAINT `fk_chat_participants_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_participants_session` FOREIGN KEY (`tenant_id`,`session_id`) REFERENCES `chat_sessions`(`tenant_id`,`session_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_participants_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Assignment / workload
-- ----------------------------
CREATE TABLE IF NOT EXISTS `ticket_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `ticket_id` INT NOT NULL,
  `agent_id` INT NOT NULL,
  `assigned_by` INT NOT NULL,
  `assigned_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `unassigned_at` DATETIME NULL,
  `assignment_reason` TEXT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `is_primary` TINYINT(1) DEFAULT 1,
  KEY `idx_ticket_assignments_tenant` (`tenant_id`),
  KEY `idx_ticket_assignments_ticket` (`ticket_id`),
  KEY `idx_ticket_assignments_agent` (`agent_id`),
  KEY `idx_ticket_assignments_active` (`is_active`),
  CONSTRAINT `fk_ticket_assignments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_assignments_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_assignments_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_assignments_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `agents`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_allocations` (
  `ticket_id` INT NOT NULL,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `agent_id` INT NOT NULL,
  `assigned_by` INT NULL,
  `assigned_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_active` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`ticket_id`,`tenant_id`),
  KEY `idx_ticket_allocations_agent` (`agent_id`),
  CONSTRAINT `fk_ticket_allocations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_allocations_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_allocations_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_allocations_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Task workflow
-- ----------------------------
CREATE TABLE IF NOT EXISTS `ticket_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  `task_name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(100) NULL,
  `assigned_agent_id` INT NULL,
  `assigned_by` INT NULL,
  `status` ENUM('pending','in_progress','completed','blocked') NOT NULL DEFAULT 'pending',
  `sla_due_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_ticket_tasks_tenant` (`tenant_id`),
  KEY `idx_ticket_tasks_ticket` (`ticket_id`),
  KEY `idx_ticket_tasks_agent` (`assigned_agent_id`),
  KEY `idx_ticket_tasks_status` (`status`),
  CONSTRAINT `fk_ticket_tasks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_tasks_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_tasks_agent` FOREIGN KEY (`assigned_agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_task_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  `task_id` INT NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `performed_by` INT NULL,
  `details` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_task_history_tenant` (`tenant_id`),
  KEY `idx_task_history_task` (`task_id`),
  KEY `idx_task_history_ticket` (`ticket_id`),
  CONSTRAINT `fk_task_history_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_history_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_history_task` FOREIGN KEY (`task_id`) REFERENCES `ticket_tasks`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_history_actor` FOREIGN KEY (`performed_by`) REFERENCES `agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_task_notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  `task_id` INT NULL,
  `recipient_agent_id` INT NULL,
  `recipient_role` VARCHAR(40) NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_task_notifications_tenant` (`tenant_id`),
  KEY `idx_task_notifications_recipient` (`recipient_agent_id`,`is_read`),
  KEY `idx_task_notifications_ticket` (`ticket_id`),
  CONSTRAINT `fk_task_notifications_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_notifications_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_notifications_task` FOREIGN KEY (`task_id`) REFERENCES `ticket_tasks`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_notifications_recipient` FOREIGN KEY (`recipient_agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Activity / FAQ / Support
-- ----------------------------
CREATE TABLE IF NOT EXISTS `ticket_activity` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `ticket_id` INT NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `performed_by` INT NOT NULL,
  `performed_by_name` VARCHAR(100) NULL,
  `details` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_ticket_activity_tenant` (`tenant_id`),
  KEY `idx_ticket_activity_ticket` (`ticket_id`),
  KEY `idx_ticket_activity_action` (`action`),
  KEY `idx_ticket_activity_created` (`created_at`),
  CONSTRAINT `fk_ticket_activity_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_activity_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ticket_activity_actor` FOREIGN KEY (`performed_by`) REFERENCES `agents`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `faqs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `product` VARCHAR(100) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `question` TEXT NOT NULL,
  `answer` TEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_faqs_tenant` (`tenant_id`),
  KEY `idx_faqs_product` (`product`),
  KEY `idx_faqs_category` (`category`),
  CONSTRAINT `fk_faqs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_calls` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `product` VARCHAR(100) NOT NULL,
  `context` JSON NULL,
  `current_page` VARCHAR(255) NULL,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `source` VARCHAR(100) DEFAULT 'external_integration',
  `status` ENUM('pending','in_progress','resolved','closed') DEFAULT 'pending',
  `assigned_to` INT NULL,
  `resolution_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_support_calls_user` (`user_id`),
  KEY `idx_support_calls_product` (`product`),
  KEY `idx_support_calls_timestamp` (`timestamp`),
  KEY `idx_support_calls_status` (`status`),
  KEY `idx_support_calls_source` (`source`),
  CONSTRAINT `fk_support_calls_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_support_calls_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `agents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Views used by assignment routes
-- ----------------------------
CREATE OR REPLACE VIEW `current_assignments` AS
SELECT
  ta.id AS assignment_id,
  ta.ticket_id,
  ta.agent_id,
  a.name AS agent_name,
  a.email AS agent_email,
  a.role AS agent_role,
  ta.assigned_by,
  ab.name AS assigned_by_name,
  ta.assigned_at,
  'manual' AS assignment_type,
  COALESCE(t.priority, 'medium') AS priority_level,
  ta.assignment_reason AS assignment_notes,
  COALESCE(ta.is_primary, 1) AS is_primary,
  COALESCE(t.status, 'new') AS ticket_status,
  COALESCE(t.issue_title, t.description) AS issue_title,
  t.created_at AS ticket_created
FROM ticket_assignments ta
JOIN tickets t ON ta.ticket_id = t.id
JOIN agents a ON ta.agent_id = a.id
LEFT JOIN agents ab ON ta.assigned_by = ab.id
WHERE ta.is_active = 1;

CREATE OR REPLACE VIEW `assignment_history` AS
SELECT
  ta.id AS assignment_id,
  ta.ticket_id,
  ta.agent_id,
  a.name AS agent_name,
  ta.assigned_by,
  ab.name AS assigned_by_name,
  ta.assigned_at,
  ta.unassigned_at,
  CASE
    WHEN ta.is_active = 1 THEN 'active'
    WHEN ta.unassigned_at IS NOT NULL THEN 'completed'
    ELSE 'inactive'
  END AS status,
  'manual' AS assignment_type,
  ta.assignment_reason AS assignment_notes,
  CASE
    WHEN ta.unassigned_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, ta.assigned_at, ta.unassigned_at)
    ELSE NULL
  END AS duration_minutes,
  COALESCE(t.issue_title, t.description) AS issue_title,
  COALESCE(t.status, 'new') AS ticket_status
FROM ticket_assignments ta
JOIN tickets t ON ta.ticket_id = t.id
JOIN agents a ON ta.agent_id = a.id
LEFT JOIN agents ab ON ta.assigned_by = ab.id;

CREATE OR REPLACE VIEW `agent_workload` AS
SELECT
  a.id AS agent_id,
  a.name AS agent_name,
  a.email AS agent_email,
  a.role AS agent_role,
  COUNT(ta.id) AS total_active_assignments,
  COUNT(CASE WHEN COALESCE(ta.is_primary, 1) = 1 THEN 1 END) AS primary_assignments,
  COUNT(CASE WHEN COALESCE(t.priority, 'medium') = 'urgent' THEN 1 END) AS urgent_tickets,
  COUNT(CASE WHEN COALESCE(t.priority, 'medium') = 'high' THEN 1 END) AS high_priority_tickets,
  ROUND(AVG(CASE
    WHEN ta.unassigned_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, ta.assigned_at, ta.unassigned_at)
    ELSE NULL
  END), 2) AS avg_workload_score,
  MIN(ta.assigned_at) AS oldest_assignment,
  MAX(ta.assigned_at) AS newest_assignment
FROM agents a
LEFT JOIN ticket_assignments ta ON a.id = ta.agent_id AND ta.is_active = 1
LEFT JOIN tickets t ON ta.ticket_id = t.id
GROUP BY a.id, a.name, a.email, a.role;

SET FOREIGN_KEY_CHECKS = 1;
