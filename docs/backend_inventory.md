# Backend Inventory

## Overview
The backend is a Node.js/Express application serving as the API for the HCMS Case Management system. It uses MySQL for data storage, implements multi-tenancy, and provides comprehensive ticket management, communication, and workflow features.

## Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (mysql2)
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Multer
- **Email**: Nodemailer
- **WebSocket**: Socket.io, ws
- **AI Integration**: OpenAI, NVIDIA AI
- **OCR**: Tesseract.js
- **Document Processing**: mammoth, pdf-parse, xlsx

---

## Routes

### Main Routes Directory (`backend/routes/`)

#### `agents.js` (1435 lines)
- **Purpose**: Agent management endpoints including CRUD operations, metrics tracking, and authentication
- **Dependencies**: express, express-validator, mysql2, bcryptjs, jsonwebtoken, emailService, agentLevelSync
- **Related Modules**: middleware/auth, middleware/tenant, services/emailService
- **Key Endpoints**: GET/POST/PUT/DELETE agents, agent metrics, password management

#### `auth.js` (1408 lines)
- **Purpose**: Authentication and authorization endpoints for all user types
- **Dependencies**: express, express-validator, mysql2, jsonwebtoken, bcryptjs, emailService, accountLifecycleService
- **Related Modules**: middleware/auth, services/emailService, services/accountLifecycleService
- **Key Endpoints**: Login, registration, password reset, email verification, business dashboard auth

#### `tickets.js` (7469 lines)
- **Purpose**: Core ticket management - creation, updates, status changes, assignments, SLA integration
- **Dependencies**: express, express-validator, mysql2, axios, multer, TextFormatter, TicketAssignmentService, emailService, ticketActivityService, ticketEventNotificationService, aiAgentAllocationService, priorityService, ticketService
- **Related Modules**: middleware/upload, middleware/tenant, middleware/auth, services/*, utils/*
- **Key Endpoints**: CRUD tickets, status updates, assignments, SLA management, attachments, AI features

#### `ai.js` (9407 lines)
- **Purpose**: AI-powered features including health checks, NVIDIA integration, and future AI capabilities
- **Dependencies**: express, nvidiaAiService
- **Related Modules**: services/nvidiaAiService
- **Key Endpoints**: AI health, NVIDIA integration endpoints

#### `departments.js` (2851 lines)
- **Purpose**: Department management for organizational structure
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: CRUD departments

#### `faqs.js` (22863 lines)
- **Purpose**: FAQ management and semantic search functionality
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: CRUD FAQs, semantic search

#### `feedback.js` (11722 lines)
- **Purpose**: Feedback collection and management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Submit feedback, feedback insights

#### `knowledge.js` (9019 lines)
- **Purpose**: Knowledge base management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: CRUD knowledge articles, search

#### `notifications.js` (9272 lines)
- **Purpose**: Notification management and delivery
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Notification CRUD, mark as read

#### `productSpoc.js` (11212 lines)
- **Purpose**: Product SPOC (Single Point of Contact) management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Product SPOC CRUD, assignment

#### `settings.js` (1654 lines)
- **Purpose**: System settings management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Settings CRUD

#### `support.js` (5108 lines)
- **Purpose**: Support integration endpoints
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Support-related operations

#### `tenantSpoc.js` (14177 lines)
- **Purpose**: Tenant SPOC management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Tenant SPOC CRUD

#### `tenants.js` (18010 lines)
- **Purpose**: Multi-tenant management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Tenant CRUD, tenant configuration

#### `ticketLinks.js` (18989 lines)
- **Purpose**: Linked ticket workflow for internal ticket relationships
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Link tickets, unlink tickets, view linked tickets

### Communication Routes (`backend/routes/communication/`)

#### `chat.js` (34249 lines)
- **Purpose**: Real-time chat messaging for tickets
- **Dependencies**: express, mysql2, websocket-instance
- **Related Modules**: middleware/tenant, middleware/auth, services/ticketMessagesService
- **Key Endpoints**: Send messages, get chat history, typing indicators, read receipts

#### `replies.js` (15973 lines)
- **Purpose**: Ticket reply management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth, services/ticketActivityService
- **Key Endpoints**: Add replies, get replies, reply templates

#### `whatsapp.js` (35988 lines)
- **Purpose**: WhatsApp integration for customer communication
- **Dependencies**: express, axios, mysql2
- **Related Modules**: middleware/whatsapp-validation, utils/whatsapp-notifications
- **Key Endpoints**: WhatsApp webhooks, send messages, status updates

#### `whatsapp-mock.js` (2260 lines)
- **Purpose**: Mock WhatsApp endpoints for testing
- **Dependencies**: express
- **Related Modules**: None
- **Key Endpoints**: Mock WhatsApp operations

### Core Routes (`backend/routes/core/`)

#### `agents.js` (16012 lines)
- **Purpose**: Core agent management endpoints
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Agent CRUD, agent operations

#### `auth.js` (57824 lines)
- **Purpose**: Core authentication endpoints
- **Dependencies**: express, mysql2, jsonwebtoken, bcryptjs
- **Related Modules**: middleware/auth, services/emailService
- **Key Endpoints**: Login, logout, token refresh, user authentication

#### `staff.js` (5349 lines)
- **Purpose**: Staff management endpoints
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Staff CRUD, staff operations

#### `users.js` (19076 lines)
- **Purpose**: User management endpoints
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: User CRUD, user operations

### Management Routes (`backend/routes/management/`)

#### `assignments.js` (22515 lines)
- **Purpose**: Ticket assignment management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth, utils/ticketAssignment
- **Key Endpoints**: Manual assignments, assignment rules, reassignment

#### `mailReview.js` (17442 lines)
- **Purpose**: Email review queue management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Review emails, approve/reject, email processing

#### `sla.js` (48605 lines)
- **Purpose**: SLA (Service Level Agreement) management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth, services/slaResolutionService
- **Key Endpoints**: SLA CRUD, SLA timers, SLA monitoring, escalation rules

#### `support.js` (5734 lines)
- **Purpose**: Support workflow management
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Support operations, workflow management

#### `ticketTasks.js` (51346 lines)
- **Purpose**: Multi-task workflow for tickets
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Task CRUD, task dependencies, task completion

#### `tickets.js` (42259 lines)
- **Purpose**: Management-level ticket operations
- **Dependencies**: express, mysql2
- **Related Modules**: middleware/tenant, middleware/auth
- **Key Endpoints**: Bulk operations, ticket analytics, management views

---

## Services

### `accountLifecycleService.js` (4750 bytes)
- **Purpose**: User account lifecycle management (verification, activation, deactivation)
- **Dependencies**: mysql2, jsonwebtoken
- **Related Modules**: database, middleware/auth
- **Key Functions**: Issue verification tokens, verify accounts, manage account status

### `aiAgentAllocationService.js` (34592 bytes)
- **Purpose**: AI-powered ticket allocation to agents
- **Dependencies**: mysql2, nvidiaAiService
- **Related Modules**: database, services/nvidiaAiService
- **Key Functions**: Auto-allocate tickets, AI-based assignment, allocation queue

### `aiAttachmentAnalysisService.js` (3045 bytes)
- **Purpose**: AI analysis of ticket attachments
- **Dependencies**: None specified
- **Related Modules**: services/attachmentTextExtractor
- **Key Functions**: Analyze attachment content, extract insights

### `aiExtractionService.js` (9273 bytes)
- **Purpose**: AI-powered data extraction from tickets
- **Dependencies**: openai, nvidiaAiService
- **Related Modules**: services/nvidiaAiService
- **Key Functions**: Extract entities, classify tickets, suggest categories

### `aiFeedbackAnalysisService.js` (1846 bytes)
- **Purpose**: AI analysis of customer feedback
- **Dependencies**: None specified
- **Related Modules**: None
- **Key Functions**: Analyze feedback sentiment, categorize feedback

### `aiTemplateSuggestionService.js` (5794 bytes)
- **Purpose**: AI-powered reply template suggestions
- **Dependencies**: openai, nvidiaAiService
- **Related Modules**: services/nvidiaAiService
- **Key Functions**: Suggest reply templates, template matching

### `appNotificationService.js` (29790 bytes)
- **Purpose**: In-app notification management
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Create notifications, mark as read, notification delivery

### `attachmentTextExtractor.js` (6150 bytes)
- **Purpose**: Extract text from various file formats (PDF, DOCX, images)
- **Dependencies**: mammoth, pdf-parse, tesseract.js, xlsx
- **Related Modules**: None
- **Key Functions**: Extract text from attachments, OCR processing

### `emailService.js` (134961 bytes)
- **Purpose**: Email sending and management
- **Dependencies**: nodemailer, imapflow, mailparser
- **Related Modules**: database
- **Key Functions**: Send emails, process incoming emails, email templates, SMTP configuration

### `faqSemanticSearchService.js` (10368 bytes)
- **Purpose**: Semantic search for FAQs
- **Dependencies**: elasticsearch
- **Related Modules**: database
- **Key Functions**: Index FAQs, semantic search, relevance scoring

### `feedbackTokenService.js` (2072 bytes)
- **Purpose**: Generate and validate feedback tokens
- **Dependencies**: jsonwebtoken
- **Related Modules**: None
- **Key Functions**: Create feedback tokens, validate tokens

### `incomingEmailService.js` (26678 bytes)
- **Purpose**: Process incoming emails and convert to ticket messages
- **Dependencies**: imapflow, mailparser
- **Related Modules**: database, services/emailService
- **Key Functions**: Poll inbox, parse emails, store as ticket messages

### `itsmAssistantPrompt.js` (1936 bytes)
- **Purpose**: ITSM assistant AI prompts
- **Dependencies**: None
- **Related Modules**: None
- **Key Functions**: AI prompt templates for ITSM assistant

### `nvidiaAiService.js` (6399 bytes)
- **Purpose**: NVIDIA AI integration
- **Dependencies**: openai
- **Related Modules**: None
- **Key Functions**: NVIDIA AI client, AI model interactions

### `organizationService.js` (3359 bytes)
- **Purpose**: Organization management
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Organization CRUD, organization hierarchy

### `priorityService.js` (11570 bytes)
- **Purpose**: Ticket priority calculation and management
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Calculate priority, priority rules, priority updates

### `slaResolutionService.js` (13094 bytes)
- **Purpose**: SLA resolution time management
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Resolve SLA for tickets, apply SLA rules, SLA monitoring

### `systemSettingsService.js` (2350 bytes)
- **Purpose**: System settings management
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Get settings, update settings, boolean settings

### `ticketActivityService.js` (1635 bytes)
- **Purpose**: Ticket activity logging
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Log ticket activities, activity timeline

### `ticketEventNotificationService.js` (63273 bytes)
- **Purpose**: Central notification orchestration for ticket events
- **Dependencies**: mysql2
- **Related Modules**: database, services/emailService, services/ticketActivityService, services/ticketMessagesService, utils/whatsapp-notifications
- **Key Functions**: Orchestrate notifications for ticket events, deduplication, multi-channel notifications

### `ticketMessagesService.js` (9214 bytes)
- **Purpose**: Ticket message management
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: CRUD ticket messages, message history

### `ticketService.js` (6301 bytes)
- **Purpose**: Core ticket business logic
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Ticket operations, ticket validation

---

## Middleware

### `auth.js` (11522 bytes)
- **Purpose**: Authentication and authorization middleware
- **Dependencies**: jsonwebtoken, bcryptjs, mysql2
- **Related Modules**: database
- **Key Functions**: authenticateToken, authorizeRole, generateToken, hashPassword, comparePassword, permission matrix

### `branchFilter.js` (4188 bytes)
- **Purpose**: Branch/department filtering for multi-branch organizations
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Filter by branch, validate branch access

### `tenant.js` (11395 bytes)
- **Purpose**: Multi-tenant context management
- **Dependencies**: jsonwebtoken, mysql2
- **Related Modules**: database
- **Key Functions**: setTenantContext, verifyTenantAccess, extractTenant from subdomain/header/user

### `textFormatting.js` (3533 bytes)
- **Purpose**: Text formatting and sanitization
- **Dependencies**: None
- **Related Modules**: utils/textFormatter
- **Key Functions**: Format text, sanitize input, text normalization

### `upload.js` (2944 bytes)
- **Purpose**: File upload handling with Multer
- **Dependencies**: multer
- **Related Modules**: None
- **Key Functions**: Configure multer, handle file uploads, error handling

### `whatsapp-validation.js` (4468 bytes)
- **Purpose**: WhatsApp webhook validation
- **Dependencies**: None
- **Related Modules**: None
- **Key Functions**: Validate WhatsApp webhooks, signature verification

---

## Utilities

### `agentLevelSync.js` (1308 bytes)
- **Purpose**: Sync agent levels to NULL for executives
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Sync executive agent levels, level management

### `emailCleaner.js` (2652 bytes)
- **Purpose**: Email content cleaning and processing
- **Dependencies**: None
- **Related Modules**: None
- **Key Functions**: Clean email content, remove quoted text, signature removal

### `tenantQueries.js` (7305 bytes)
- **Purpose**: Tenant-specific database queries
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Tenant queries, tenant data retrieval

### `textFormatter.js` (7526 bytes)
- **Purpose**: Text formatting utilities
- **Dependencies**: None
- **Related Modules**: None
- **Key Functions**: Format text, handle special characters, text transformations

### `ticketAssignment.js` (31406 bytes)
- **Purpose**: Ticket assignment logic and algorithms
- **Dependencies**: mysql2
- **Related Modules**: database, services/emailService, utils/agentLevelSync
- **Key Functions**: Auto-assign tickets, load balancing, skill-based assignment, level-based assignment

### `whatsapp-notifications.js` (12432 bytes)
- **Purpose**: WhatsApp notification sending
- **Dependencies**: axios
- **Related Modules**: None
- **Key Functions**: Send WhatsApp messages, format messages, handle WhatsApp API

---

## Models

**Note**: The backend uses a traditional MySQL schema without explicit ORM models. Database schema is defined in `database.js` and migration files.

### Database Schema (`database.js` - 1282 lines)
- **Purpose**: Database connection pooling and table initialization
- **Dependencies**: mysql2
- **Related Modules**: None
- **Key Tables**: tickets, agents, users, tenants, departments, products, sla_configs, ticket_messages, notifications, feedback, faqs, knowledge_base

### Migration Files (`backend/migrations/`)
- **Purpose**: Database schema migrations
- **Dependencies**: mysql2
- **Related Modules**: database
- **Key Functions**: Schema updates, column additions, index creation

---

## Controllers

**Note**: The backend uses a traditional route-handler pattern without explicit controller files. Business logic is distributed between routes and services.

### Modular Controllers (`backend/src/modules/`)

#### `auth/` Module
- **auth.controller.js** (6118 bytes): Authentication controller
- **auth.middleware.js** (2114 bytes): Authentication middleware
- **auth.routes.js** (3722 bytes): Authentication routes
- **auth.service.js** (14671 bytes): Authentication service
- **Dependencies**: express, jsonwebtoken, bcryptjs, mysql2
- **Related Modules**: database, middleware/auth

#### `tickets/` Module
- **ticket.controller.js** (2852 bytes): Ticket controller
- **ticket.routes.js** (2104 bytes): Ticket routes
- **ticket.service.js** (6615 bytes): Ticket service
- **Dependencies**: express, mysql2
- **Related Modules**: database, services/*

---

## Key Backend Files

### `server.js` (623 lines)
- **Purpose**: Main Express server entry point
- **Dependencies**: express, cors, helmet, rate-limit, http, websocket-server
- **Related Modules**: All routes, middleware, services
- **Key Functions**: Server initialization, route mounting, WebSocket setup, scheduled tasks

### `database.js` (1282 lines)
- **Purpose**: Database connection and schema management
- **Dependencies**: mysql2
- **Related Modules**: None
- **Key Functions**: Connection pooling, table creation, performance instrumentation

### `websocket-server.js` (23266 bytes)
- **Purpose**: WebSocket server for real-time communication
- **Dependencies**: ws
- **Related Modules**: websocket-instance
- **Key Functions**: WebSocket connection handling, message broadcasting, room management

### `scheduled-escalation.js` (17539 bytes)
- **Purpose**: Scheduled ticket escalation workflow
- **Dependencies**: mysql2
- **Related Modules**: database, services/*
- **Key Functions**: Auto-escalation based on SLA, escalation rules

### `scheduled-inactivity.js` (6076 bytes)
- **Purpose**: Scheduled inactivity workflow (reminders and auto-close)
- **Dependencies**: mysql2
- **Related Modules**: database, services/emailService
- **Key Functions**: Inactivity reminders, auto-close inactive tickets

---

## Shared Modules (`backend/src/shared/`)

### `config/`
- **database.js** (2118 bytes): Database configuration
- **whatsapp.js** (754 bytes): WhatsApp configuration

### `middleware/`
- **errorHandler.js** (1504 bytes): Global error handling

### `utils/`
- **constants.js** (1460 bytes): Application constants
- **logger.js** (1082 bytes): Logging utilities

---

## Summary

The backend follows a modular architecture with:
- **29 route files** organized by domain (main, communication, core, management)
- **22 service files** for business logic
- **6 middleware files** for cross-cutting concerns
- **6 utility files** for helper functions
- **2 modular controller sets** (auth, tickets) in src/modules/
- **MySQL-based** data layer without ORM
- **Multi-tenant** architecture with tenant context middleware
- **WebSocket** support for real-time features
- **AI integration** via OpenAI and NVIDIA services
- **Comprehensive** ticket lifecycle management with SLA support
