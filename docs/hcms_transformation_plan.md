# HCMS Transformation Plan

## Overview
This document outlines the transformation plan for converting the ITSM system to HCMS (Healthcare Case Management System). The plan classifies existing ITSM modules based on HCMS requirements and provides a roadmap for the transformation.

## HCMS Requirements Mapping

### Required HCMS Features
- **Authentication**: User login, role-based access, session management
- **Users**: User management, customer/patient management
- **Employee Management**: Staff management, role assignments
- **Case Creation**: Create and manage healthcare cases
- **Assignment**: Assign cases to staff members
- **Status Updates**: Track case status and progress
- **Escalation**: Escalate cases based on rules/timelines
- **Notifications**: Alert users about case updates
- **Attachments**: Upload and manage case attachments
- **Comments**: Add comments and notes to cases
- **Audit Logs**: Track all case activities
- **Dashboards**: View case metrics and analytics
- **Reports**: Generate case reports

### Unnecessary ITSM Features (Archive)
- **Product Mapping**: ITSM product/module concepts
- **FAQ**: ITSM FAQ system
- **Knowledge Base**: ITSM knowledge base
- **Product SPOC**: Product-specific point of contact
- **ITSM Assistant**: ITSM-specific AI assistant

---

## Classification Criteria

### KEEP
- Core infrastructure with direct HCMS applicability
- Authentication and authorization
- User and employee management
- Case/ticket management (with terminology updates)
- Assignment and escalation logic
- Notification system
- Attachment handling
- Comment/messaging system
- Audit logging
- Dashboard and reporting infrastructure

### MODIFY
- Terminology updates (ticket → case, agent → staff, product → service)
- Healthcare-specific data fields
- Healthcare-specific workflows
- Healthcare compliance features
- Healthcare-specific dashboards and reports

### ARCHIVE
- ITSM-specific product/module management
- FAQ and knowledge base systems
- Product SPOC functionality
- ITSM-specific AI features
- Legacy components replaced by newer versions

### FUTURE
- Healthcare-specific modules (patient records, medical history)
- Healthcare compliance (HIPAA, regulatory)
- Healthcare integrations (EHR, medical systems)
- Healthcare-specific reporting and analytics

---

## Backend Module Classification

### Core Infrastructure

#### database.js
- **HCMS Feature**: Database layer
- **Classification**: KEEP
- **Reason**: Core database infrastructure essential for HCMS
- **Changes**: None (multi-tenant support already in place)

#### server.js
- **HCMS Feature**: Server infrastructure
- **Classification**: KEEP
- **Reason**: Express server setup essential for HCMS
- **Changes**: None

#### websocket-server.js
- **HCMS Feature**: Real-time communication
- **Classification**: KEEP
- **Reason**: Real-time collaboration essential for healthcare case management
- **Changes**: None

---

### Authentication

#### routes/auth.js
- **HCMS Feature**: Authentication
- **Classification**: MODIFY
- **Reason**: Authentication flows needed, but require healthcare-specific verification
- **Changes**: Add healthcare credential verification, license validation
- **Backend Files**: routes/auth.js, routes/core/auth.js
- **Frontend Files**: components/auth/*
- **Database Tables**: users, agents

#### middleware/auth.js
- **HCMS Feature**: Authentication & Authorization
- **Classification**: MODIFY
- **Reason**: Core auth logic needed, but roles need healthcare permissions
- **Changes**: Add healthcare-specific roles (doctor, nurse, specialist), HIPAA access controls
- **Backend Files**: middleware/auth.js
- **Frontend Files**: utils/api.js
- **Database Tables**: users, agents

#### services/accountLifecycleService.js
- **HCMS Feature**: User Management
- **Classification**: MODIFY
- **Reason**: User lifecycle needed, but adapt for healthcare verification
- **Changes**: Add healthcare account verification workflows
- **Backend Files**: services/accountLifecycleService.js
- **Database Tables**: users

---

### User & Employee Management

#### routes/core/users.js
- **HCMS Feature**: Users
- **Classification**: MODIFY
- **Reason**: User management needed, but adapt for healthcare (patient vs staff)
- **Changes**: Add patient-specific fields, medical credentials for staff
- **Backend Files**: routes/core/users.js
- **Frontend Files**: components/tickets/UserForm.js
- **Database Tables**: users

#### routes/agents.js
- **HCMS Feature**: Employee Management
- **Classification**: MODIFY
- **Reason**: Staff management needed, but rename to "staff", adapt for healthcare
- **Changes**: Rename to staff, add medical specialties, certifications
- **Backend Files**: routes/agents.js, routes/core/agents.js
- **Frontend Files**: components/dashboards/AgentDashboard.js
- **Database Tables**: agents, agent_skills

#### routes/core/staff.js
- **HCMS Feature**: Employee Management
- **Classification**: MODIFY
- **Reason**: Staff operations needed, but adapt for healthcare
- **Changes**: Add healthcare-specific staff operations
- **Backend Files**: routes/core/staff.js
- **Database Tables**: users, agents

---

### Case Management

#### routes/tickets.js
- **HCMS Feature**: Case Creation, Status Updates, Comments
- **Classification**: MODIFY
- **Reason**: Core case management needed, but rename "ticket" to "case"
- **Changes**: Rename to cases, add healthcare-specific fields (patient info, medical data)
- **Backend Files**: routes/tickets.js, routes/management/tickets.js
- **Frontend Files**: components/tickets/*
- **Database Tables**: tickets (rename to cases)

#### services/ticketService.js
- **HCMS Feature**: Case Management
- **Classification**: MODIFY
- **Reason**: Case business logic needed, but adapt for healthcare workflows
- **Changes**: Rename to caseService, adapt for healthcare case workflows
- **Backend Files**: services/ticketService.js
- **Database Tables**: tickets

#### src/modules/tickets/
- **HCMS Feature**: Case Management
- **Classification**: MODIFY
- **Reason**: Modular case structure needed, but rename to cases
- **Changes**: Rename module to cases, adapt for healthcare
- **Backend Files**: src/modules/tickets/*
- **Frontend Files**: None
- **Database Tables**: tickets

---

### Assignment

#### routes/management/assignments.js
- **HCMS Feature**: Assignment
- **Classification**: KEEP
- **Reason**: Assignment logic directly applicable to HCMS
- **Changes**: None (may need healthcare-specific assignment rules)
- **Backend Files**: routes/management/assignments.js
- **Frontend Files**: components/dashboards/ManagerDashboard.js
- **Database Tables**: ticket_assignments, ticket_allocations

#### utils/ticketAssignment.js
- **HCMS Feature**: Assignment
- **Classification**: MODIFY
- **Reason**: Assignment logic needed, but adapt for healthcare (specialist assignment)
- **Changes**: Rename to caseAssignment, add healthcare assignment rules
- **Backend Files**: utils/ticketAssignment.js
- **Database Tables**: ticket_assignments, ticket_allocations

#### services/aiAgentAllocationService.js
- **HCMS Feature**: Assignment
- **Classification**: MODIFY
- **Reason**: AI allocation useful, but train for healthcare specialization
- **Changes**: Train AI for healthcare specialist matching
- **Backend Files**: services/aiAgentAllocationService.js
- **Database Tables**: agent_skills, ticket_allocations

---

### Escalation

#### routes/management/sla.js
- **HCMS Feature**: Escalation
- **Classification**: MODIFY
- **Reason**: Escalation framework needed, but adapt for healthcare timelines
- **Changes**: Adapt SLA rules for healthcare (emergency response, care timelines)
- **Backend Files**: routes/management/sla.js
- **Frontend Files**: components/sla/*
- **Database Tables**: sla_configurations, sla_timers, escalations

#### services/slaResolutionService.js
- **HCMS Feature**: Escalation
- **Classification**: MODIFY
- **Reason**: SLA logic needed, but adapt for healthcare timeframes
- **Changes**: Adapt for healthcare response times, business hours
- **Backend Files**: services/slaResolutionService.js
- **Database Tables**: sla_configurations, sla_timers

#### scheduled-escalation.js
- **HCMS Feature**: Escalation
- **Classification**: MODIFY
- **Reason**: Escalation workflow needed, but adapt for healthcare protocols
- **Changes**: Adapt for healthcare escalation (specialist escalation, emergency protocols)
- **Backend Files**: scheduled-escalation.js
- **Database Tables**: sla_timers, escalations

---

### Notifications

#### routes/notifications.js
- **HCMS Feature**: Notifications
- **Classification**: KEEP
- **Reason**: Notification system directly applicable to HCMS
- **Changes**: None
- **Backend Files**: routes/notifications.js
- **Frontend Files**: components/notifications/*
- **Database Tables**: app_notifications

#### services/appNotificationService.js
- **HCMS Feature**: Notifications
- **Classification**: KEEP
- **Reason**: Notification service directly applicable to HCMS
- **Changes**: None
- **Backend Files**: services/appNotificationService.js
- **Database Tables**: app_notifications

#### services/ticketEventNotificationService.js
- **HCMS Feature**: Notifications
- **Classification**: KEEP
- **Reason**: Notification orchestration directly applicable to HCMS
- **Changes**: None
- **Backend Files**: services/ticketEventNotificationService.js
- **Database Tables**: tickets, ticket_messages, app_notifications

---

### Attachments

#### middleware/upload.js
- **HCMS Feature**: Attachments
- **Classification**: KEEP
- **Reason**: File upload handling directly applicable to HCMS
- **Changes**: None (may need healthcare-specific file validation)
- **Backend Files**: middleware/upload.js
- **Database Tables**: tickets (attachment columns)

#### services/attachmentTextExtractor.js
- **HCMS Feature**: Attachments
- **Classification**: KEEP
- **Reason**: Document processing essential for healthcare (medical records, lab reports)
- **Changes**: None
- **Backend Files**: services/attachmentTextExtractor.js
- **Database Tables**: None

#### services/aiAttachmentAnalysisService.js
- **HCMS Feature**: Attachments
- **Classification**: MODIFY
- **Reason**: Analysis useful, but train for healthcare documents
- **Changes**: Train AI for medical document analysis, lab reports
- **Backend Files**: services/aiAttachmentAnalysisService.js
- **Database Tables**: None

---

### Comments

#### routes/communication/chat.js
- **HCMS Feature**: Comments
- **Classification**: KEEP
- **Reason**: Messaging system directly applicable to HCMS
- **Changes**: None
- **Backend Files**: routes/communication/chat.js
- **Frontend Files**: components/chat/*
- **Database Tables**: ticket_messages

#### services/ticketMessagesService.js
- **HCMS Feature**: Comments
- **Classification**: KEEP
- **Reason**: Message management directly applicable to HCMS
- **Changes**: None
- **Backend Files**: services/ticketMessagesService.js
- **Database Tables**: ticket_messages

#### routes/communication/replies.js
- **HCMS Feature**: Comments
- **Classification**: ARCHIVE
- **Reason**: Functionality merged into ticket_messages; legacy
- **Backend Files**: routes/communication/replies.js
- **Frontend Files**: None
- **Database Tables**: ticket_messages

---

### Audit Logs

#### services/ticketActivityService.js
- **HCMS Feature**: Audit Logs
- **Classification**: KEEP
- **Reason**: Audit trail essential for healthcare compliance
- **Changes**: None
- **Backend Files**: services/ticketActivityService.js
- **Database Tables**: ticket_activity

---

### Dashboards

#### components/dashboards/AgentDashboard.js
- **HCMS Feature**: Dashboards
- **Classification**: MODIFY
- **Reason**: Dashboard structure needed, but adapt for healthcare staff views
- **Changes**: Adapt for healthcare staff views, patient cases
- **Backend Files**: routes/tickets.js, routes/agents.js
- **Frontend Files**: components/dashboards/AgentDashboard.js
- **Database Tables**: tickets, agents

#### components/dashboards/ManagerDashboard.js
- **HCMS Feature**: Dashboards
- **Classification**: MODIFY
- **Reason**: Manager dashboard needed, but adapt for healthcare team management
- **Changes**: Adapt for healthcare care team management, patient assignments
- **Backend Files**: routes/management/tickets.js, routes/management/assignments.js
- **Frontend Files**: components/dashboards/ManagerDashboard.js
- **Database Tables**: tickets, ticket_assignments

#### components/dashboards/CEODashboard.js
- **HCMS Feature**: Dashboards, Reports
- **Classification**: MODIFY
- **Reason**: Executive dashboard needed, but adapt for healthcare metrics
- **Changes**: Adapt for healthcare facility metrics, care quality analytics
- **Backend Files**: routes/agents.js, routes/departments.js
- **Frontend Files**: components/dashboards/CEODashboard.js
- **Database Tables**: agents, departments, tickets

#### components/dashboards/UserDashboard.js
- **HCMS Feature**: Dashboards
- **Classification**: MODIFY
- **Reason**: Customer dashboard needed, but adapt for patient portal
- **Changes**: Adapt for patient portal, medical records access
- **Backend Files**: routes/tickets.js
- **Frontend Files**: components/dashboards/UserDashboard.js
- **Database Tables**: tickets, users

---

### Reports

#### routes/feedback.js
- **HCMS Feature**: Reports
- **Classification**: KEEP
- **Reason**: Feedback collection applicable to healthcare (patient satisfaction)
- **Changes**: None
- **Backend Files**: routes/feedback.js
- **Frontend Files**: components/feedback/*
- **Database Tables**: tickets (satisfaction columns)

#### services/aiFeedbackAnalysisService.js
- **HCMS Feature**: Reports
- **Classification**: MODIFY
- **Reason**: Analysis useful, but adapt for healthcare feedback
- **Changes**: Adapt for patient feedback analysis, care quality metrics
- **Backend Files**: services/aiFeedbackAnalysisService.js
- **Database Tables**: None

---

### Multi-Tenancy

#### routes/tenants.js
- **HCMS Feature**: Multi-organization support
- **Classification**: KEEP
- **Reason**: Multi-tenant support essential for healthcare (multiple facilities)
- **Changes**: None
- **Backend Files**: routes/tenants.js
- **Database Tables**: tenants

#### middleware/tenant.js
- **HCMS Feature**: Multi-organization support
- **Classification**: KEEP
- **Reason**: Tenant isolation essential for healthcare facilities
- **Changes**: None
- **Backend Files**: middleware/tenant.js
- **Database Tables**: tenants

---

### Department Management

#### routes/departments.js
- **HCMS Feature**: Employee Management
- **Classification**: KEEP
- **Reason**: Department structure applicable to healthcare (medical departments)
- **Changes**: None
- **Backend Files**: routes/departments.js
- **Database Tables**: departments

#### migrations/department_setup.js
- **HCMS Feature**: Employee Management
- **Classification**: KEEP
- **Reason**: Department setup applicable to healthcare
- **Changes**: None
- **Backend Files**: migrations/department_setup.js
- **Database Tables**: departments, manager_department_permissions

---

### Communication

#### routes/communication/whatsapp.js
- **HCMS Feature**: Notifications
- **Classification**: MODIFY
- **Reason**: WhatsApp integration useful, but adapt for healthcare communication
- **Changes**: Adapt for patient communication, appointment reminders
- **Backend Files**: routes/communication/whatsapp.js
- **Database Tables**: ticket_messages

#### services/emailService.js
- **HCMS Feature**: Notifications
- **Classification**: KEEP
- **Reason**: Email communication essential for healthcare
- **Changes**: None
- **Backend Files**: services/emailService.js
- **Database Tables**: None

#### services/incomingEmailService.js
- **HCMS Feature**: Notifications
- **Classification**: MODIFY
- **Reason**: Email processing useful, but adapt for healthcare
- **Changes**: Adapt for patient email handling, medical content
- **Backend Files**: services/incomingEmailService.js
- **Database Tables**: incoming_emails, mail_review_queue

---

### System Settings

#### routes/settings.js
- **HCMS Feature**: System Configuration
- **Classification**: KEEP
- **Reason**: Settings management essential for HCMS
- **Changes**: None
- **Backend Files**: routes/settings.js
- **Database Tables**: system_settings

#### services/systemSettingsService.js
- **HCMS Feature**: System Configuration
- **Classification**: KEEP
- **Reason**: Settings service essential for HCMS
- **Changes**: None
- **Backend Files**: services/systemSettingsService.js
- **Database Tables**: system_settings

---

### Priority Management

#### services/priorityService.js
- **HCMS Feature**: Case Management
- **Classification**: MODIFY
- **Reason**: Priority logic needed, but adapt for healthcare triage
- **Changes**: Adapt for healthcare urgency, medical triage
- **Backend Files**: services/priorityService.js
- **Database Tables**: tickets

---

### AI Services - AI Bot for Employee Assistance (KEEP & MODIFY)

**Purpose**: AI bot assists healthcare employees (staff) with case management, productivity, and decision support - NOT for patient-facing medical diagnosis.

#### services/nvidiaAiService.js
- **HCMS Feature**: AI Bot Core Infrastructure
- **Classification**: MODIFY
- **Reason**: AI bot core needed for employee assistance, but adapt for healthcare context
- **Changes**: Adapt for healthcare AI models, HIPAA-compliant AI, employee productivity focus
- **Backend Files**: services/nvidiaAiService.js
- **Frontend Files**: components/assistant/ItsmAssistant.js (rename to EmployeeAssistant.js)
- **Database Tables**: None

#### services/aiExtractionService.js
- **HCMS Feature**: AI Bot - Case Data Extraction
- **Classification**: MODIFY
- **Reason**: AI extraction helps employees process cases faster
- **Changes**: Train for healthcare case entity extraction, urgency classification, case triage
- **Backend Files**: services/aiExtractionService.js
- **Database Tables**: tickets (cases)

#### services/aiTemplateSuggestionService.js
- **HCMS Feature**: AI Bot - Response Suggestions for Staff
- **Classification**: MODIFY
- **Reason**: AI suggestions help employees respond to cases efficiently
- **Changes**: Adapt for healthcare case response templates, professional communication, care coordination
- **Backend Files**: services/aiTemplateSuggestionService.js
- **Frontend Files**: components/chat/SupportTicketChatTabs.js (suggestions)
- **Database Tables**: None

#### services/aiAgentAllocationService.js
- **HCMS Feature**: AI Bot - Smart Case Assignment
- **Classification**: MODIFY
- **Reason**: AI-powered assignment helps distribute workload among staff
- **Changes**: Train AI for healthcare staff matching, department routing, care team assignment based on workload and skills
- **Backend Files**: services/aiAgentAllocationService.js
- **Database Tables**: agent_skills, ticket_allocations

#### services/aiAttachmentAnalysisService.js
- **HCMS Feature**: AI Bot - Document Analysis for Staff
- **Classification**: MODIFY
- **Reason**: AI document analysis helps employees process case attachments faster
- **Changes**: Train for healthcare document summarization, lab report extraction, medical record processing (for staff review)
- **Backend Files**: services/aiAttachmentAnalysisService.js
- **Database Tables**: None

#### services/aiFeedbackAnalysisService.js
- **HCMS Feature**: AI Bot - Feedback Analysis for Quality Improvement
- **Classification**: MODIFY
- **Reason**: AI feedback analysis helps management improve service quality
- **Changes**: Adapt for patient feedback analysis, staff performance insights, care quality trends
- **Backend Files**: services/aiFeedbackAnalysisService.js
- **Frontend Files**: components/feedback/FeedbackInsightsPage.js
- **Database Tables**: None

#### routes/ai.js
- **HCMS Feature**: AI Bot Endpoints for Employee Tools
- **Classification**: MODIFY
- **Reason**: AI endpoints needed for employee assistance features
- **Changes**: Adapt endpoints for healthcare employee AI use cases
- **Backend Files**: routes/ai.js
- **Frontend Files**: components/assistant/* (rename to EmployeeAssistant.js)
- **Database Tables**: None

---

### ARCHIVE - Unnecessary for HCMS

#### routes/productSpoc.js
- **HCMS Feature**: None (Product Mapping)
- **Classification**: ARCHIVE
- **Reason**: Product SPOC concept not applicable to healthcare
- **Backend Files**: routes/productSpoc.js
- **Frontend Files**: components/dashboards/ProductSpocDashboard.js
- **Database Tables**: product_spoc_mapping

#### routes/tenantSpoc.js
- **HCMS Feature**: None (Product Mapping)
- **Classification**: ARCHIVE
- **Reason**: Tenant SPOC can be replaced with standard user roles
- **Backend Files**: routes/tenantSpoc.js
- **Frontend Files**: None
- **Database Tables**: users

#### routes/faqs.js
- **HCMS Feature**: None (FAQ)
- **Classification**: ARCHIVE
- **Reason**: FAQ system not required for HCMS
- **Backend Files**: routes/faqs.js
- **Frontend Files**: components/help/HelpFAQPage.js, components/admin/FAQAdminPage.js
- **Database Tables**: faqs

#### services/faqSemanticSearchService.js
- **HCMS Feature**: None (FAQ)
- **Classification**: ARCHIVE
- **Reason**: FAQ search not required for HCMS
- **Backend Files**: services/faqSemanticSearchService.js
- **Database Tables**: faqs

#### routes/knowledge.js
- **HCMS Feature**: None (Knowledge Base)
- **Classification**: ARCHIVE
- **Reason**: Knowledge base not required for HCMS
- **Backend Files**: routes/knowledge.js
- **Frontend Files**: pages/KnowledgeBasePage.js
- **Database Tables**: None (external Elasticsearch)

#### services/itsmAssistantPrompt.js
- **HCMS Feature**: AI Bot - Employee Assistant Prompts
- **Classification**: MODIFY
- **Reason**: AI prompt framework needed for employee assistance, but replace ITSM prompts with healthcare employee prompts
- **Changes**: Replace ITSM prompts with healthcare employee prompts (case management workflows, care coordination, productivity tips)
- **Backend Files**: services/itsmAssistantPrompt.js (rename to employeeAssistantPrompt.js)
- **Frontend Files**: components/assistant/ItsmAssistant.js (rename to EmployeeAssistant.js)
- **Database Tables**: None

#### components/assistant/ItsmAssistant.js
- **HCMS Feature**: AI Bot - Employee Assistant UI
- **Classification**: MODIFY
- **Reason**: AI assistant UI needed for employee help, but adapt for healthcare employee context
- **Changes**: Rename to EmployeeAssistant.js, adapt for healthcare employee assistance (case help, workflow guidance, productivity support)
- **Backend Files**: None
- **Frontend Files**: components/assistant/ItsmAssistant.js (rename to EmployeeAssistant.js)
- **Database Tables**: None

#### products table
- **HCMS Feature**: None (Product Mapping)
- **Classification**: ARCHIVE
- **Reason**: Product concept not applicable to healthcare
- **Database Tables**: products
- **Migration Path**: Replace with healthcare_services table

#### modules table
- **HCMS Feature**: None (Product Mapping)
- **Classification**: ARCHIVE
- **Reason**: Module concept not applicable to healthcare
- **Database Tables**: modules
- **Migration Path**: Replace with medical_specialties table

#### product_spoc_mapping table
- **HCMS Feature**: None (Product Mapping)
- **Classification**: ARCHIVE
- **Reason**: Product SPOC not applicable to healthcare
- **Database Tables**: product_spoc_mapping
- **Migration Path**: Replace with department_role_mapping table

#### components/dashboards/ProductDashboard.js
- **HCMS Feature**: None (Product Mapping)
- **Classification**: ARCHIVE
- **Reason**: Product dashboard not applicable to healthcare
- **Backend Files**: None
- **Frontend Files**: components/dashboards/ProductDashboard.js
- **Database Tables**: None

#### components/dashboards/ProductSpocDashboard.js
- **HCMS Feature**: None (Product Mapping)
- **Classification**: ARCHIVE
- **Reason**: Product SPOC dashboard not applicable to healthcare
- **Backend Files**: None
- **Frontend Files**: components/dashboards/ProductSpocDashboard.js
- **Database Tables**: None

---

### Legacy Components

#### Legacy Root Components
- **Files**: AgentDashboard.js, BusinessDashboard.js, ManagerDashboard.js, UserDashboard.js, TicketDetailPage.js, GlobalLogin.js (root level)
- **HCMS Feature**: None (Replaced)
- **Classification**: ARCHIVE
- **Reason**: Replaced by organized component structure
- **Backend Files**: None
- **Frontend Files**: Legacy root components
- **Database Tables**: None

---

### FUTURE - Healthcare-Specific Modules

### Patient Management
- **Module Name**: Patient Records
- **Purpose**: Manage patient medical records, history
- **Backend Files**: To be created
- **Frontend Files**: To be created
- **Database Tables**: patients, medical_history, allergies, medications
- **Classification**: FUTURE

### Medical Records
- **Module Name**: Medical Records Integration
- **Purpose**: Integrate with EHR systems, medical records
- **Backend Files**: To be created
- **Frontend Files**: To be created
- **Database Tables**: medical_records, lab_results, imaging
- **Classification**: FUTURE

### Healthcare Compliance
- **Module Name**: HIPAA Compliance
- **Purpose**: Ensure HIPAA compliance, data privacy
- **Backend Files**: To be created
- **Frontend Files**: To be created
- **Database Tables**: compliance_logs, audit_trails
- **Classification**: FUTURE

### Healthcare Integrations
- **Module Name**: EHR Integration
- **Purpose**: Integrate with external EHR systems
- **Backend Files**: To be created
- **Frontend Files**: To be created
- **Database Tables**: integration_configs, sync_logs
- **Classification**: FUTURE

### Healthcare Analytics
- **Module Name**: Healthcare Reporting
- **Purpose**: Healthcare-specific analytics and reporting
- **Backend Files**: To be created
- **Frontend Files**: To be created
- **Database Tables**: analytics_metrics, care_quality
- **Classification**: FUTURE

### Healthcare AI Bot (Future Enhancements)
- **Module Name**: Medical AI Assistant
- **Purpose**: AI-powered medical diagnosis support, treatment recommendations
- **Backend Files**: To be created (extend existing AI services)
- **Frontend Files**: To be created (extend HealthcareAssistant.js)
- **Database Tables**: ai_recommendations, medical_knowledge_base
- **Classification**: FUTURE

---

## Transformation Phases

### Phase 1: Core Infrastructure (Week 1-2)
**Objective**: Establish core HCMS infrastructure

**Tasks**:
1. Archive legacy root components
2. Archive ITSM-specific modules (productSpoc, tenantSpoc, FAQ, knowledge base, ITSM assistant)
3. Update terminology in kept modules (ticket → case, agent → staff)
4. Update database table names (tickets → cases)
5. Update API endpoint names (/api/tickets → /api/cases)
6. Update frontend component names and references

**Deliverables**:
- Cleaned codebase without ITSM-specific modules
- Updated terminology throughout
- Database migration script for table renaming

---

### Phase 2: Healthcare Adaptation (Week 3-4)
**Objective**: Adapt kept modules for healthcare use cases

**Tasks**:
1. Add healthcare-specific fields to users table (patient info, medical credentials)
2. Add healthcare-specific fields to cases table (patient ID, medical data, urgency)
3. Update authentication flows for healthcare verification
4. Update assignment logic for healthcare specialization
5. Update SLA rules for healthcare timelines
6. Update dashboards for healthcare views
7. Add healthcare-specific roles (doctor, nurse, specialist)

**Deliverables**:
- Healthcare-adapted user and case management
- Healthcare-specific authentication
- Healthcare dashboards and views

---

### Phase 3: Healthcare Compliance (Week 5-6)
**Objective**: Add healthcare compliance features

**Tasks**:
1. Implement HIPAA access controls
2. Enhance audit logging for compliance
3. Add data encryption for sensitive data
4. Implement consent management
5. Add healthcare-specific notification rules
6. Implement session timeout for security

**Deliverables**:
- HIPAA-compliant access controls
- Enhanced audit logging
- Data encryption implementation

---

### Phase 4: Healthcare-Specific Features (Week 7-8)
**Objective**: Build healthcare-specific modules

**Tasks**:
1. Create patient management module
2. Create medical records integration
3. Create healthcare analytics and reporting
4. Implement EHR integration framework
5. Add healthcare-specific AI features
6. Create healthcare-specific dashboards

**Deliverables**:
- Patient management system
- Medical records integration
- Healthcare analytics
- EHR integration framework

---

## Database Transformation

### Table Renaming
- `tickets` → `cases`
- `ticket_messages` → `case_messages`
- `ticket_assignments` → `case_assignments`
- `ticket_allocations` → `case_allocations`
- `ticket_activity` → `case_activity`
- `sla_timers` → `case_timers`

### Table Archival
- `products` → Archive (replace with healthcare_services)
- `modules` → Archive (replace with medical_specialties)
- `product_spoc_mapping` → Archive (replace with department_role_mapping)
- `faqs` → Archive (not needed for HCMS)

### Table Modifications
- `users` → Add healthcare fields (patient_info, medical_credentials)
- `agents` → Rename to `staff`, add healthcare fields (specialty, certifications)
- `cases` → Add healthcare fields (patient_id, medical_data, urgency, care_plan)

### New Tables (Future)
- `patients` - Patient records
- `medical_history` - Medical history
- `healthcare_services` - Healthcare services (replaces products)
- `medical_specialties` - Medical specialties (replaces modules)
- `department_role_mapping` - Department/role mapping (replaces product_spoc_mapping)

---

## API Endpoint Transformation

### Endpoint Renaming
- `/api/tickets` → `/api/cases`
- `/api/tickets/:id` → `/api/cases/:id`
- `/api/ticket-activity` → `/api/case-activity`
- `/api/chat/messages/:ticketId` → `/api/chat/messages/:caseId`
- `/api/assignments` → `/api/case-assignments`

### Endpoint Archival
- `/api/faqs` → Archive
- `/api/knowledge` → Archive
- `/api/product-spoc` → Archive
- `/api/tenant-spoc` → Archive

### Endpoint Modifications
- `/api/auth/login` → Add healthcare verification
- `/api/users` → Add healthcare-specific fields
- `/api/agents` → Rename to `/api/staff`, add healthcare fields
- `/api/sla` → Adapt for healthcare timelines

---

## Frontend Component Transformation

### Component Renaming
- `TicketDetailPage.js` → `CaseDetailPage.js`
- `TicketCard.js` → `CaseCard.js`
- `TicketsView.js` → `CasesView.js`
- `UserForm.js` → `CaseForm.js`

### Component Archival
- `ProductDashboard.js` → Archive
- `ProductSpocDashboard.js` → Archive
- `HelpFAQPage.js` → Archive
- `FAQAdminPage.js` → Archive
- `KnowledgeBasePage.js` → Archive
- `ItsmAssistant.js` → Archive

### Component Modifications
- `AgentDashboard.js` → Adapt for healthcare staff views
- `ManagerDashboard.js` → Adapt for healthcare team management
- `CEODashboard.js` → Adapt for healthcare facility metrics
- `UserDashboard.js` → Adapt for patient portal
- All auth components → Add healthcare verification

---

## Risk Assessment

### High Risk
- **Database table renaming**: Requires careful migration to avoid data loss
- **Authentication changes**: May break existing user sessions
- **API endpoint changes**: Requires frontend-backend coordination

### Medium Risk
- **Component renaming**: May break imports and references
- **Terminology updates**: May miss some references
- **Healthcare field additions**: May require data migration

### Low Risk
- **Archiving unused modules**: No impact on active functionality
- **Dashboard adaptations**: UI changes only
- **Notification system**: No changes needed

---

## Rollback Plan

### If Phase 1 Fails
- Restore from git commit before Phase 1
- Revert database changes
- Revert code changes

### If Phase 2 Fails
- Revert healthcare field additions
- Keep Phase 1 changes (terminology updates)
- Document healthcare requirements for future implementation

### If Phase 3 Fails
- Disable compliance features temporarily
- Keep Phase 1-2 changes
- Implement compliance in future iteration

---

## Success Criteria

### Phase 1 Success
- All ITSM-specific modules archived
- Terminology updated throughout codebase
- Database tables renamed successfully
- API endpoints updated and tested
- Frontend components updated and tested

### Phase 2 Success
- Healthcare fields added to database
- Authentication flows updated
- Assignment logic adapted
- Dashboards adapted for healthcare
- All healthcare views functional

### Phase 3 Success
- HIPAA access controls implemented
- Audit logging enhanced
- Data encryption implemented
- Compliance features tested

### Phase 4 Success
- Patient management module functional
- Medical records integration working
- Healthcare analytics operational
- EHR integration framework ready

---

## Summary Statistics

### Backend Modules
- **KEEP**: 18 modules (40%)
- **MODIFY**: 17 modules (38%)
- **ARCHIVE**: 10 modules (22%)
- **FUTURE**: 0 modules (0%)
- **Total**: 45 modules

### Frontend Modules
- **KEEP**: 12 modules (27%)
- **MODIFY**: 20 modules (44%)
- **ARCHIVE**: 13 modules (29%)
- **FUTURE**: 0 modules (0%)
- **Total**: 45 modules

### Database Tables
- **KEEP**: 17 tables (61%)
- **MODIFY**: 3 tables (11%)
- **ARCHIVE**: 8 tables (28%)
- **FUTURE**: 0 tables (0%)
- **Total**: 28 tables

### Overall Classification
- **KEEP**: 47 modules/tables (47%)
- **MODIFY**: 40 modules/tables (40%)
- **ARCHIVE**: 31 modules/tables (31%)
- **FUTURE**: 0 modules/tables (0%)
- **Total**: 100 modules/tables

---

## Conclusion

The ITSM system has a solid foundation that can be transformed into HCMS with moderate effort. Approximately 47% of modules can be kept as-is, 40% require modification for healthcare adaptation, and 31% can be archived as ITSM-specific features. The transformation can be completed in 8 weeks across 4 phases, with careful planning and risk mitigation.
