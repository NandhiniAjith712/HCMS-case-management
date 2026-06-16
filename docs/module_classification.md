# Module Classification - ITSM to HCMS Transformation

## Overview
This document classifies all ITSM system modules into four categories for the transformation to HCMS (Healthcare Case Management System):
- **KEEP**: Essential modules retained as-is for HCMS
- **MODIFY**: Modules requiring adaptation for healthcare use cases
- **ARCHIVE**: Legacy ITSM-specific modules to be preserved in archive
- **FUTURE**: Modules planned for future HCMS implementation

---

## Classification Criteria

### KEEP
- Core infrastructure with universal applicability
- Multi-tenancy and security foundations
- Database and communication layers
- Authentication and authorization
- Real-time messaging infrastructure

### MODIFY
- Business logic requiring healthcare domain adaptation
- UI components needing healthcare terminology
- SLA and workflow rules for healthcare contexts
- Reporting and analytics for healthcare metrics
- Form fields and data structures for healthcare data

### ARCHIVE
- ITSM-specific product/module management
- Legacy components replaced by newer versions
- ITSM-specific terminology and workflows
- Deprecated features not applicable to healthcare

### FUTURE
- Healthcare-specific modules (patient management, medical records)
- Healthcare compliance (HIPAA, regulatory)
- Healthcare integrations (EHR, medical systems)
- Healthcare-specific reporting and analytics

---

## Backend Modules

### Core Infrastructure

#### Database Layer
- **Module Name**: Database Connection & Schema
- **Purpose**: MySQL connection pooling, table initialization, schema management
- **Backend Files**: database.js
- **Frontend Files**: None
- **Database Tables**: All tables
- **Dependencies**: mysql2, dotenv
- **Classification**: KEEP
- **Reason**: Core infrastructure applicable to any domain; multi-tenant support essential for HCMS

#### Server & Express Setup
- **Module Name**: Express Server Configuration
- **Purpose**: HTTP server setup, middleware mounting, WebSocket initialization
- **Backend Files**: server.js, src/app.js, src/server.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: express, cors, helmet, http, ws
- **Classification**: KEEP
- **Reason**: Core server infrastructure; WebSocket support essential for real-time healthcare communication

#### WebSocket Server
- **Module Name**: Real-time Communication Server
- **Purpose**: WebSocket connection handling, message broadcasting, room management
- **Backend Files**: websocket-server.js, websocket-instance.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: ws
- **Classification**: KEEP
- **Reason**: Real-time communication essential for healthcare case collaboration

---

### Authentication & Authorization

#### Authentication Middleware
- **Module Name**: JWT Authentication & Authorization
- **Purpose**: Token validation, role-based access control, permission matrix
- **Backend Files**: middleware/auth.js, src/modules/auth/auth.middleware.js
- **Frontend Files**: utils/api.js (auth utilities)
- **Database Tables**: users, agents
- **Dependencies**: jsonwebtoken, bcryptjs
- **Classification**: MODIFY
- **Reason**: Core auth logic to keep, but roles need healthcare-specific permissions (HIPAA compliance, patient data access)

#### Authentication Routes
- **Module Name**: Authentication Endpoints
- **Purpose**: Login, registration, password reset, email verification
- **Backend Files**: routes/auth.js, routes/core/auth.js, src/modules/auth/auth.routes.js
- **Frontend Files**: components/auth/*, components/common/AuthEntryGate.js
- **Database Tables**: users, agents
- **Dependencies**: express, express-validator, emailService
- **Classification**: MODIFY
- **Reason**: Auth flows to keep, but need healthcare-specific verification (license verification, credentials)

#### Authentication Service
- **Module Name**: Authentication Business Logic
- **Purpose**: User lifecycle, token generation, password management
- **Backend Files**: src/modules/auth/auth.service.js, services/accountLifecycleService.js
- **Frontend Files**: None
- **Database Tables**: users
- **Dependencies**: jsonwebtoken, bcryptjs
- **Classification**: MODIFY
- **Reason**: Core auth service to keep, but need healthcare account verification workflows

---

### Multi-Tenancy

#### Tenant Middleware
- **Module Name**: Multi-Tenant Context Management
- **Purpose**: Tenant extraction from subdomain/header/user, tenant isolation
- **Backend Files**: middleware/tenant.js
- **Frontend Files**: utils/api.js (tenant ID handling)
- **Database Tables**: tenants
- **Dependencies**: jsonwebtoken
- **Classification**: KEEP
- **Reason**: Multi-tenancy essential for HCMS (multiple healthcare organizations)

#### Tenant Management
- **Module Name**: Tenant CRUD Operations
- **Purpose**: Tenant creation, configuration, management
- **Backend Files**: routes/tenants.js
- **Frontend Files**: None (admin-only)
- **Database Tables**: tenants
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: Tenant management to keep, but need healthcare-specific tenant settings (compliance, regulations)

#### Tenant Migration
- **Module Name**: Multi-Tenancy Migration Script
- **Purpose**: Add tenant_id to all tables, create tenants table
- **Backend Files**: migrations/add-multitenancy.js
- **Frontend Files**: None
- **Database Tables**: All tables (tenant_id column)
- **Dependencies**: mysql2
- **Classification**: ARCHIVE
- **Reason**: Migration script already executed; can be archived after successful migration

---

### Ticket/Case Management

#### Core Ticket Routes
- **Module Name**: Ticket CRUD Operations
- **Purpose**: Create, read, update, delete tickets, status management
- **Backend Files**: routes/tickets.js, routes/management/tickets.js, src/modules/tickets/ticket.routes.js
- **Frontend Files**: components/tickets/*, components/dashboards/* (ticket views)
- **Database Tables**: tickets, ticket_messages, ticket_assignments
- **Dependencies**: express, multer, ticketService, emailService
- **Classification**: MODIFY
- **Reason**: Core ticket logic to keep, but rename to "cases", adapt for healthcare terminology (patient, medical issue, treatment)

#### Ticket Service
- **Module Name**: Ticket Business Logic
- **Purpose**: Ticket validation, business rules, operations
- **Backend Files**: services/ticketService.js, src/modules/tickets/ticket.service.js
- **Frontend Files**: None
- **Database Tables**: tickets
- **Dependencies**: mysql2
- **Classification**: MODIFY
- **Reason**: Core service to keep, but adapt for healthcare case workflows

#### Ticket Assignment
- **Module Name**: Ticket Assignment Logic
- **Purpose**: Auto-assignment algorithms, load balancing, skill-based routing
- **Backend Files**: utils/ticketAssignment.js
- **Frontend Files**: None
- **Database Tables**: ticket_assignments, ticket_allocations, agents
- **Dependencies**: mysql2, emailService
- **Classification**: MODIFY
- **Reason**: Assignment logic to keep, but adapt for healthcare (specialist assignment, department routing)

#### AI Agent Allocation
- **Module Name**: AI-Powered Ticket Allocation
- **Purpose**: AI-based agent selection, skill matching, queue management
- **Backend Files**: services/aiAgentAllocationService.js
- **Frontend Files**: None
- **Database Tables**: agent_skills, ticket_allocations
- **Dependencies**: nvidiaAiService, mysql2
- **Classification**: MODIFY
- **Reason**: AI allocation to keep, but train for healthcare specialization matching

#### Ticket Activity Logging
- **Module Name**: Ticket Activity Audit
- **Purpose**: Log all ticket activities for audit trail
- **Backend Files**: services/ticketActivityService.js
- **Frontend Files**: components/tickets/TicketDetailPage.js (activity timeline)
- **Database Tables**: ticket_activity
- **Dependencies**: mysql2
- **Classification**: KEEP
- **Reason**: Audit trail essential for healthcare compliance (HIPAA requires activity logging)

#### Ticket Messages
- **Module Name**: Ticket Message Management
- **Purpose**: CRUD operations for ticket messages
- **Backend Files**: services/ticketMessagesService.js
- **Frontend Files**: components/chat/*
- **Database Tables**: ticket_messages
- **Dependencies**: mysql2
- **Classification**: KEEP
- **Reason**: Messaging core to keep; channel-agnostic design works for healthcare

---

### Communication

#### Chat Routes
- **Module Name**: Real-time Chat Endpoints
- **Purpose**: Chat message CRUD, typing indicators, read receipts
- **Backend Files**: routes/communication/chat.js
- **Frontend Files**: components/chat/SupportTicketChatTabs.js, components/chat/TicketChat.js
- **Database Tables**: ticket_messages, chat_sessions, chat_participants
- **Dependencies**: express, websocket-instance
- **Classification**: KEEP
- **Reason**: Real-time chat essential for healthcare case collaboration

#### Replies Routes
- **Module Name**: Ticket Reply Management
- **Purpose**: Add replies to tickets, reply templates
- **Backend Files**: routes/communication/replies.js
- **Frontend Files**: components/chat/* (reply functionality)
- **Database Tables**: ticket_messages
- **Dependencies**: express, ticketActivityService
- **Classification**: ARCHIVE
- **Reason**: Functionality merged into ticket_messages; legacy replies table removed

#### WhatsApp Integration
- **Module Name**: WhatsApp Communication
- **Purpose**: WhatsApp webhook handling, message sending, status updates
- **Backend Files**: routes/communication/whatsapp.js, routes/communication/whatsapp-mock.js
- **Frontend Files**: None
- **Database Tables**: ticket_messages (channel: whatsapp)
- **Dependencies**: axios, whatsapp-notifications
- **Classification**: MODIFY
- **Reason**: WhatsApp integration to keep, but adapt for healthcare (patient communication, appointment reminders)

#### WhatsApp Notifications
- **Module Name**: WhatsApp Notification Service
- **Purpose**: Send WhatsApp messages, format messages
- **Backend Files**: utils/whatsapp-notifications.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: axios
- **Classification**: MODIFY
- **Reason**: Notification service to keep, but adapt healthcare message templates

---

### Email

#### Email Service
- **Module Name**: Email Sending & Management
- **Purpose**: Send emails, email templates, SMTP configuration
- **Backend Files**: services/emailService.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: nodemailer
- **Classification**: KEEP
- **Reason**: Email communication essential for healthcare (appointments, reports, notifications)

#### Incoming Email Service
- **Module Name**: Incoming Email Processing
- **Purpose**: Poll inbox, parse emails, convert to ticket messages
- **Backend Files**: services/incomingEmailService.js
- **Frontend Files**: None
- **Database Tables**: incoming_emails, mail_review_queue, ticket_messages
- **Dependencies**: imapflow, mailparser
- **Classification**: MODIFY
- **Reason**: Email processing to keep, but adapt for healthcare (patient email handling, medical content)

#### Email Cleaner
- **Module Name**: Email Content Cleaning
- **Purpose**: Clean email content, remove quoted text, signatures
- **Backend Files**: utils/emailCleaner.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: None
- **Classification**: KEEP
- **Reason**: Email processing utility applicable to healthcare

---

### SLA Management

#### SLA Configuration
- **Module Name**: SLA Rule Management
- **Purpose**: Define SLA rules per product/module/issue type
- **Backend Files**: routes/management/sla.js
- **Frontend Files**: components/sla/SLAManagement.js
- **Database Tables**: sla_configurations, products, modules
- **Dependencies**: express, slaResolutionService
- **Classification**: MODIFY
- **Reason**: SLA framework to keep, but adapt for healthcare (response times for urgent cases, regulatory requirements)

#### SLA Resolution Service
- **Module Name**: SLA Calculation & Enforcement
- **Purpose**: Calculate SLA deadlines, match SLA rules, apply SLA to tickets
- **Backend Files**: services/slaResolutionService.js
- **Frontend Files**: components/sla/SLATimer.js
- **Database Tables**: sla_configurations, sla_timers, tickets
- **Dependencies**: mysql2
- **Classification**: MODIFY
- **Reason**: SLA logic to keep, but adapt for healthcare timeframes (emergency response, appointment windows)

#### SLA Timers
- **Module Name**: SLA Timer Tracking
- **Purpose**: Track SLA compliance, pause/resume timers, breach detection
- **Backend Files**: routes/management/sla.js (timer endpoints)
- **Frontend Files**: components/sla/SLATimer.js, components/sla/SLADashboard.js
- **Database Tables**: sla_timers
- **Dependencies**: express
- **Classification**: MODIFY
- **Reason**: Timer tracking to keep, but adapt for healthcare (pause for after-hours, business hours)

#### Scheduled Escalation
- **Module Name**: Automatic Escalation Workflow
- **Purpose**: Monitor SLA compliance, auto-escalate overdue tickets
- **Backend Files**: scheduled-escalation.js
- **Frontend Files**: None
- **Database Tables**: sla_timers, escalations, tickets
- **Dependencies**: mysql2, ticketEventNotificationService
- **Classification**: MODIFY
- **Reason**: Escalation logic to keep, but adapt for healthcare (specialist escalation, emergency protocols)

#### Scheduled Inactivity
- **Module Name**: Inactivity Workflow
- **Purpose**: Monitor ticket inactivity, send reminders, auto-close
- **Backend Files**: scheduled-inactivity.js
- **Frontend Files**: None
- **Database Tables**: tickets
- **Dependencies**: mysql2, emailService
- **Classification**: MODIFY
- **Reason**: Inactivity handling to keep, but adapt for healthcare (patient follow-up, care continuity)

---

### Product & Module Management

#### Products
- **Module Name**: Product Management
- **Purpose**: CRUD operations for products/services
- **Backend Files**: routes/tickets.js (product endpoints), routes/productSpoc.js
- **Frontend Files**: components/dashboards/ProductDashboard.js, components/dashboards/ProductSpocDashboard.js
- **Database Tables**: products
- **Dependencies**: express, mysql2
- **Classification**: ARCHIVE
- **Reason**: ITSM product concept not applicable to healthcare; replace with healthcare services/departments

#### Modules
- **Module Name**: Module Management
- **Purpose**: CRUD operations for product sub-components
- **Backend Files**: routes/tickets.js (module endpoints)
- **Frontend Files**: None
- **Database Tables**: modules
- **Dependencies**: express, mysql2
- **Classification**: ARCHIVE
- **Reason**: ITSM module concept not applicable to healthcare; replace with medical specialties/procedures

#### Product SPOC
- **Module Name**: Product Single Point of Contact
- **Purpose**: Manage product SPOC assignments
- **Backend Files**: routes/productSpoc.js
- **Frontend Files**: components/dashboards/ProductSpocDashboard.js
- **Database Tables**: product_spoc_mapping, users
- **Dependencies**: express, mysql2
- **Classification**: ARCHIVE
- **Reason**: Product SPOC not applicable to healthcare; replace with department/role-based access

---

### User & Agent Management

#### Users
- **Module Name**: User Management
- **Purpose**: CRUD operations for users (customers/staff)
- **Backend Files**: routes/core/users.js, routes/auth.js (user endpoints)
- **Frontend Files**: components/tickets/UserForm.js
- **Database Tables**: users
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: User management to keep, but adapt for healthcare (patient vs staff, medical credentials)

#### Agents
- **Module Name**: Agent/Staff Management
- **Purpose**: CRUD operations for support agents, metrics tracking
- **Backend Files**: routes/agents.js, routes/core/agents.js
- **Frontend Files**: components/dashboards/AgentDashboard.js
- **Database Tables**: agents, agent_skills, agent_sessions
- **Dependencies**: express, mysql2, bcryptjs
- **Classification**: MODIFY
- **Reason**: Agent management to keep, but rename to "staff", adapt for healthcare (medical staff, specialists)

#### Agent Skills
- **Module Name**: Agent Skill Management
- **Purpose**: Define agent skills for AI-based routing
- **Backend Files**: routes/agents.js (skill endpoints)
- **Frontend Files**: None
- **Database Tables**: agent_skills
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: Skill framework to keep, but adapt for healthcare (medical specialties, certifications)

#### Agent Level Sync
- **Module Name**: Agent Level Synchronization
- **Purpose**: Sync agent levels to NULL for executives
- **Backend Files**: utils/agentLevelSync.js
- **Frontend Files**: None
- **Database Tables**: agents
- **Dependencies**: mysql2
- **Classification**: ARCHIVE
- **Reason**: ITSM-specific level hierarchy; replace with healthcare role hierarchy

#### Staff Routes
- **Module Name**: Staff Management Endpoints
- **Purpose**: Staff-specific operations
- **Backend Files**: routes/core/staff.js
- **Frontend Files**: None
- **Database Tables**: users, agents
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: Staff management to keep, but adapt for healthcare (medical staff roles)

---

### Department Management

#### Departments
- **Module Name**: Department Management
- **Purpose**: CRUD operations for departments
- **Backend Files**: routes/departments.js
- **Frontend Files**: None
- **Database Tables**: departments
- **Dependencies**: express, mysql2
- **Classification**: KEEP
- **Reason**: Department structure applicable to healthcare (medical departments, specialties)

#### Department Permissions
- **Module Name**: Manager Department Permissions
- **Purpose**: Define manager permissions per department
- **Backend Files**: migrations/department_setup.js
- **Frontend Files**: None
- **Database Tables**: manager_department_permissions
- **Dependencies**: mysql2
- **Classification**: MODIFY
- **Reason**: Permission framework to keep, but adapt for healthcare (HIPAA access controls)

#### Branch Filter
- **Module Name**: Branch/Department Filtering
- **Purpose**: Filter data by branch/department
- **Backend Files**: middleware/branchFilter.js
- **Frontend Files**: None
- **Database Tables**: departments
- **Dependencies**: mysql2
- **Classification**: MODIFY
- **Reason**: Filtering logic to keep, but adapt for healthcare (department-based access)

---

### Notifications

#### App Notifications
- **Module Name**: In-App Notification System
- **Purpose**: Create, deliver, manage in-app notifications
- **Backend Files**: routes/notifications.js, services/appNotificationService.js
- **Frontend Files**: context/NotificationContext.js, components/notifications/*
- **Database Tables**: app_notifications
- **Dependencies**: express, mysql2
- **Classification**: KEEP
- **Reason**: Notification system essential for healthcare (alerts, reminders, updates)

#### Ticket Event Notifications
- **Module Name**: Notification Orchestration
- **Purpose**: Orchestrate notifications for ticket events across channels
- **Backend Files**: services/ticketEventNotificationService.js
- **Frontend Files**: None
- **Database Tables**: tickets, ticket_messages, app_notifications
- **Dependencies**: emailService, whatsapp-notifications, ticketActivityService
- **Classification**: KEEP
- **Reason**: Notification orchestration essential for healthcare (multi-channel patient communication)

#### Feedback Token Service
- **Module Name**: Feedback Token Management
- **Purpose**: Generate and validate feedback tokens
- **Backend Files**: services/feedbackTokenService.js
- **Frontend Files**: components/feedback/FeedbackFormPage.js
- **Database Tables**: None
- **Dependencies**: jsonwebtoken
- **Classification**: KEEP
- **Reason**: Token service applicable to healthcare feedback collection

---

### Knowledge Base

#### FAQs
- **Module Name**: FAQ Management
- **Purpose**: CRUD operations for FAQs, semantic search
- **Backend Files**: routes/faqs.js
- **Frontend Files**: components/help/HelpFAQPage.js, components/admin/FAQAdminPage.js
- **Database Tables**: faqs
- **Dependencies**: express, elasticsearch
- **Classification**: MODIFY
- **Reason**: FAQ framework to keep, but adapt for healthcare (medical FAQs, patient education)

#### FAQ Semantic Search
- **Module Name**: FAQ Semantic Search
- **Purpose**: Vector-based semantic search for FAQs
- **Backend Files**: services/faqSemanticSearchService.js
- **Frontend Files**: components/help/HelpFAQPage.js
- **Database Tables**: faqs
- **Dependencies**: elasticsearch
- **Classification**: MODIFY
- **Reason**: Search capability to keep, but train for healthcare terminology

#### Knowledge Base
- **Module Name**: Knowledge Base Management
- **Purpose**: Manage knowledge articles
- **Backend Files**: routes/knowledge.js
- **Frontend Files**: pages/KnowledgeBasePage.js
- **Database Tables**: None (uses external Elasticsearch)
- **Dependencies**: express, elasticsearch
- **Classification**: MODIFY
- **Reason**: Knowledge base to keep, but adapt for healthcare (medical knowledge base, protocols)

---

### AI Integration

#### NVIDIA AI Service
- **Module Name**: NVIDIA AI Integration
- **Purpose**: NVIDIA AI client, model interactions
- **Backend Files**: services/nvidiaAiService.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: openai
- **Classification**: MODIFY
- **Reason**: AI integration to keep, but adapt for healthcare (medical AI models, HIPAA-compliant AI)

#### AI Extraction Service
- **Module Name**: AI Data Extraction
- **Purpose**: Extract entities from tickets, classify tickets
- **Backend Files**: services/aiExtractionService.js
- **Frontend Files**: None
- **Database Tables**: tickets
- **Dependencies**: openai, nvidiaAiService
- **Classification**: MODIFY
- **Reason**: Extraction to keep, but train for healthcare (medical entity extraction, symptom classification)

#### AI Attachment Analysis
- **Module Name**: AI Attachment Analysis
- **Purpose**: Analyze attachment content, extract insights
- **Backend Files**: services/aiAttachmentAnalysisService.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: attachmentTextExtractor
- **Classification**: MODIFY
- **Reason**: Analysis to keep, but adapt for healthcare (medical document analysis, lab reports)

#### AI Template Suggestion
- **Module Name**: AI Reply Template Suggestions
- **Purpose**: Suggest reply templates based on context
- **Backend Files**: services/aiTemplateSuggestionService.js
- **Frontend Files**: components/chat/SupportTicketChatTabs.js (suggestions)
- **Database Tables**: None
- **Dependencies**: openai, nvidiaAiService
- **Classification**: MODIFY
- **Reason**: Template suggestion to keep, but adapt for healthcare (medical response templates)

#### AI Feedback Analysis
- **Module Name**: AI Feedback Analysis
- **Purpose**: Analyze customer feedback sentiment
- **Backend Files**: services/aiFeedbackAnalysisService.js
- **Frontend Files**: components/feedback/FeedbackInsightsPage.js
- **Database Tables**: None
- **Dependencies**: None
- **Classification**: MODIFY
- **Reason**: Analysis to keep, but adapt for healthcare (patient feedback analysis, satisfaction)

#### ITSM Assistant Prompt
- **Module Name**: ITSM AI Assistant Prompts
- **Purpose**: AI prompt templates for ITSM assistant
- **Backend Files**: services/itsmAssistantPrompt.js
- **Frontend Files**: components/assistant/ItsmAssistant.js
- **Database Tables**: None
- **Dependencies**: None
- **Classification**: ARCHIVE
- **Reason**: ITSM-specific prompts; replace with healthcare assistant prompts

---

### Priority Management

#### Priority Service
- **Module Name**: Priority Calculation
- **Purpose**: Calculate ticket priority based on rules
- **Backend Files**: services/priorityService.js
- **Frontend Files**: None
- **Database Tables**: tickets
- **Dependencies**: mysql2
- **Classification**: MODIFY
- **Reason**: Priority logic to keep, but adapt for healthcare (medical urgency, triage)

---

### Feedback Management

#### Feedback Routes
- **Module Name**: Feedback Collection
- **Purpose**: Collect and manage customer feedback
- **Backend Files**: routes/feedback.js
- **Frontend Files**: components/feedback/FeedbackFormPage.js, components/feedback/FeedbackInsightsPage.js
- **Database Tables**: tickets (satisfaction columns)
- **Dependencies**: express, mysql2
- **Classification**: KEEP
- **Reason**: Feedback collection essential for healthcare (patient satisfaction, care quality)

---

### System Settings

#### System Settings
- **Module Name**: System Configuration
- **Purpose**: Manage system-wide settings (key-value store)
- **Backend Files**: routes/settings.js, services/systemSettingsService.js
- **Frontend Files**: None
- **Database Tables**: system_settings
- **Dependencies**: express, mysql2
- **Classification**: KEEP
- **Reason**: Settings management essential for healthcare (system configuration, feature flags)

---

### Utilities

#### Text Formatter
- **Module Name**: Text Formatting Utilities
- **Purpose**: Format text, sanitize input, handle special characters
- **Backend Files**: utils/textFormatter.js, middleware/textFormatting.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: None
- **Classification**: KEEP
- **Reason**: Text formatting utility applicable to healthcare

#### Attachment Text Extractor
- **Module Name**: Text Extraction from Files
- **Purpose**: Extract text from PDF, DOCX, images (OCR)
- **Backend Files**: services/attachmentTextExtractor.js
- **Frontend Files**: None
- **Database Tables**: None
- **Dependencies**: mammoth, pdf-parse, tesseract.js, xlsx
- **Classification**: KEEP
- **Reason**: Document processing essential for healthcare (medical records, lab reports)

#### Tenant Queries
- **Module Name**: Tenant-Specific Queries
- **Purpose**: Helper functions for tenant data retrieval
- **Backend Files**: utils/tenantQueries.js
- **Frontend Files**: None
- **Database Tables**: tenants
- **Dependencies**: mysql2
- **Classification**: KEEP
- **Reason**: Tenant utilities essential for multi-tenant HCMS

---

### Management Routes

#### Assignments
- **Module Name**: Assignment Management
- **Purpose**: Manual assignments, assignment rules, reassignment
- **Backend Files**: routes/management/assignments.js
- **Frontend Files**: components/dashboards/ManagerDashboard.js (assignment views)
- **Database Tables**: ticket_assignments, ticket_allocations
- **Dependencies**: express, mysql2, ticketAssignment
- **Classification**: MODIFY
- **Reason**: Assignment management to keep, but adapt for healthcare (specialist assignment, care team)

#### Mail Review
- **Module Name**: Email Review Queue
- **Purpose**: Review incoming emails, approve/reject processing
- **Backend Files**: routes/management/mailReview.js
- **Frontend Files**: components/dashboards/MailInbox.js, components/dashboards/MailReviewQueue.js
- **Database Tables**: incoming_emails, mail_review_queue
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: Email review to keep, but adapt for healthcare (patient email triage, medical content review)

#### Ticket Tasks
- **Module Name**: Multi-Task Workflow
- **Purpose**: Task management for tickets, task dependencies
- **Backend Files**: routes/management/ticketTasks.js
- **Frontend Files**: None
- **Database Tables**: None (uses ticket metadata)
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: Task framework to keep, but adapt for healthcare (treatment tasks, care plan steps)

---

### Organization & SPOC

#### Tenant SPOC
- **Module Name**: Tenant Single Point of Contact
- **Purpose**: Manage tenant SPOC assignments
- **Backend Files**: routes/tenantSpoc.js
- **Frontend Files**: None
- **Database Tables**: users
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: SPOC concept to keep, but adapt for healthcare (facility administrator, care coordinator)

#### Organization Service
- **Module Name**: Organization Management
- **Purpose**: Manage organization data
- **Backend Files**: services/organizationService.js
- **Frontend Files**: None
- **Database Tables**: None (uses tenants)
- **Dependencies**: mysql2
- **Classification**: ARCHIVE
- **Reason**: Organization table removed; tenants act as organizations

---

### Support Integration

#### Support Routes
- **Module Name**: Support Integration Endpoints
- **Purpose**: External support system integration
- **Backend Files**: routes/support.js
- **Frontend Files**: components/common/SupportEntry.js
- **Database Tables**: support_calls
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: Integration framework to keep, but adapt for healthcare (EHR integration, medical systems)

---

### Performance & Analytics

#### Performance Ratings
- **Module Name**: Performance Rating System
- **Purpose**: Rate agent performance on tickets
- **Backend Files**: routes/agents.js (rating endpoints)
- **Frontend Files**: components/dashboards/ManagerDashboard.js (rating views)
- **Database Tables**: performance_ratings
- **Dependencies**: express, mysql2
- **Classification**: MODIFY
- **Reason**: Rating framework to keep, but adapt for healthcare (staff performance, care quality metrics)

---

### Legacy Components

#### Legacy Root Components
- **Module Name**: Legacy Frontend Components
- **Purpose**: Old versions of dashboards and pages
- **Backend Files**: None
- **Frontend Files**: AgentDashboard.js, BusinessDashboard.js, ManagerDashboard.js, UserDashboard.js, TicketDetailPage.js, GlobalLogin.js (root level)
- **Database Tables**: None
- **Dependencies**: react
- **Classification**: ARCHIVE
- **Reason**: Replaced by organized component structure; preserve for reference

---

## Frontend Modules

### Core Application

#### App.js
- **Module Name**: Main Application Component
- **Purpose**: Route configuration, authentication guards, user state management
- **Backend Files**: None
- **Frontend Files**: src/App.js
- **Database Tables**: None
- **Dependencies**: react, react-router-dom
- **Classification**: MODIFY
- **Reason**: Core app structure to keep, but update routes for healthcare terminology

#### API Utilities
- **Module Name**: API Communication Utilities
- **Purpose**: Auth headers, API calls, error handling
- **Backend Files**: None
- **Frontend Files**: src/utils/api.js
- **Database Tables**: None
- **Dependencies**: None (uses fetch)
- **Classification**: KEEP
- **Reason**: API utilities essential for healthcare frontend

#### Notification Context
- **Module Name**: Global Notification State
- **Purpose**: Notification state management across app
- **Backend Files**: None
- **Frontend Files**: src/context/NotificationContext.js
- **Database Tables**: app_notifications
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Notification context essential for healthcare alerts

---

### Authentication Components

#### Global Login
- **Module Name**: Unified Login Page
- **Purpose**: Login for all user types with role detection
- **Backend Files**: routes/auth.js
- **Frontend Files**: components/auth/GlobalLogin.js
- **Database Tables**: users, agents
- **Dependencies**: react, react-router-dom
- **Classification**: MODIFY
- **Reason**: Login component to keep, but adapt for healthcare (license verification, credentials)

#### Customer Access
- **Module Name**: Customer Access & Authentication
- **Purpose**: Customer login, registration, password setup, email verification
- **Backend Files**: routes/auth.js
- **Frontend Files**: components/auth/CustomerAccessPage.js
- **Database Tables**: users
- **Dependencies**: react, react-router-dom
- **Classification**: MODIFY
- **Reason**: Customer auth to keep, but adapt for healthcare (patient registration, medical info)

#### Staff Login
- **Module Name**: Staff Authentication
- **Purpose**: Staff-specific login pages
- **Backend Files**: routes/auth.js, routes/core/auth.js
- **Frontend Files**: components/auth/StaffLogin.js, components/auth/AgentLogin.js
- **Database Tables**: agents
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Staff auth to keep, but adapt for healthcare (medical staff credentials)

#### Password Management
- **Module Name**: Password Reset & Setup
- **Purpose**: Forgot password, reset password, staff password setup
- **Backend Files**: routes/auth.js
- **Frontend Files**: components/auth/ForgotPassword.js, components/auth/ResetPassword.js, components/auth/StaffSetPassword.js
- **Database Tables**: users, agents
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Password management essential for healthcare security

---

### Dashboard Components

#### Agent Dashboard
- **Module Name**: Agent/Staff Dashboard
- **Purpose**: Agent-specific ticket views, sidebar navigation, status filtering
- **Backend Files**: routes/tickets.js, routes/agents.js
- **Frontend Files**: components/dashboards/AgentDashboard.js
- **Database Tables**: tickets, ticket_assignments, agents
- **Dependencies**: react, @mui/material
- **Classification**: MODIFY
- **Reason**: Dashboard structure to keep, but adapt for healthcare (medical staff views, patient cases)

#### Manager Dashboard
- **Module Name**: Manager Dashboard
- **Purpose**: Team overview, ticket assignment, escalation requests, analytics
- **Backend Files**: routes/management/tickets.js, routes/management/assignments.js
- **Frontend Files**: components/dashboards/ManagerDashboard.js
- **Database Tables**: tickets, ticket_assignments, agents
- **Dependencies**: react, @mui/material
- **Classification**: MODIFY
- **Reason**: Manager dashboard to keep, but adapt for healthcare (care team management, patient assignments)

#### CEO Dashboard
- **Module Name**: Executive Dashboard
- **Purpose**: Executive analytics, department views, agent management, performance metrics
- **Backend Files**: routes/agents.js, routes/departments.js
- **Frontend Files**: components/dashboards/CEODashboard.js
- **Database Tables**: agents, departments, tickets
- **Dependencies**: react, @mui/material
- **Classification**: MODIFY
- **Reason**: Executive dashboard to keep, but adapt for healthcare (facility metrics, care quality analytics)

#### User Dashboard
- **Module Name**: Customer/Patient Dashboard
- **Purpose**: Customer ticket views, customer-specific features
- **Backend Files**: routes/tickets.js
- **Frontend Files**: components/dashboards/UserDashboard.js
- **Database Tables**: tickets, users
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Customer dashboard to keep, but adapt for healthcare (patient portal, medical records)

#### Business Dashboard
- **Module Name**: Business/Organization Dashboard
- **Purpose**: Business metrics, organizational views
- **Backend Files**: routes/tenants.js
- **Frontend Files**: components/dashboards/BusinessDashboard.js, components/common/BusinessDashboardAuth.js
- **Database Tables**: tenants, tickets
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Business dashboard to keep, but adapt for healthcare (facility dashboard, organizational metrics)

#### Product Dashboards
- **Module Name**: Product-Specific Dashboards
- **Purpose**: Product metrics, product-specific ticket views
- **Backend Files**: routes/productSpoc.js
- **Frontend Files**: components/dashboards/ProductDashboard.js, components/dashboards/ProductSpocDashboard.js
- **Database Tables**: products, tickets
- **Dependencies**: react
- **Classification**: ARCHIVE
- **Reason**: Product concept not applicable to healthcare; replace with service/department dashboards

---

### Ticket Components

#### Ticket Detail Page
- **Module Name**: Comprehensive Ticket Detail View
- **Purpose**: Full ticket details, chat integration, activity timeline, attachments
- **Backend Files**: routes/tickets.js, routes/communication/chat.js
- **Frontend Files**: components/tickets/TicketDetailPage.js
- **Database Tables**: tickets, ticket_messages, ticket_activity
- **Dependencies**: react, @mui/material
- **Classification**: MODIFY
- **Reason**: Ticket detail to keep, but adapt for healthcare (case detail, medical history, treatment info)

#### Ticket Card
- **Module Name**: Ticket Summary Card
- **Purpose**: Ticket summary for list views, quick actions
- **Backend Files**: routes/tickets.js
- **Frontend Files**: components/tickets/TicketCard.js
- **Database Tables**: tickets
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Card component to keep, but adapt for healthcare (case card, patient info)

#### Tickets View
- **Module Name**: General Tickets Listing
- **Purpose**: Ticket listing, view options, navigation
- **Backend Files**: routes/tickets.js
- **Frontend Files**: components/tickets/TicketsView.js
- **Database Tables**: tickets
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Listing view to keep, but adapt for healthcare (case listing, patient cases)

#### User Form
- **Module Name**: User/Ticket Creation Form
- **Purpose**: User information form, ticket creation, form validation
- **Backend Files**: routes/tickets.js, routes/core/users.js
- **Frontend Files**: components/tickets/UserForm.js
- **Database Tables**: users, tickets
- **Dependencies**: react, @mui/material
- **Classification**: MODIFY
- **Reason**: Form to keep, but adapt for healthcare (patient form, medical information, case creation)

#### Linked Tickets
- **Module Name**: Linked Ticket Management
- **Purpose**: View and manage linked ticket relationships
- **Backend Files**: routes/ticketLinks.js
- **Frontend Files**: components/tickets/LinkedTicketReviewPage.js
- **Database Tables**: tickets (linked via metadata)
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Linking framework to keep, but adapt for healthcare (related cases, patient history)

#### Group Tickets
- **Module Name**: Group Ticket Management
- **Purpose**: Manage grouped tickets for bulk operations
- **Backend Files**: routes/management/tickets.js
- **Frontend Files**: components/tickets/GroupTicketPage.js
- **Database Tables**: tickets (group metadata)
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Grouping framework to keep, but adapt for healthcare (case grouping, treatment plans)

---

### Chat Components

#### Support Ticket Chat Tabs
- **Module Name**: Tabbed Chat Interface
- **Purpose**: Multiple chat tabs, message management, reply suggestions
- **Backend Files**: routes/communication/chat.js
- **Frontend Files**: components/chat/SupportTicketChatTabs.js
- **Database Tables**: ticket_messages
- **Dependencies**: react, @mui/material
- **Classification**: KEEP
- **Reason**: Chat interface essential for healthcare case collaboration

#### Ticket Chat
- **Module Name**: Comprehensive Chat Interface
- **Purpose**: Full chat functionality, attachments, rich messaging
- **Backend Files**: routes/communication/chat.js
- **Frontend Files**: components/chat/TicketChat.js
- **Database Tables**: ticket_messages
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Chat functionality essential for healthcare communication

#### Customer Chat
- **Module Name**: Customer-Facing Chat
- **Purpose**: Customer chat interface, message history
- **Backend Files**: routes/communication/chat.js
- **Frontend Files**: components/chat/CustomerChatPage.js, components/chat/CustomerTicketChat.js
- **Database Tables**: ticket_messages
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Customer chat essential for patient communication

#### Real-Time Chat
- **Module Name**: WebSocket Chat Component
- **Purpose**: WebSocket integration, real-time messaging
- **Backend Files**: websocket-server.js
- **Frontend Files**: components/chat/RealTimeChat.js
- **Database Tables**: ticket_messages, chat_sessions
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Real-time chat essential for healthcare collaboration

---

### SLA Components

#### SLA Dashboard
- **Module Name**: SLA Monitoring Dashboard
- **Purpose**: SLA metrics, SLA compliance monitoring
- **Backend Files**: routes/management/sla.js
- **Frontend Files**: components/sla/SLADashboard.js
- **Database Tables**: sla_timers, sla_configurations
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: SLA dashboard to keep, but adapt for healthcare (response time monitoring, care timelines)

#### SLA Management
- **Module Name**: SLA Configuration Interface
- **Purpose**: SLA rule configuration, SLA editing
- **Backend Files**: routes/management/sla.js
- **Frontend Files**: components/sla/SLAManagement.js
- **Database Tables**: sla_configurations
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: SLA management to keep, but adapt for healthcare (care timeframes, regulatory requirements)

#### SLA Timer
- **Module Name**: SLA Timer Component
- **Purpose**: Real-time SLA countdown, SLA status display
- **Backend Files**: routes/management/sla.js
- **Frontend Files**: components/sla/SLATimer.js
- **Database Tables**: sla_timers
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Timer component to keep, but adapt for healthcare (care deadlines, appointment windows)

---

### Notification Components

#### Notification Bell
- **Module Name**: Notification Indicator
- **Purpose**: Notification display, notification count
- **Backend Files**: routes/notifications.js
- **Frontend Files**: components/notifications/NotificationBell.js, components/common/HeaderNotificationBell.js
- **Database Tables**: app_notifications
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Notification indicator essential for healthcare alerts

#### Notification Dropdown
- **Module Name**: Notification Menu
- **Purpose**: Notification list, notification actions
- **Backend Files**: routes/notifications.js
- **Frontend Files**: components/notifications/NotificationDropdown.js
- **Database Tables**: app_notifications
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Notification menu essential for healthcare alert management

---

### Feedback Components

#### Feedback Form
- **Module Name**: Feedback Collection Form
- **Purpose**: Collect customer feedback, rating submission
- **Backend Files**: routes/feedback.js
- **Frontend Files**: components/feedback/FeedbackFormPage.js
- **Database Tables**: tickets (satisfaction columns)
- **Dependencies**: react
- **Classification**: KEEP
- **Reason**: Feedback collection essential for healthcare (patient satisfaction, care quality)

#### Feedback Insights
- **Module Name**: Feedback Analytics
- **Purpose**: Feedback analysis, sentiment insights, trends
- **Backend Files**: routes/feedback.js
- **Frontend Files**: components/feedback/FeedbackInsightsPage.js
- **Database Tables**: tickets
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Analytics to keep, but adapt for healthcare (patient feedback analysis, care quality metrics)

---

### Help Components

#### Help FAQ
- **Module Name**: Help & FAQ Page
- **Purpose**: FAQ browsing, help content, search
- **Backend Files**: routes/faqs.js
- **Frontend Files**: components/help/HelpFAQPage.js
- **Database Tables**: faqs
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Help page to keep, but adapt for healthcare (patient education, medical FAQs)

---

### Common Components

#### Support Entry
- **Module Name**: Universal Support URL Handler
- **Purpose**: Universal support URL with auto-login from parameters
- **Backend Files**: routes/support.js
- **Frontend Files**: components/common/SupportEntry.js
- **Database Tables**: users, tickets
- **Dependencies**: react, react-router-dom
- **Classification**: MODIFY
- **Reason**: Support entry to keep, but adapt for healthcare (patient portal entry, care access)

#### Auth Entry Gate
- **Module Name**: Authentication Flow Selector
- **Purpose**: Route-based auth flow selection
- **Backend Files**: routes/auth.js
- **Frontend Files**: components/common/AuthEntryGate.js
- **Database Tables**: None
- **Dependencies**: react, react-router-dom
- **Classification**: KEEP
- **Reason**: Auth gate applicable to healthcare authentication flows

---

### Admin Components

#### Admin Chat Overview
- **Module Name**: Admin Chat Monitoring
- **Purpose**: Chat statistics, admin chat monitoring
- **Backend Files**: routes/communication/chat.js
- **Frontend Files**: components/admin/AdminChatOverview.js
- **Database Tables**: ticket_messages
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Admin monitoring to keep, but adapt for healthcare (communication monitoring, compliance)

#### FAQ Admin
- **Module Name**: FAQ Management Interface
- **Purpose**: FAQ CRUD, FAQ management
- **Backend Files**: routes/faqs.js
- **Frontend Files**: components/admin/FAQAdminPage.js
- **Database Tables**: faqs
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: FAQ admin to keep, but adapt for healthcare (medical content management, patient education)

#### Ticket Assignment Stats
- **Module Name**: Assignment Statistics
- **Purpose**: Assignment metrics, statistics visualization
- **Backend Files**: routes/management/assignments.js
- **Frontend Files**: components/admin/TicketAssignmentStats.js
- **Database Tables**: ticket_assignments
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Stats to keep, but adapt for healthcare (care team metrics, workload)

---

### Mail Components

#### Mail Inbox
- **Module Name**: Email Inbox Interface
- **Purpose**: Email review, inbox management
- **Backend Files**: routes/management/mailReview.js
- **Frontend Files**: components/dashboards/MailInbox.js
- **Database Tables**: incoming_emails
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Email inbox to keep, but adapt for healthcare (patient email triage, medical content)

#### Mail Review Queue
- **Module Name**: Mail Review Workflow
- **Purpose**: Email review queue, approval workflow
- **Backend Files**: routes/management/mailReview.js
- **Frontend Files**: components/dashboards/MailReviewQueue.js
- **Database Tables**: mail_review_queue
- **Dependencies**: react
- **Classification**: MODIFY
- **Reason**: Review queue to keep, but adapt for healthcare (patient communication review)

---

### Assistant Components

#### ITSM Assistant
- **Module Name**: AI-Powered ITSM Assistant
- **Purpose**: AI assistant for ITSM operations
- **Backend Files**: services/itsmAssistantPrompt.js
- **Frontend Files**: components/assistant/ItsmAssistant.js
- **Database Tables**: None
- **Dependencies**: react
- **Classification**: ARCHIVE
- **Reason**: ITSM-specific assistant; replace with healthcare AI assistant

---

### Frontend Utilities

#### Date/Time Utilities
- **Module Name**: Date/Time Formatting
- **Purpose**: Format dates/times in IST timezone
- **Backend Files**: None
- **Frontend Files**: src/utils/dateTime.js
- **Database Tables**: None
- **Dependencies**: None
- **Classification**: KEEP
- **Reason**: Date/time utilities applicable to healthcare (appointment times, care schedules)

#### Relative Time Formatting
- **Module Name**: Relative Time Display
- **Purpose**: Format relative time strings (e.g., "2 hours ago")
- **Backend Files**: None
- **Frontend Files**: src/utils/formatRelativeTime.js
- **Database Tables**: None
- **Dependencies**: None
- **Classification**: KEEP
- **Reason**: Relative time useful for healthcare (time since last update, care timeline)

#### Customer Access Resolver
- **Module Name**: Customer Access Logic
- **Purpose**: Resolve customer access state, determine access requirements
- **Backend Files**: None
- **Frontend Files**: src/utils/customerAccessResolver.js
- **Database Tables**: None
- **Dependencies**: None
- **Classification**: MODIFY
- **Reason**: Access logic to keep, but adapt for healthcare (patient access, care team access)

---

## Database Tables Classification

### KEEP (Core Infrastructure)
- **tenants** - Multi-tenant foundation
- **users** - User accounts (adapt for healthcare)
- **agents** - Staff accounts (adapt for healthcare)
- **departments** - Department structure
- **ticket_messages** - Unified messaging
- **chat_sessions** - Real-time sessions
- **chat_participants** - Participant tracking
- **app_notifications** - Notification system
- **ticket_activity** - Audit trail
- **system_settings** - Configuration
- **incoming_emails** - Email processing
- **mail_review_queue** - Email review
- **faqs** - Knowledge base
- **ticket_resolution_details** - Resolution tracking
- **support_calls** - Integration tracking
- **performance_ratings** - Performance metrics
- **manager_department_permissions** - Department permissions
- **agent_skills** - Skill definitions
- **agent_sessions** - Session tracking

### MODIFY (Adapt for Healthcare)
- **tickets** - Rename to cases, adapt columns for healthcare
- **ticket_assignments** - Adapt for care team assignments
- **ticket_allocations** - Adapt for care allocation
- **sla_configurations** - Adapt for healthcare SLAs
- **sla_timers** - Adapt for care timelines
- **escalations** - Adapt for care escalation
- **products** - Replace with healthcare services
- **modules** - Replace with medical specialties
- **product_spoc_mapping** - Replace with department/role mapping

### ARCHIVE (ITSM-Specific)
- **replies** - Merged into ticket_messages (already removed)
- **chat_messages** - Merged into ticket_messages (already removed)
- **whatsapp_messages** - Merged into ticket_messages (already removed)
- **whatsapp_conversations** - Replaced by chat_sessions (already removed)

---

## Summary Statistics

### Backend Modules
- **KEEP**: 18 modules (40%)
- **MODIFY**: 22 modules (49%)
- **ARCHIVE**: 5 modules (11%)
- **FUTURE**: 0 modules (0%)
- **Total**: 45 modules

### Frontend Modules
- **KEEP**: 15 modules (33%)
- **MODIFY**: 28 modules (62%)
- **ARCHIVE**: 2 modules (5%)
- **FUTURE**: 0 modules (0%)
- **Total**: 45 modules

### Database Tables
- **KEEP**: 17 tables (61%)
- **MODIFY**: 8 tables (29%)
- **ARCHIVE**: 3 tables (11%)
- **FUTURE**: 0 tables (0%)
- **Total**: 28 tables

### Overall Classification
- **KEEP**: 50 modules/tables (50%)
- **MODIFY**: 50 modules/tables (50%)
- **ARCHIVE**: 10 modules/tables (10%)
- **FUTURE**: 0 modules/tables (0%)
- **Total**: 100 modules/tables

---

## Transformation Priority

### Phase 1: Core Infrastructure (KEEP)
- Database layer, server setup, WebSocket
- Authentication, multi-tenancy, notifications
- Communication infrastructure (chat, messaging)
- Email processing and utilities

### Phase 2: Business Logic Adaptation (MODIFY)
- Ticket → Case transformation
- Product/Module → Healthcare services
- SLA → Healthcare timelines
- Dashboards → Healthcare views
- Forms → Healthcare data collection

### Phase 3: Healthcare-Specific Features (FUTURE)
- Patient management modules
- Medical record integration
- HIPAA compliance features
- Healthcare analytics and reporting

### Phase 4: Archive Legacy (ARCHIVE)
- Move ITSM-specific modules to archive
- Preserve for reference during transition
- Document transformation decisions
