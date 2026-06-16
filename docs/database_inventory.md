# Database Inventory

## Overview
The HCMS database uses MySQL with a connection pooling strategy. The schema supports multi-tenancy, ticket management, SLA tracking, real-time communication, and comprehensive workflow features. The database layer uses direct SQL queries via mysql2 without an ORM.

## Database Configuration
- **Database**: MySQL
- **Connection Pool**: mysql2/promise
- **Charset**: utf8mb4
- **Timezone**: UTC (enforced at session level)
- **Connection Limit**: 10
- **Keep Alive**: Enabled (10s initial delay)

---

## Core Tables

### tickets
**Purpose**: Central table for all support tickets/cases

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `user_id` (INT, NULL) - Customer/user reference
- `name` (VARCHAR(30), NOT NULL) - Customer name
- `email` (VARCHAR(100), NOT NULL) - Customer email
- `mobile` (VARCHAR(15)) - Customer phone number
- `country_code` (VARCHAR(10)) - Country code for phone
- `description` (TEXT, NOT NULL) - Ticket description
- `issue_type` (VARCHAR(50)) - Issue category
- `issue_type_other` (VARCHAR(100)) - Other issue type
- `issue_title` (VARCHAR(150)) - Issue title
- `attachment_name` (VARCHAR(255)) - Attachment filename
- `attachment_type` (VARCHAR(50)) - Attachment MIME type
- `attachment` (LONGBLOB) - Attachment binary data
- `assigned_to` (INT, NULL) - Assigned agent ID
- `assigned_by` (INT, NULL) - Assigner user ID
- `assignment_source` (ENUM: 'ai','fallback','manual', NULL) - Assignment method
- `assignment_reason` (VARCHAR(255), NULL) - Assignment justification
- `priority` (ENUM: 'low','medium','high','urgent', DEFAULT 'medium') - Ticket priority
- `status` (ENUM: 'new','in_progress','resolved','closed','escalated', DEFAULT 'new') - Ticket status
- `category` (VARCHAR(100)) - Ticket category
- `subcategory` (VARCHAR(100)) - Ticket subcategory
- `satisfaction_rating` (INT) - Customer satisfaction (1-5)
- `satisfaction_comment` (TEXT) - Customer feedback
- `product_id` (INT, NULL) - Associated product
- `product` (VARCHAR(100)) - Product name (legacy)
- `module` (VARCHAR(100)) - Module name
- `module_id` (INT) - Module reference
- `department_id` (INT, NULL) - Department reference
- `source` (VARCHAR(50), DEFAULT 'web') - Ticket source (web, email, whatsapp)
- `sla_config_id` (INT) - SLA configuration reference
- `sla_response_time_minutes` (INT) - SLA response time
- `sla_resolution_time_minutes` (INT) - SLA resolution time
- `sla_match_level` (VARCHAR(50)) - SLA match level
- `sla_first_response_met` (TINYINT(1), NULL) - SLA first response compliance
- `sla_reminder_30_sent` (TINYINT(1), DEFAULT 0) - 30min reminder sent
- `sla_reminder_15_sent` (TINYINT(1), DEFAULT 0) - 15min reminder sent
- `inactivity_reminder_level` (TINYINT, DEFAULT 0) - Inactivity reminder level
- `utm_description` (VARCHAR(255)) - UTM tracking description
- `first_response_at` (DATETIME, NULL) - First response timestamp
- `resolved_at` (DATETIME, NULL) - Resolution timestamp
- `group_title` (VARCHAR(255), NULL) - Group ticket title
- `group_internal_note` (TEXT, NULL) - Group internal note
- `grouped_at` (DATETIME, NULL) - Group timestamp
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp
- `closed_at` (DATETIME) - Closure timestamp
- `resolution_time` (INT) - Resolution time in minutes

**Foreign Keys**:
- `fk_user_id` → users(id) ON DELETE SET NULL
- `fk_assigned_by` → users(id) ON DELETE SET NULL
- `fk_assigned_to` → agents(id) ON DELETE SET NULL
- `fk_product_id` → products(id) ON DELETE SET NULL
- `fk_tickets_department` → departments(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- INDEX on tenant_id (added via migration)

**Modules Using This Table**:
- routes/tickets.js - Core ticket operations
- routes/management/tickets.js - Management ticket operations
- routes/management/assignments.js - Assignment management
- services/ticketService.js - Ticket business logic
- services/ticketEventNotificationService.js - Notification orchestration
- services/slaResolutionService.js - SLA management
- services/aiAgentAllocationService.js - AI allocation
- services/priorityService.js - Priority calculation
- utils/ticketAssignment.js - Assignment logic
- scheduled-escalation.js - Escalation workflow
- scheduled-inactivity.js - Inactivity workflow

---

### users
**Purpose**: User accounts for customers and staff

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `email` (VARCHAR(100), NOT NULL, UNIQUE) - User email
- `name` (VARCHAR(100), NOT NULL) - User name
- `password_hash` (VARCHAR(255)) - Password hash
- `role` (ENUM: 'user','agent','manager','support_manager','ceo','business_team','org_spoc','product_spoc', DEFAULT 'user') - User role
- `department` (VARCHAR(100)) - Department name (legacy)
- `primary_department_id` (INT, NULL) - Primary department FK
- `manager_id` (INT) - Manager reference
- `phone` (VARCHAR(20)) - Phone number
- `email_notifications` (BOOLEAN, DEFAULT TRUE) - Email notification preference
- `welcome_url_sent` (BOOLEAN, DEFAULT FALSE) - Welcome URL sent flag
- `email_verified` (BOOLEAN, DEFAULT FALSE) - Email verification status
- `email_verified_at` (DATETIME, NULL) - Email verification timestamp
- `verification_token_hash` (VARCHAR(255), NULL) - Verification token hash
- `verification_token_expires_at` (DATETIME, NULL) - Token expiration
- `verification_sent_at` (DATETIME, NULL) - Verification sent timestamp
- `verification_send_count` (INT, DEFAULT 0) - Verification send count
- `account_status` (ENUM: 'pending_verification','active','inactive','blocked', DEFAULT 'active') - Account status
- `is_public_domain_email` (BOOLEAN, DEFAULT FALSE) - Public domain email flag
- `public_domain_acknowledged` (BOOLEAN, DEFAULT FALSE) - Public domain acknowledged
- `public_domain_acknowledged_at` (DATETIME, NULL) - Acknowledgment timestamp
- `product_scope_id` (INT, NULL) - Product scope for SPOC
- `is_external` (BOOLEAN, DEFAULT FALSE) - External user flag
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp
- `is_active` (BOOLEAN, DEFAULT TRUE) - Active status
- `last_login` (DATETIME) - Last login timestamp

**Foreign Keys**:
- `fk_manager_id` → users(id) ON DELETE SET NULL
- `fk_users_primary_department` → departments(id) ON DELETE SET NULL
- `fk_user_product_scope` → products(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY (email)
- UNIQUE KEY unique_email_per_tenant (tenant_id, email) - added via migration
- INDEX on tenant_id

**Modules Using This Table**:
- routes/core/users.js - User management
- routes/auth.js - Authentication
- routes/agents.js - Agent management (references users)
- services/accountLifecycleService.js - Account lifecycle
- middleware/auth.js - Authentication
- middleware/tenant.js - Tenant context

---

### agents
**Purpose**: Staff/agent accounts for support team

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `name` (VARCHAR(100), NOT NULL) - Agent name
- `email` (VARCHAR(100), NOT NULL, UNIQUE) - Agent email
- `password_hash` (VARCHAR(255)) - Password hash
- `role` (ENUM: 'support_agent','support_manager','ceo', DEFAULT 'support_agent') - Agent role
- `department` (VARCHAR(100)) - Department name (legacy)
- `primary_department_id` (INT, NULL) - Primary department FK
- `manager_id` (INT) - Manager reference
- `level` (ENUM: 'L1','L2','L3', NULL) - Support level
- `is_active` (BOOLEAN, DEFAULT TRUE) - Active status
- `active_tickets` (INT, DEFAULT 0) - Active ticket count
- `escalation_count` (INT, DEFAULT 0) - Escalation count
- `avg_response_minutes` (DECIMAL(10,2), DEFAULT 0) - Average response time
- `avg_resolution_minutes` (DECIMAL(10,2), DEFAULT 0) - Average resolution time
- `password_setup_token` (VARCHAR(255), NULL) - Password setup token
- `password_setup_token_expires` (DATETIME, NULL) - Token expiration
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp
- `last_login` (DATETIME) - Last login timestamp
- `last_logout` (DATETIME) - Last logout timestamp

**Foreign Keys**:
- `fk_manager_id` → agents(id) ON DELETE SET NULL
- `fk_agents_primary_department` → departments(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY (email)
- UNIQUE KEY unique_email_per_tenant (tenant_id, email) - added via migration
- INDEX on tenant_id

**Modules Using This Table**:
- routes/agents.js - Agent management
- routes/core/agents.js - Core agent operations
- utils/ticketAssignment.js - Assignment logic
- utils/agentLevelSync.js - Level synchronization
- services/aiAgentAllocationService.js - AI allocation

---

### agent_skills
**Purpose**: Agent skill definitions for AI-based routing

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `agent_id` (INT, NOT NULL) - Agent reference
- `domain` (VARCHAR(80), NOT NULL) - Skill domain
- `sub_skill` (VARCHAR(80), NOT NULL) - Sub-skill
- `proficiency` (ENUM: 'Beginner','Intermediate','Expert', DEFAULT 'Beginner') - Skill level
- `created_at` (DATETIME, NOT NULL, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- None explicitly defined (agent_id references agents table logically)

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY uniq_agent_skill (tenant_id, agent_id, domain, sub_skill)
- INDEX idx_agent_skill_lookup (tenant_id, domain, sub_skill, proficiency)
- INDEX idx_agent_skill_agent (tenant_id, agent_id)

**Modules Using This Table**:
- services/aiAgentAllocationService.js - AI-based skill matching
- routes/agents.js - Agent skill management

---

### agent_sessions
**Purpose**: Track agent login/logout sessions

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `agent_id` (INT, NOT NULL) - Agent reference
- `session_token` (VARCHAR(255), NOT NULL, UNIQUE) - Session token
- `login_time` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Login timestamp
- `logout_time` (DATETIME, NULL) - Logout timestamp
- `ip_address` (VARCHAR(45)) - IP address
- `user_agent` (TEXT) - User agent string
- `is_active` (BOOLEAN, DEFAULT TRUE) - Session active status
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- References users(id) ON DELETE CASCADE (note: should reference agents)

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY (session_token)

**Modules Using This Table**:
- routes/agents.js - Session tracking
- middleware/auth.js - Session validation

---

### tenants
**Purpose**: Multi-tenant organization management

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `name` (VARCHAR(100), NOT NULL) - Tenant name
- `subdomain` (VARCHAR(50), NOT NULL, UNIQUE) - Subdomain (e.g., company1.tick-system.com)
- `domain` (VARCHAR(100), NULL) - Custom domain
- `status` (ENUM: 'active','suspended','inactive', DEFAULT 'active') - Tenant status
- `plan` (ENUM: 'free','basic','premium','enterprise', DEFAULT 'free') - Subscription plan
- `max_users` (INT, DEFAULT 10) - Maximum users
- `max_tickets_per_month` (INT, DEFAULT 100) - Monthly ticket limit
- `whatsapp_enabled` (BOOLEAN, DEFAULT FALSE) - WhatsApp integration enabled
- `email_enabled` (BOOLEAN, DEFAULT TRUE) - Email integration enabled
- `custom_branding` (JSON, NULL) - Custom branding (logo, colors)
- `settings` (JSON, NULL) - Tenant-specific settings
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp
- `created_by` (INT, NULL) - Creator reference

**Foreign Keys**:
- None

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_subdomain (subdomain)
- INDEX idx_status (status)

**Modules Using This Table**:
- routes/tenants.js - Tenant management
- middleware/tenant.js - Tenant context resolution
- All routes - Tenant isolation via middleware

---

### departments
**Purpose**: Organizational department structure

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `name` (VARCHAR(100), NOT NULL) - Department name
- `status` (ENUM: 'active','inactive', DEFAULT 'active') - Department status
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- None explicitly defined (tenant_id references tenants table logically)

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY uq_departments_tenant_name (tenant_id, name)

**Modules Using This Table**:
- routes/departments.js - Department management
- routes/agents.js - Agent department assignment
- routes/tickets.js - Ticket department assignment
- department_setup.js migration - Department setup

---

### manager_department_permissions
**Purpose**: Manager permissions per department

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `manager_id` (INT, NOT NULL) - Manager reference
- `department_id` (INT, NOT NULL) - Department reference
- `can_view` (TINYINT(1), DEFAULT 0) - Can view tickets
- `can_update` (TINYINT(1), DEFAULT 0) - Can update tickets
- `can_assign` (TINYINT(1), DEFAULT 0) - Can assign tickets
- `can_close` (TINYINT(1), DEFAULT 0) - Can close tickets
- `can_view_reports` (TINYINT(1), DEFAULT 0) - Can view reports
- `can_manage_escalations` (TINYINT(1), DEFAULT 0) - Can manage escalations
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- `fk_mdp_manager` → agents(id) ON DELETE CASCADE
- `fk_mdp_department` → departments(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY uq_manager_dept (manager_id, department_id)

**Modules Using This Table**:
- routes/management/tickets.js - Department-based permissions
- routes/agents.js - Manager permission management

---

## Assignment Tables

### ticket_assignments
**Purpose**: Track all ticket assignment history

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `agent_id` (INT, NOT NULL) - Agent reference
- `assigned_by` (INT, NOT NULL) - Assigner reference
- `assigned_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Assignment timestamp
- `unassigned_at` (DATETIME, NULL) - Unassignment timestamp
- `assignment_reason` (TEXT) - Assignment reason
- `is_active` (BOOLEAN, DEFAULT TRUE) - Active assignment status
- `is_primary` (BOOLEAN, DEFAULT TRUE) - Primary assignment flag

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE
- `fk_agent_id` → users(id) ON DELETE CASCADE
- `fk_assigned_by` → users(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)

**Modules Using This Table**:
- routes/management/assignments.js - Assignment management
- utils/ticketAssignment.js - Assignment logic
- services/aiAgentAllocationService.js - AI allocation
- views: current_assignments, assignment_history

---

### ticket_allocations
**Purpose**: Current active allocation (single row per ticket)

**Columns**:
- `ticket_id` (INT, PK) - Ticket reference (primary key)
- `agent_id` (INT, NOT NULL) - Agent reference
- `assigned_by` (INT, NULL) - Assigner reference
- `assigned_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Assignment timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp
- `is_active` (BOOLEAN, DEFAULT TRUE) - Active status

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE
- `fk_agent_id` → users(id) ON DELETE CASCADE
- `fk_assigned_by` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (ticket_id)

**Modules Using This Table**:
- services/aiAgentAllocationService.js - Current allocation tracking
- utils/ticketAssignment.js - Allocation logic

---

## SLA Tables

### products
**Purpose**: Product/service definitions with SLA settings

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `name` (VARCHAR(100), NOT NULL) - Product name
- `slug` (VARCHAR(50)) - URL slug for support integration
- `description` (TEXT) - Product description
- `sla_time_minutes` (INT, NOT NULL, DEFAULT 480) - SLA time in minutes
- `priority_level` (ENUM: 'P0','P1','P2','P3', DEFAULT 'P2') - Priority level
- `escalation_time_minutes` (INT, DEFAULT 240) - Escalation time
- `escalation_level` (ENUM: 'manager','technical_manager','ceo', DEFAULT 'manager') - Escalation level
- `status` (ENUM: 'active','inactive', DEFAULT 'active') - Product status
- `utm_description` (VARCHAR(100), NULL) - UTM description
- `priority_allocation_type` (VARCHAR(30), NOT NULL, DEFAULT 'ai_only') - Allocation type
- `created_by` (INT) - Creator reference
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- `fk_created_by` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- INDEX on tenant_id

**Modules Using This Table**:
- routes/tickets.js - Product selection
- routes/productSpoc.js - Product SPOC management
- services/slaResolutionService.js - SLA resolution
- services/priorityService.js - Priority calculation

---

### modules
**Purpose**: Product sub-components/modules

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `product_id` (INT, NOT NULL) - Product reference
- `name` (VARCHAR(100), NOT NULL) - Module name
- `description` (TEXT) - Module description
- `status` (ENUM: 'active','inactive', DEFAULT 'active') - Module status
- `priority_allocation_type` (VARCHAR(30), NOT NULL, DEFAULT 'ai_only') - Allocation type
- `created_by` (INT) - Creator reference
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- `fk_product_id` → products(id) ON DELETE CASCADE
- `fk_created_by` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- INDEX on tenant_id

**Modules Using This Table**:
- routes/tickets.js - Module selection
- services/slaResolutionService.js - SLA configuration

---

### sla_configurations
**Purpose**: Detailed SLA rules per product/module/issue

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `product_id` (INT, NOT NULL) - Product reference
- `module_id` (INT, NOT NULL) - Module reference
- `issue_name` (VARCHAR(150), NOT NULL) - Issue name
- `issue_description` (TEXT) - Issue description
- `priority_level` (ENUM: 'P0','P1','P2','P3', DEFAULT 'P2') - Priority level
- `response_time_minutes` (INT, NOT NULL) - First response time
- `resolution_time_minutes` (INT, NOT NULL) - Resolution time
- `business_hours_only` (BOOLEAN, DEFAULT TRUE) - Business hours only
- `escalation_time_minutes` (INT) - Escalation time
- `escalation_level` (ENUM: 'manager','technical_manager','ceo', DEFAULT 'manager') - Escalation level
- `is_active` (BOOLEAN, DEFAULT TRUE) - Active status
- `created_by` (INT) - Creator reference
- `updated_by` (INT) - Updater reference
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- `fk_product_id` → products(id) ON DELETE CASCADE
- `fk_module_id` → modules(id) ON DELETE CASCADE
- `fk_created_by` → users(id) ON DELETE SET NULL
- `fk_updated_by` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY unique_sla_config (product_id, module_id, issue_name, priority_level)
- INDEX on tenant_id

**Modules Using This Table**:
- routes/management/sla.js - SLA management
- services/slaResolutionService.js - SLA resolution
- scheduled-escalation.js - Escalation workflow

---

### sla_timers
**Purpose**: Track SLA compliance timers per ticket

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `sla_configuration_id` (INT, NOT NULL) - SLA configuration reference
- `timer_type` (ENUM: 'response','resolution','escalation', NOT NULL) - Timer type
- `start_time` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Timer start
- `pause_time` (DATETIME, NULL) - Pause timestamp
- `resume_time` (DATETIME, NULL) - Resume timestamp
- `total_elapsed_minutes` (INT, DEFAULT 0) - Total elapsed time
- `sla_deadline` (DATETIME, NOT NULL) - SLA deadline
- `status` (ENUM: 'active','paused','completed','breached', DEFAULT 'active') - Timer status
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE
- `fk_sla_configuration_id` → sla_configurations(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)
- INDEX on tenant_id

**Modules Using This Table**:
- routes/management/sla.js - SLA timer management
- services/slaResolutionService.js - SLA tracking
- scheduled-escalation.js - Escalation triggers
- components/sla/SLATimer.js - Frontend timer display

---

### escalations
**Purpose**: Track ticket escalations

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `sla_timer_id` (INT, NOT NULL) - SLA timer reference
- `from_level` (ENUM: 'agent','manager','technical_manager','ceo', NOT NULL) - From level
- `to_level` (ENUM: 'manager','technical_manager','ceo', NOT NULL) - To level
- `escalated_from` (VARCHAR(50), NULL) - Escalated from (alternative)
- `escalated_to` (INT, NULL) - Escalated to user ID
- `reason` (TEXT) - Escalation reason
- `escalation_reason` (TEXT, NULL) - Detailed escalation reason
- `escalated_by` (INT, NOT NULL) - Escalator reference
- `escalated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Escalation timestamp
- `status` (ENUM: 'pending','in_progress','resolved', DEFAULT 'pending') - Escalation status
- `resolved_at` (DATETIME, NULL) - Resolution timestamp

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE
- `fk_sla_timer_id` → sla_timers(id) ON DELETE CASCADE (nullable)
- `fk_escalated_by` → users(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)
- INDEX on tenant_id

**Modules Using This Table**:
- routes/management/sla.js - Escalation management
- scheduled-escalation.js - Escalation workflow
- services/ticketEventNotificationService.js - Escalation notifications

---

## Communication Tables

### ticket_messages
**Purpose**: Unified conversation thread for all channels

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `conversation_key` (VARCHAR(255), NULL) - Conversation grouping key
- `sender_type` (ENUM: 'user','agent','system', NOT NULL) - Sender type
- `sender_id` (INT, NULL) - Sender user ID
- `sender_name` (VARCHAR(100), NOT NULL) - Sender name
- `message` (TEXT, NOT NULL) - Message content
- `channel` (ENUM: 'email','whatsapp','platform_chat', NOT NULL) - Communication channel
- `external_id` (VARCHAR(255), NULL) - External message ID
- `requires_ack` (BOOLEAN, DEFAULT FALSE) - Requires acknowledgment
- `acknowledged_at` (DATETIME, NULL) - Acknowledgment timestamp
- `acknowledged_by` (VARCHAR(255), NULL) - Acknowledged by
- `is_internal` (BOOLEAN, DEFAULT FALSE) - Internal message flag
- `is_read` (BOOLEAN, DEFAULT FALSE) - Read status
- `read_at` (DATETIME, NULL) - Read timestamp
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_ticket_id (ticket_id)
- INDEX idx_tenant_id (tenant_id)
- INDEX idx_conversation_key (conversation_key)
- INDEX idx_created_at (created_at)
- INDEX idx_channel (channel)

**Modules Using This Table**:
- routes/communication/chat.js - Chat operations
- routes/communication/replies.js - Reply operations
- services/ticketMessagesService.js - Message management
- services/incomingEmailService.js - Email to message conversion
- components/chat/* - Frontend chat components

---

### chat_sessions
**Purpose**: Track active chat sessions

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `session_id` (VARCHAR(100), NOT NULL, UNIQUE) - Session ID
- `agent_id` (INT, NULL) - Agent reference
- `customer_id` (INT, NULL) - Customer reference
- `status` (ENUM: 'active','paused','closed', DEFAULT 'active') - Session status
- `started_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Start timestamp
- `ended_at` (DATETIME, NULL) - End timestamp
- `last_activity_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Last activity

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE
- `fk_agent_id` → users(id) ON DELETE SET NULL
- `fk_customer_id` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_session_id (session_id)
- INDEX idx_ticket_id (ticket_id)
- INDEX idx_status (status)

**Modules Using This Table**:
- routes/communication/chat.js - Session management
- websocket-server.js - WebSocket session tracking

---

### chat_participants
**Purpose**: Track participants in chat sessions

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `session_id` (VARCHAR(100), NOT NULL) - Session reference
- `user_id` (INT, NULL) - User reference
- `user_type` (ENUM: 'agent','customer', NOT NULL) - User type
- `user_name` (VARCHAR(100), NOT NULL) - User name
- `joined_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Join timestamp
- `left_at` (DATETIME, NULL) - Leave timestamp
- `is_typing` (BOOLEAN, DEFAULT FALSE) - Typing status
- `last_typing_at` (DATETIME, NULL) - Last typing timestamp

**Foreign Keys**:
- `fk_session_id` → chat_sessions(session_id) ON DELETE CASCADE
- `fk_user_id` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_session_id (session_id)
- INDEX idx_user_type (user_type)

**Modules Using This Table**:
- routes/communication/chat.js - Participant management
- websocket-server.js - Real-time participant tracking

---

## Email Tables

### incoming_emails
**Purpose**: Store incoming emails for processing

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `sender_email` (VARCHAR(255), NOT NULL) - Sender email
- `sender_name` (VARCHAR(255)) - Sender name
- `subject` (VARCHAR(255)) - Email subject
- `body` (LONGTEXT) - Email body (plain text)
- `html_body` (LONGTEXT) - Email body (HTML)
- `message_id` (VARCHAR(255)) - Email message ID
- `thread_id` (VARCHAR(255)) - Email thread ID
- `received_at` (DATETIME, NOT NULL) - Received timestamp
- `processing_status` (ENUM: 'pending','processed','review_required','pending_review','ignored','spam','pending_continuation_review','converted_to_ticket', DEFAULT 'pending') - Processing status
- `email_type` (VARCHAR(50)) - Email type
- `existing_user_id` (INT) - Existing user reference
- `validation_result` (JSON) - Validation result
- `ai_extracted_fields` (JSON) - AI-extracted fields
- `linked_ticket_id` (INT) - Linked ticket ID
- `matched_ticket_id` (INT, NULL) - Matched ticket ID
- `ai_confidence_score` (DECIMAL(4,3), NULL) - AI confidence score
- `ai_continuation_reason` (TEXT, NULL) - AI continuation reason
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- `fk_linked_ticket_id` → tickets(id) ON DELETE SET NULL
- `fk_matched_ticket_id` → tickets(id) ON DELETE SET NULL
- `fk_existing_user_id` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_ie_message_id (message_id)
- INDEX idx_ie_status (processing_status)

**Modules Using This Table**:
- services/incomingEmailService.js - Email processing
- routes/management/mailReview.js - Mail review queue
- services/aiExtractionService.js - AI field extraction

---

### mail_review_queue
**Purpose**: Queue for email review workflow

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `email_id` (INT, NOT NULL) - Email reference
- `review_status` (ENUM: 'pending','approved','rejected','ignored', DEFAULT 'pending') - Review status
- `reviewed_by` (INT) - Reviewer reference
- `review_action` (ENUM: 'create_ticket','link_ticket','ignore','mark_spam') - Review action
- `review_notes` (TEXT) - Review notes
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- `fk_email_id` → incoming_emails(id) ON DELETE CASCADE
- `fk_reviewed_by` → users(id) ON DELETE SET NULL

**Indexes**:
- PRIMARY KEY (id)

**Modules Using This Table**:
- routes/management/mailReview.js - Mail review workflow
- services/incomingEmailService.js - Review queue management

---

## Knowledge & Support Tables

### faqs
**Purpose**: FAQ knowledge base

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `product` (VARCHAR(100), NOT NULL) - Product context
- `category` (VARCHAR(100), NOT NULL) - FAQ category
- `question` (TEXT, NOT NULL) - FAQ question
- `answer` (TEXT, NOT NULL) - FAQ answer
- `tags` (TEXT, NULL) - Keyword tags
- `faq_embedding` (JSON, NULL) - Vector embedding for semantic search
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- None

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_faqs_tenant (tenant_id)
- INDEX idx_faqs_product (product)
- INDEX idx_faqs_category (category)

**Modules Using This Table**:
- routes/faqs.js - FAQ management
- services/faqSemanticSearchService.js - Semantic search
- components/help/HelpFAQPage.js - FAQ display
- components/admin/FAQAdminPage.js - FAQ management

---

### ticket_resolution_details
**Purpose**: Detailed resolution information for tickets

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `resolution_summary` (TEXT, NOT NULL) - Resolution summary
- `internal_steps` (TEXT, NOT NULL) - Internal resolution steps
- `root_cause` (TEXT, NULL) - Root cause analysis
- `fix_type` (ENUM: 'Configuration Issue','Data Fix','Code Fix','User Error','External Dependency', NOT NULL) - Fix type
- `reference_data` (VARCHAR(500), NULL) - Reference data
- `created_by` (INT, NULL) - Creator reference
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)
- UNIQUE KEY uniq_ticket_resolution_details_ticket (ticket_id)
- INDEX idx_ticket_resolution_details_tenant_ticket (tenant_id, ticket_id)

**Modules Using This Table**:
- routes/tickets.js - Resolution details
- components/tickets/TicketDetailPage.js - Resolution display

---

### support_calls
**Purpose**: Track support call/integration requests

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `user_id` (INT, NOT NULL) - User reference
- `product` (VARCHAR(100), NOT NULL) - Product context
- `context` (JSON, NULL) - Call context
- `current_page` (VARCHAR(255), NULL) - Current page
- `timestamp` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP) - Call timestamp
- `source` (VARCHAR(100), DEFAULT 'external_integration') - Call source
- `status` (ENUM: 'pending','in_progress','resolved','closed', DEFAULT 'pending') - Call status
- `assigned_to` (INT, NULL) - Assigned agent
- `resolution_notes` (TEXT, NULL) - Resolution notes
- `created_at` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `updated_at` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- None explicitly defined

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_support_calls_user (user_id)
- INDEX idx_support_calls_product (product)
- INDEX idx_support_calls_status (status)

**Modules Using This Table**:
- routes/support.js - Support integration
- routes/core/staff.js - Staff support calls

---

## Notification Tables

### app_notifications
**Purpose**: In-app notifications for users

**Columns**:
- `id` (CHAR(36), NOT NULL, PK) - UUID primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `recipient_role` (VARCHAR(20), NOT NULL) - Recipient role
- `recipient_staff_id` (INT, NULL) - Recipient staff ID
- `recipient_user_id` (INT, NULL) - Recipient user ID
- `title` (VARCHAR(255), NOT NULL) - Notification title
- `description` (TEXT) - Notification description
- `type` (VARCHAR(40), NOT NULL) - Notification type
- `ticket_id` (INT, NULL) - Related ticket
- `is_read` (TINYINT(1), NOT NULL, DEFAULT 0) - Read status
- `created_at` (DATETIME, NOT NULL, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp
- `dedupe_key` (VARCHAR(190), NULL) - Deduplication key

**Foreign Keys**:
- None explicitly defined (ticket_id references tickets logically)

**Indexes**:
- PRIMARY KEY (id)
- KEY idx_app_notif_tenant_created (tenant_id, created_at)
- KEY idx_app_notif_staff (tenant_id, recipient_staff_id, recipient_role, is_read)
- KEY idx_app_notif_user (tenant_id, recipient_user_id, recipient_role, is_read)
- KEY idx_app_notif_ticket (tenant_id, ticket_id)
- UNIQUE KEY uniq_app_notif_dedupe (tenant_id, dedupe_key)

**Modules Using This Table**:
- routes/notifications.js - Notification management
- services/appNotificationService.js - Notification service
- services/ticketEventNotificationService.js - Notification orchestration
- context/NotificationContext.js - Frontend notification context
- components/notifications/* - Frontend notification components

---

## Performance & Analytics Tables

### performance_ratings
**Purpose**: Performance ratings for agents

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `executive_id` (INT, NOT NULL) - Executive reference
- `manager_id` (INT, NOT NULL) - Manager reference
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `rating` (INT, NOT NULL, CHECK 1-5) - Rating (1-5)
- `comment` (TEXT) - Rating comment
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- `fk_executive_id` → users(id) ON DELETE CASCADE
- `fk_manager_id` → users(id) ON DELETE CASCADE
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)

**Modules Using This Table**:
- routes/agents.js - Performance tracking
- routes/management/tickets.js - Rating collection

---

### ticket_activity
**Purpose**: Audit log for ticket activities

**Columns**:
- `id` (INT, PK, AUTO_INCREMENT) - Primary key
- `tenant_id` (INT, NOT NULL, DEFAULT 1) - Multi-tenant identifier
- `ticket_id` (INT, NOT NULL) - Ticket reference
- `action` (VARCHAR(50), NOT NULL) - Action type
- `performed_by` (INT, NOT NULL) - Performer reference
- `performed_by_name` (VARCHAR(100)) - Performer name
- `details` (JSON) - Action details
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- `fk_ticket_id` → tickets(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (id)
- INDEX idx_ticket_id (ticket_id)
- INDEX idx_tenant_id (tenant_id)
- INDEX idx_action (action)

**Modules Using This Table**:
- services/ticketActivityService.js - Activity logging
- routes/tickets.js - Activity tracking
- components/tickets/TicketDetailPage.js - Activity timeline

---

## System Tables

### system_settings
**Purpose**: Global system configuration (key-value store)

**Columns**:
- `key` (VARCHAR(100), PK) - Setting key
- `value` (TEXT) - Setting value
- `updated_at` (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP ON UPDATE) - Update timestamp

**Foreign Keys**:
- None

**Indexes**:
- PRIMARY KEY (key)

**Modules Using This Table**:
- routes/settings.js - Settings management
- services/systemSettingsService.js - Settings service
- services/aiAgentAllocationService.js - AI allocation settings

---

### product_spoc_mapping
**Purpose**: Product SPOC (Single Point of Contact) mapping

**Columns**:
- `spoc_user_id` (INT, NOT NULL) - SPOC user reference
- `product_id` (INT, NOT NULL) - Product reference
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Foreign Keys**:
- `fk_spoc_user_id` → users(id) ON DELETE CASCADE
- `fk_product_id` → products(id) ON DELETE CASCADE

**Indexes**:
- PRIMARY KEY (spoc_user_id, product_id)

**Modules Using This Table**:
- routes/productSpoc.js - Product SPOC management
- routes/tenantSpoc.js - Tenant SPOC management

---

## Database Views

### current_assignments
**Purpose**: View of currently active ticket assignments

**Columns**:
- assignment_id, ticket_id, agent_id, agent_name, agent_email, agent_role
- assigned_by, assigned_by_name, assigned_at, assignment_type
- priority_level, assignment_notes, is_primary, ticket_status
- issue_title, ticket_created

**Source Tables**: ticket_assignments, tickets, users (joined)

**Modules Using This View**:
- routes/management/assignments.js - Current assignment queries
- utils/ticketAssignment.js - Assignment logic

---

### assignment_history
**Purpose**: View of assignment history with duration

**Columns**:
- assignment_id, ticket_id, agent_id, agent_name
- assigned_by, assigned_by_name, assigned_at, unassigned_at
- status, assignment_type, assignment_notes, duration_minutes
- issue_title, ticket_status

**Source Tables**: ticket_assignments, tickets, users (joined)

**Modules Using This View**:
- routes/management/assignments.js - Assignment history queries

---

### agent_workload
**Purpose**: View of agent workload metrics

**Columns**:
- agent_id, agent_name, agent_email, agent_role
- total_active_assignments, primary_assignments
- urgent_tickets, high_priority_tickets
- avg_workload_score, oldest_assignment, newest_assignment

**Source Tables**: users, ticket_assignments, tickets (joined)

**Modules Using This View**:
- routes/agents.js - Workload queries
- utils/ticketAssignment.js - Load balancing

---

## Database Access Layer

### Connection Pool
- **File**: `backend/database.js`
- **Library**: mysql2/promise
- **Configuration**: 10 connection limit, keep-alive enabled
- **Timezone**: UTC enforced at session level
- **Performance Instrumentation**: Optional PERF_LOG for slow query tracking

### Query Execution
- **Method**: Direct SQL via `pool.execute()` and `pool.query()`
- **Pattern**: Parameterized queries to prevent SQL injection
- **Transaction Support**: Connection-level transactions with rollback
- **Error Handling**: Try-catch with connection release

### Migration System
- **Location**: `backend/migrations/`
- **Format**: JavaScript files with SQL execution
- **Key Migrations**:
  - add-multitenancy.js - Multi-tenant support
  - department_setup.js - Department hierarchy
  - add-ticket-messages.js - Unified messaging
  - add-faqs-table.js - FAQ system
  - add-manager-override.js - Manager permissions

### Schema Management
- **Initialization**: `initializeDatabase()` in database.js
- **Evolution**: ALTER TABLE statements with error handling for existing columns
- **Backward Compatibility**: Conditional column addition with try-catch
- **Foreign Key Management**: Deferred FK creation after table dependencies

---

## Summary

**Total Tables**: 28 core tables + 3 views

**Table Categories**:
- Core: tickets, users, agents, tenants (4)
- Assignment: ticket_assignments, ticket_allocations (2)
- SLA: products, modules, sla_configurations, sla_timers, escalations (5)
- Communication: ticket_messages, chat_sessions, chat_participants (3)
- Email: incoming_emails, mail_review_queue (2)
- Knowledge: faqs, ticket_resolution_details (2)
- Support: support_calls (1)
- Notification: app_notifications (1)
- Performance: performance_ratings, ticket_activity (2)
- System: system_settings, product_spoc_mapping, departments, manager_department_permissions, agent_skills, agent_sessions (6)

**Key Relationships**:
- tickets → users (customer, assigner)
- tickets → agents (assigned_to)
- tickets → products (product_id)
- tickets → departments (department_id)
- users → departments (primary_department_id)
- agents → departments (primary_department_id)
- ticket_messages → tickets
- sla_timers → tickets, sla_configurations
- escalations → tickets, sla_timers
- ticket_assignments → tickets, users
- All tables → tenants (multi-tenancy)

**Database Access Pattern**:
- No ORM - direct SQL queries
- Connection pooling via mysql2
- Parameterized queries for security
- Transaction support for complex operations
- Performance instrumentation available
- Migration-based schema evolution
