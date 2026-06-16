# Dependency Map - ITSM System

## Overview
This document maps dependencies across the ITSM system architecture, identifying:
- Route → Controller/Service dependencies
- Service → Database dependencies
- Frontend → API dependencies
- Shared components and utilities
- Safely archivable modules

**Note**: The backend uses a traditional route-handler pattern without explicit controllers. Routes directly call services and execute database queries.

---

## Architecture Pattern

### Backend Architecture
```
Routes (HTTP Endpoints)
    ↓
Services (Business Logic)
    ↓
Database (Direct SQL via mysql2)
```

### Frontend Architecture
```
Pages/Components
    ↓
utils/api.js (API Client)
    ↓
Backend Routes
```

---

## Backend Route Dependencies

### Core Routes

#### routes/auth.js
**Purpose**: Authentication endpoints
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole, generateToken, hashPassword, comparePassword)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- services/emailService.js (email sending)
- services/accountLifecycleService.js (account lifecycle)
- database.js (pool)

**Service Calls**:
- emailService.sendEmail()
- emailService.sendVerificationEmail()
- accountLifecycleService.issueVerificationToken()
- accountLifecycleService.verifyAccount()

**Database Tables**:
- users
- agents

---

#### routes/agents.js
**Purpose**: Agent management endpoints
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- services/emailService.js (email sending)
- utils/agentLevelSync.js (level synchronization)
- database.js (pool)

**Service Calls**:
- emailService.sendEmail()
- emailService.sendPasswordSetupEmail()
- agentLevelSync.syncExecutiveAgentLevelsToNull()

**Database Tables**:
- agents
- agent_skills
- users

---

#### routes/tickets.js
**Purpose**: Core ticket management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- middleware/upload.js (upload, ticketAttachmentsUpload, handleUploadError)
- services/emailService.js (email sending)
- services/ticketActivityService.js (activity logging)
- services/ticketEventNotificationService.js (notification orchestration)
- services/slaResolutionService.js (SLA management)
- services/aiAgentAllocationService.js (AI allocation)
- services/priorityService.js (priority calculation)
- services/ticketService.js (ticket business logic)
- services/attachmentTextExtractor.js (text extraction)
- services/aiAttachmentAnalysisService.js (AI analysis)
- utils/ticketAssignment.js (assignment logic)
- utils/agentLevelSync.js (level sync)
- utils/textFormatter.js (text formatting)
- database.js (pool)

**Service Calls**:
- emailService.sendEmail()
- ticketActivityService.logActivity()
- ticketEventNotificationService.notifyTicketEvent()
- slaResolutionService.resolveSLAForTicket()
- aiAgentAllocationService.enqueueAllocation()
- priorityService.calculatePriority()
- ticketService.* (various ticket operations)
- attachmentTextExtractor.extractAttachmentText()
- aiAttachmentAnalysisService.analyzeAttachmentText()
- ticketAssignment.assignTicket()
- agentLevelSync.syncExecutiveAgentLevelsToNull()

**Database Tables**:
- tickets
- ticket_messages
- ticket_assignments
- ticket_allocations
- ticket_activity
- users
- agents
- products
- modules
- sla_configurations
- sla_timers

---

#### routes/users.js (routes/core/users.js)
**Purpose**: User management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- users

---

### Communication Routes

#### routes/communication/chat.js
**Purpose**: Real-time chat endpoints
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- services/ticketMessagesService.js (message management)
- websocket-instance.js (WebSocket connections)
- database.js (pool)

**Service Calls**:
- ticketMessagesService.createMessage()
- ticketMessagesService.getMessages()
- ticketMessagesService.markAsRead()

**Database Tables**:
- ticket_messages
- chat_sessions
- chat_participants

---

#### routes/communication/replies.js
**Purpose**: Ticket reply management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- services/ticketActivityService.js (activity logging)
- database.js (pool)

**Service Calls**:
- ticketActivityService.logActivity()

**Database Tables**:
- ticket_messages

---

#### routes/communication/whatsapp.js
**Purpose**: WhatsApp integration
**Direct Dependencies**:
- middleware/whatsapp-validation.js (webhook validation)
- utils/whatsapp-notifications.js (WhatsApp sending)
- database.js (pool)

**Service Calls**:
- whatsapp-notifications.sendWhatsAppMessage()

**Database Tables**:
- ticket_messages
- tickets

---

### Management Routes

#### routes/management/assignments.js
**Purpose**: Assignment management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- utils/ticketAssignment.js (assignment logic)
- database.js (pool)

**Service Calls**:
- ticketAssignment.assignTicket()
- ticketAssignment.reassignTicket()

**Database Tables**:
- ticket_assignments
- ticket_allocations
- tickets
- agents

---

#### routes/management/sla.js
**Purpose**: SLA management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- services/slaResolutionService.js (SLA management)
- database.js (pool)

**Service Calls**:
- slaResolutionService.resolveSLAForTicket()
- slaResolutionService.applyResolvedSlaToTicket()

**Database Tables**:
- sla_configurations
- sla_timers
- escalations
- products
- modules

---

#### routes/management/mailReview.js
**Purpose**: Email review queue
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- incoming_emails
- mail_review_queue

---

#### routes/management/ticketTasks.js
**Purpose**: Multi-task workflow
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- tickets (task metadata)

---

### Support Routes

#### routes/support.js
**Purpose**: Support integration
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- support_calls

---

### Other Routes

#### routes/tenants.js
**Purpose**: Tenant management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- tenants

---

#### routes/departments.js
**Purpose**: Department management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- departments

---

#### routes/faqs.js
**Purpose**: FAQ management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- faqs

---

#### routes/feedback.js
**Purpose**: Feedback management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- tickets (satisfaction columns)

---

#### routes/knowledge.js
**Purpose**: Knowledge base
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- None (uses external Elasticsearch)

---

#### routes/notifications.js
**Purpose**: Notification management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- services/appNotificationService.js (notification service)
- database.js (pool)

**Service Calls**:
- appNotificationService.createNotification()
- appNotificationService.markAsRead()

**Database Tables**:
- app_notifications

---

#### routes/settings.js
**Purpose**: System settings
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- services/systemSettingsService.js (settings service)
- database.js (pool)

**Service Calls**:
- systemSettingsService.getSetting()
- systemSettingsService.setSetting()

**Database Tables**:
- system_settings

---

#### routes/productSpoc.js
**Purpose**: Product SPOC management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- product_spoc_mapping
- users
- products

---

#### routes/tenantSpoc.js
**Purpose**: Tenant SPOC management
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- users

---

#### routes/ticketLinks.js
**Purpose**: Linked ticket workflow
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- middleware/tenant.js (setTenantContext, verifyTenantAccess)
- database.js (pool)

**Service Calls**:
- None (direct database queries)

**Database Tables**:
- tickets (linked via metadata)

---

#### routes/ai.js
**Purpose**: AI integration endpoints
**Direct Dependencies**:
- middleware/auth.js (authenticateToken, authorizeRole)
- services/nvidiaAiService.js (NVIDIA AI)
- database.js (pool)

**Service Calls**:
- nvidiaAiService.getClient()

**Database Tables**:
- None

---

---

## Service Dependencies

### Core Services

#### services/emailService.js
**Purpose**: Email sending and management
**Dependencies**:
- database.js (pool)
- nodemailer (SMTP)
- imapflow (IMAP)
- mailparser (email parsing)

**Database Tables**:
- None (configuration in environment)

**Used By**:
- routes/auth.js
- routes/agents.js
- routes/tickets.js
- scheduled-inactivity.js

---

#### services/ticketActivityService.js
**Purpose**: Ticket activity logging
**Dependencies**:
- database.js (pool)

**Database Tables**:
- ticket_activity

**Used By**:
- routes/tickets.js
- routes/communication/replies.js
- services/ticketEventNotificationService.js

---

#### services/ticketEventNotificationService.js
**Purpose**: Notification orchestration
**Dependencies**:
- database.js (pool)
- services/emailService.js
- services/ticketActivityService.js
- services/ticketMessagesService.js
- utils/whatsapp-notifications.js

**Database Tables**:
- tickets
- ticket_messages
- app_notifications

**Used By**:
- routes/tickets.js
- scheduled-escalation.js

---

#### services/ticketMessagesService.js
**Purpose**: Ticket message management
**Dependencies**:
- database.js (pool)

**Database Tables**:
- ticket_messages

**Used By**:
- routes/communication/chat.js
- services/ticketEventNotificationService.js

---

#### services/appNotificationService.js
**Purpose**: In-app notification management
**Dependencies**:
- database.js (pool)

**Database Tables**:
- app_notifications

**Used By**:
- routes/notifications.js
- services/ticketEventNotificationService.js

---

#### services/systemSettingsService.js
**Purpose**: System settings management
**Dependencies**:
- database.js (pool)

**Database Tables**:
- system_settings

**Used By**:
- routes/settings.js
- services/aiAgentAllocationService.js

---

### SLA Services

#### services/slaResolutionService.js
**Purpose**: SLA calculation and enforcement
**Dependencies**:
- database.js (pool)

**Database Tables**:
- sla_configurations
- sla_timers
- products
- modules
- tickets

**Used By**:
- routes/tickets.js
- routes/management/sla.js
- scheduled-escalation.js

---

### AI Services

#### services/nvidiaAiService.js
**Purpose**: NVIDIA AI integration
**Dependencies**:
- openai

**Database Tables**:
- None

**Used By**:
- routes/ai.js
- services/aiAgentAllocationService.js
- services/aiExtractionService.js
- services/aiTemplateSuggestionService.js

---

#### services/aiAgentAllocationService.js
**Purpose**: AI-powered ticket allocation
**Dependencies**:
- database.js (pool)
- services/nvidiaAiService.js
- services/systemSettingsService.js

**Database Tables**:
- agent_skills
- ticket_allocations
- agents

**Used By**:
- routes/tickets.js

---

#### services/aiExtractionService.js
**Purpose**: AI data extraction
**Dependencies**:
- openai
- services/nvidiaAiService.js

**Database Tables**:
- tickets

**Used By**:
- routes/tickets.js (via AI features)

---

#### services/aiAttachmentAnalysisService.js
**Purpose**: AI attachment analysis
**Dependencies**:
- services/attachmentTextExtractor.js

**Database Tables**:
- None

**Used By**:
- routes/tickets.js

---

#### services/aiTemplateSuggestionService.js
**Purpose**: AI reply template suggestions
**Dependencies**:
- openai
- services/nvidiaAiService.js

**Database Tables**:
- None

**Used By**:
- routes/tickets.js (via suggestion features)

---

#### services/aiFeedbackAnalysisService.js
**Purpose**: AI feedback analysis
**Dependencies**:
- None

**Database Tables**:
- None

**Used By**:
- routes/feedback.js (via analysis features)

---

### Account Services

#### services/accountLifecycleService.js
**Purpose**: User account lifecycle
**Dependencies**:
- database.js (pool)
- jsonwebtoken

**Database Tables**:
- users

**Used By**:
- routes/auth.js

---

### Priority Services

#### services/priorityService.js
**Purpose**: Priority calculation
**Dependencies**:
- database.js (pool)

**Database Tables**:
- tickets

**Used By**:
- routes/tickets.js

---

### Ticket Services

#### services/ticketService.js
**Purpose**: Core ticket business logic
**Dependencies**:
- database.js (pool)

**Database Tables**:
- tickets

**Used By**:
- routes/tickets.js

---

### Document Services

#### services/attachmentTextExtractor.js
**Purpose**: Text extraction from files
**Dependencies**:
- mammoth (DOCX)
- pdf-parse (PDF)
- tesseract.js (OCR)
- xlsx (Excel)

**Database Tables**:
- None

**Used By**:
- routes/tickets.js
- services/aiAttachmentAnalysisService.js

---

### Knowledge Services

#### services/faqSemanticSearchService.js
**Purpose**: FAQ semantic search
**Dependencies**:
- elasticsearch

**Database Tables**:
- faqs

**Used By**:
- routes/faqs.js

---

### Email Services

#### services/incomingEmailService.js
**Purpose**: Incoming email processing
**Dependencies**:
- database.js (pool)
- imapflow
- mailparser
- services/emailService.js

**Database Tables**:
- incoming_emails
- mail_review_queue
- ticket_messages
- users
- tickets

**Used By**:
- Scheduled task (email polling)

---

### Token Services

#### services/feedbackTokenService.js
**Purpose**: Feedback token management
**Dependencies**:
- jsonwebtoken

**Database Tables**:
- None

**Used By**:
- routes/feedback.js

---

---

## Middleware Dependencies

### middleware/auth.js
**Purpose**: Authentication and authorization
**Dependencies**:
- database.js (pool)
- jsonwebtoken
- bcryptjs

**Database Tables**:
- users
- agents

**Used By**:
- All routes (except public endpoints)

---

### middleware/tenant.js
**Purpose**: Multi-tenant context
**Dependencies**:
- database.js (pool)
- jsonwebtoken

**Database Tables**:
- tenants
- users

**Used By**:
- All routes (multi-tenant isolation)

---

### middleware/upload.js
**Purpose**: File upload handling
**Dependencies**:
- multer

**Database Tables**:
- None

**Used By**:
- routes/tickets.js

---

### middleware/branchFilter.js
**Purpose**: Branch/department filtering
**Dependencies**:
- database.js (pool)

**Database Tables**:
- departments

**Used By**:
- Selected routes (department-based filtering)

---

### middleware/textFormatting.js
**Purpose**: Text formatting
**Dependencies**:
- utils/textFormatter.js

**Database Tables**:
- None

**Used By**:
- Selected routes (text processing)

---

### middleware/whatsapp-validation.js
**Purpose**: WhatsApp webhook validation
**Dependencies**:
- None

**Database Tables**:
- None

**Used By**:
- routes/communication/whatsapp.js

---

---

## Utility Dependencies

### utils/ticketAssignment.js
**Purpose**: Ticket assignment logic
**Dependencies**:
- database.js (pool)
- services/emailService.js
- utils/agentLevelSync.js

**Database Tables**:
- ticket_assignments
- ticket_allocations
- agents
- users

**Used By**:
- routes/tickets.js
- routes/management/assignments.js

---

### utils/agentLevelSync.js
**Purpose**: Agent level synchronization
**Dependencies**:
- database.js (pool)

**Database Tables**:
- agents

**Used By**:
- routes/agents.js
- routes/tickets.js
- utils/ticketAssignment.js

---

### utils/textFormatter.js
**Purpose**: Text formatting utilities
**Dependencies**:
- None

**Database Tables**:
- None

**Used By**:
- routes/tickets.js
- middleware/textFormatting.js

---

### utils/whatsapp-notifications.js
**Purpose**: WhatsApp notification sending
**Dependencies**:
- axios

**Database Tables**:
- None

**Used By**:
- routes/communication/whatsapp.js
- services/ticketEventNotificationService.js

---

### utils/emailCleaner.js
**Purpose**: Email content cleaning
**Dependencies**:
- None

**Database Tables**:
- None

**Used By**:
- services/incomingEmailService.js

---

### utils/tenantQueries.js
**Purpose**: Tenant-specific queries
**Dependencies**:
- database.js (pool)

**Database Tables**:
- tenants

**Used By**:
- Selected routes (tenant data retrieval)

---

---

## Frontend → API Dependencies

### Authentication Pages

#### components/auth/GlobalLogin.js
**API Endpoints**:
- POST /api/auth/login
- POST /api/auth/staff-login
- POST /api/auth/business-dashboard-auth

**Dependencies**:
- utils/api.js (authenticatedFetch, getAuthHeaders)

---

#### components/auth/CustomerAccessPage.js
**API Endpoints**:
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- POST /api/auth/verify-email
- POST /api/auth/set-password

**Dependencies**:
- utils/api.js

---

#### components/auth/StaffLogin.js
**API Endpoints**:
- POST /api/auth/staff-login
- POST /api/auth/set-password

**Dependencies**:
- utils/api.js

---

### Dashboard Pages

#### components/dashboards/AgentDashboard.js
**API Endpoints**:
- GET /api/tickets (agent's tickets)
- GET /api/tickets/:id (ticket details)
- PUT /api/tickets/:id (update ticket)
- POST /api/tickets/:id/assign (assign ticket)
- GET /api/agents/me (agent profile)
- GET /api/notifications (notifications)

**Dependencies**:
- utils/api.js
- context/NotificationContext.js

---

#### components/dashboards/ManagerDashboard.js
**API Endpoints**:
- GET /api/tickets (team tickets)
- GET /api/agents (team agents)
- GET /api/assignments (assignments)
- GET /api/escalations (escalations)
- GET /api/mail-review (mail review queue)
- GET /api/feedback-insights (feedback analytics)
- GET /api/notifications (notifications)

**Dependencies**:
- utils/api.js
- context/NotificationContext.js

---

#### components/dashboards/CEODashboard.js
**API Endpoints**:
- GET /api/tickets (all tickets)
- GET /api/agents (all agents)
- GET /api/departments (all departments)
- GET /api/assignments (all assignments)
- GET /api/feedback-insights (feedback analytics)
- GET /api/notifications (notifications)

**Dependencies**:
- utils/api.js
- context/NotificationContext.js

---

#### components/dashboards/UserDashboard.js
**API Endpoints**:
- GET /api/tickets (user's tickets)
- POST /api/tickets (create ticket)
- GET /api/tickets/:id (ticket details)
- GET /api/notifications (notifications)

**Dependencies**:
- utils/api.js
- context/NotificationContext.js

---

### Ticket Pages

#### components/tickets/TicketDetailPage.js
**API Endpoints**:
- GET /api/tickets/:id (ticket details)
- PUT /api/tickets/:id (update ticket)
- GET /api/chat/messages/:ticketId (chat messages)
- POST /api/chat/messages (send message)
- GET /api/ticket-activity/:ticketId (activity timeline)
- GET /api/linked-tickets/:ticketId (linked tickets)
- GET /api/notifications (notifications)

**Dependencies**:
- utils/api.js
- context/NotificationContext.js
- components/chat/SupportTicketChatTabs.js

---

#### components/tickets/UserForm.js
**API Endpoints**:
- POST /api/tickets (create ticket)
- GET /api/products (products)
- GET /api/modules (modules)
- GET /api/departments (departments)

**Dependencies**:
- utils/api.js

---

### Chat Components

#### components/chat/SupportTicketChatTabs.js
**API Endpoints**:
- GET /api/chat/messages/:ticketId (chat messages)
- POST /api/chat/messages (send message)
- GET /api/reply-suggestions (AI suggestions)

**Dependencies**:
- utils/api.js

---

#### components/chat/TicketChat.js
**API Endpoints**:
- GET /api/chat/messages/:ticketId (chat messages)
- POST /api/chat/messages (send message)
- POST /api/chat/typing (typing indicator)

**Dependencies**:
- utils/api.js

---

### SLA Components

#### components/sla/SLADashboard.js
**API Endpoints**:
- GET /api/sla/timers (SLA timers)
- GET /api/sla/configurations (SLA configs)
- GET /api/sla/statistics (SLA statistics)

**Dependencies**:
- utils/api.js

---

#### components/sla/SLAManagement.js
**API Endpoints**:
- GET /api/sla/configurations (SLA configs)
- POST /api/sla/configurations (create SLA)
- PUT /api/sla/configurations/:id (update SLA)
- DELETE /api/sla/configurations/:id (delete SLA)

**Dependencies**:
- utils/api.js

---

### Notification Components

#### components/notifications/NotificationBell.js
**API Endpoints**:
- GET /api/notifications (notifications)
- PUT /api/notifications/:id/read (mark as read)

**Dependencies**:
- context/NotificationContext.js

---

### Feedback Components

#### components/feedback/FeedbackFormPage.js
**API Endpoints**:
- POST /api/feedback (submit feedback)
- GET /api/feedback/token (get feedback token)

**Dependencies**:
- utils/api.js
- services/feedbackTokenService.js

---

#### components/feedback/FeedbackInsightsPage.js
**API Endpoints**:
- GET /api/feedback-insights (feedback analytics)
- GET /api/feedback/analytics (detailed analytics)

**Dependencies**:
- utils/api.js

---

### Help Components

#### components/help/HelpFAQPage.js
**API Endpoints**:
- GET /api/faqs (FAQs)
- GET /api/faqs/search (search FAQs)

**Dependencies**:
- utils/api.js

---

### Mail Components

#### components/dashboards/MailInbox.js
**API Endpoints**:
- GET /api/incoming-emails (incoming emails)
- PUT /api/incoming-emails/:id (update email)
- POST /api/incoming-emails/:id/process (process email)

**Dependencies**:
- utils/api.js

---

#### components/dashboards/MailReviewQueue.js
**API Endpoints**:
- GET /api/mail-review (review queue)
- PUT /api/mail-review/:id (review action)

**Dependencies**:
- utils/api.js

---

### Common Components

#### components/common/SupportEntry.js
**API Endpoints**:
- GET /api/products/by-slug/:slug (product by slug)
- POST /api/auth/auto-login (auto-login)
- GET /api/tickets (user's tickets)

**Dependencies**:
- utils/api.js

---

---

## Shared Components

### Frontend Shared Components

#### context/NotificationContext.js
**Purpose**: Global notification state management
**Used By**:
- components/notifications/NotificationBell.js
- components/notifications/NotificationDropdown.js
- components/dashboards/AgentDashboard.js
- components/dashboards/ManagerDashboard.js
- components/dashboards/CEODashboard.js
- components/dashboards/UserDashboard.js
- components/tickets/TicketDetailPage.js

**Dependencies**:
- routes/notifications.js
- services/appNotificationService.js

---

#### utils/api.js
**Purpose**: Centralized API utilities
**Used By**:
- All frontend components (API calls)

**Dependencies**:
- All backend routes

**Key Functions**:
- authenticatedFetch()
- getAuthHeaders()
- buildApiUrl()
- isStaffSessionValid()
- isCustomerSessionValid()
- fetchTicketReplySuggestions()

---

#### utils/dateTime.js
**Purpose**: Date/time formatting utilities
**Used By**:
- components/tickets/TicketDetailPage.js
- components/chat/SupportTicketChatTabs.js
- components/dashboards/*

**Dependencies**:
- None

---

#### utils/formatRelativeTime.js
**Purpose**: Relative time formatting
**Used By**:
- components/tickets/TicketDetailPage.js
- components/chat/*

**Dependencies**:
- None

---

### Backend Shared Utilities

#### database.js
**Purpose**: Database connection pooling
**Used By**:
- All routes
- All services
- All utilities

**Dependencies**:
- mysql2

---

#### websocket-instance.js
**Purpose**: WebSocket instance store
**Used By**:
- websocket-server.js
- routes/communication/chat.js

**Dependencies**:
- ws

---

---

## Safely Archivable Modules

### Criteria for Safe Archival
A module can be safely archived if:
1. No other modules depend on it
2. It has been replaced by newer functionality
3. It is ITSM-specific and not applicable to HCMS
4. Its functionality is merged into other modules

### Safely Archivable Modules

#### Backend Modules

##### routes/communication/replies.js
**Reason**: Functionality merged into ticket_messages table and routes/communication/chat.js
**Dependents**: None (legacy)
**Impact**: None (already deprecated)

---

##### routes/communication/whatsapp-mock.js
**Reason**: Mock endpoint for testing only
**Dependents**: None
**Impact**: None (testing only)

---

##### routes/productSpoc.js
**Reason**: Product SPOC concept not applicable to HCMS
**Dependents**: components/dashboards/ProductSpocDashboard.js
**Impact**: Low (can be replaced with department/role-based access)

---

##### routes/tenantSpoc.js
**Reason**: Tenant SPOC can be replaced with standard user roles
**Dependents**: None
**Impact**: Low (can use existing user roles)

---

##### services/itsmAssistantPrompt.js
**Reason**: ITSM-specific AI prompts
**Dependents**: components/assistant/ItsmAssistant.js
**Impact**: None (ITSM-specific)

---

##### services/organizationService.js
**Reason**: Organization table removed; tenants act as organizations
**Dependents**: None
**Impact**: None (no longer used)

---

##### utils/agentLevelSync.js
**Reason**: ITSM-specific level hierarchy
**Dependents**: routes/agents.js, routes/tickets.js, utils/ticketAssignment.js
**Impact**: Medium (needs replacement with healthcare role hierarchy)

---

#### Frontend Modules

##### Legacy Root Components
**Files**:
- AgentDashboard.js (root level)
- BusinessDashboard.js (root level)
- ManagerDashboard.js (root level)
- UserDashboard.js (root level)
- TicketDetailPage.js (root level)
- GlobalLogin.js (root level)

**Reason**: Replaced by organized component structure in components/ subdirectories
**Dependents**: None (legacy)
**Impact**: None (newer versions exist)

---

##### components/dashboards/ProductDashboard.js
**Reason**: Product concept not applicable to HCMS
**Dependents**: None
**Impact**: Low (can be replaced with service/department dashboards)

---

##### components/dashboards/ProductSpocDashboard.js
**Reason**: Product SPOC not applicable to HCMS
**Dependents**: routes/productSpoc.js
**Impact**: Low (can be replaced with department/role dashboards)

---

##### components/assistant/ItsmAssistant.js
**Reason**: ITSM-specific AI assistant
**Dependents**: services/itsmAssistantPrompt.js
**Impact**: None (ITSM-specific)

---

#### Database Tables

##### replies (already removed)
**Reason**: Merged into ticket_messages
**Dependents**: None
**Impact**: None (already removed)

---

##### chat_messages (already removed)
**Reason**: Merged into ticket_messages
**Dependents**: None
**Impact**: None (already removed)

---

##### whatsapp_messages (already removed)
**Reason**: Merged into ticket_messages
**Dependents**: None
**Impact**: None (already removed)

---

##### whatsapp_conversations (already removed)
**Reason**: Replaced by chat_sessions
**Dependents**: None
**Impact**: None (already removed)

---

##### products
**Reason**: Product concept not applicable to HCMS
**Dependents**: 
- routes/productSpoc.js
- routes/tickets.js (product_id FK)
- components/dashboards/ProductDashboard.js
- components/dashboards/ProductSpocDashboard.js

**Impact**: Medium (needs replacement with healthcare services)
**Migration Path**: Replace with healthcare_services table

---

##### modules
**Reason**: Module concept not applicable to HCMS
**Dependents**:
- routes/tickets.js (module_id FK)
- sla_configurations (module_id FK)

**Impact**: Medium (needs replacement with medical specialties)
**Migration Path**: Replace with medical_specialties table

---

##### product_spoc_mapping
**Reason**: Product SPOC not applicable to HCMS
**Dependents**:
- routes/productSpoc.js
- users (product_scope_id FK)

**Impact**: Low (can be replaced with department/role mapping)
**Migration Path**: Replace with department_role_mapping table

---

### Modules Requiring Migration Before Archival

These modules have dependencies and require migration before archival:

#### routes/productSpoc.js
**Migration Path**:
1. Create department_role_mapping table
2. Migrate product SPOC data to department roles
3. Update routes to use department roles
4. Archive productSpoc.js

---

#### utils/agentLevelSync.js
**Migration Path**:
1. Define healthcare role hierarchy
2. Create healthcare_role_hierarchy table
3. Update assignment logic to use healthcare roles
4. Archive agentLevelSync.js

---

#### products table
**Migration Path**:
1. Create healthcare_services table
2. Migrate product data to healthcare services
3. Update all product_id FKs to service_id
4. Update routes to use healthcare services
5. Archive products table

---

#### modules table
**Migration Path**:
1. Create medical_specialties table
2. Migrate module data to medical specialties
3. Update all module_id FKs to specialty_id
4. Update SLA configurations to use specialties
5. Archive modules table

---

---

## Dependency Graph Summary

### Critical Path (Cannot be archived)
```
database.js
    ↓
middleware/auth.js, middleware/tenant.js
    ↓
All routes
    ↓
All services
    ↓
All frontend components
```

### Independent Modules (Can be archived immediately)
- routes/communication/whatsapp-mock.js
- services/itsmAssistantPrompt.js
- services/organizationService.js
- Legacy root components (replaced by newer versions)
- components/assistant/ItsmAssistant.js

### Dependent Modules (Require migration before archival)
- routes/productSpoc.js (depends on products, product_spoc_mapping)
- utils/agentLevelSync.js (depends on agents table structure)
- products table (used by tickets, sla_configurations)
- modules table (used by tickets, sla_configurations)
- product_spoc_mapping table (used by users, routes)

---

## Recommendations

### Immediate Archival (Safe)
1. Move legacy root components to archive/frontend/components/
2. Archive routes/communication/whatsapp-mock.js
3. Archive services/itsmAssistantPrompt.js
4. Archive services/organizationService.js
5. Archive components/assistant/ItsmAssistant.js

### Phase 2 Archival (After migration)
1. Archive routes/productSpoc.js (after department role mapping)
2. Archive utils/agentLevelSync.js (after healthcare role hierarchy)
3. Archive products table (after healthcare services migration)
4. Archive modules table (after medical specialties migration)
5. Archive product_spoc_mapping table (after department role mapping)

### Keep for HCMS
- All core infrastructure (database, auth, tenant, notifications)
- All communication infrastructure (chat, messaging, email)
- All SLA infrastructure (adapt for healthcare)
- All AI services (adapt for healthcare)
- All utilities (text formatting, date/time, API)
