# HCMS Project Structure

## Overview
HCMS (Healthcare Case Management System) is a full-stack ITSM/Case Management application built with a Node.js/Express backend and React frontend. The system supports multi-tenancy, real-time communication, AI-powered features, and comprehensive workflow management.

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (mysql2)
- **Authentication**: JWT (jsonwebtoken)
- **Real-time**: Socket.io, WebSocket (ws)
- **Email**: Nodemailer, Imapflow
- **AI Integration**: OpenAI, NVIDIA AI
- **Document Processing**: Tesseract.js, mammoth, pdf-parse, xlsx
- **File Upload**: Multer
- **Security**: Helmet, express-rate-limit

### Frontend
- **Framework**: React 19.1.0
- **Routing**: React Router DOM 7.6.3
- **UI Library**: Material-UI (MUI) 7.2.0
- **HTTP Client**: Axios 1.10.0
- **Icons**: Material Icons, react-country-flag
- **Form Handling**: react-select, react-phone-input-2
- **Date Handling**: MUI X Date Pickers
- **Styling**: CSS modules, inline styles

---

## Directory Structure

```
HCMS/
├── backend/                          # Node.js/Express backend
│   ├── routes/                       # API route definitions
│   │   ├── communication/            # Communication-related routes
│   │   │   ├── chat.js              # Real-time chat endpoints
│   │   │   ├── replies.js           # Ticket reply management
│   │   │   ├── whatsapp.js          # WhatsApp integration
│   │   │   └── whatsapp-mock.js     # Mock WhatsApp for testing
│   │   ├── core/                     # Core system routes
│   │   │   ├── agents.js            # Agent management
│   │   │   ├── auth.js              # Authentication
│   │   │   ├── staff.js             # Staff management
│   │   │   └── users.js             # User management
│   │   ├── management/              # Management-level routes
│   │   │   ├── assignments.js       # Ticket assignments
│   │   │   ├── mailReview.js        # Email review queue
│   │   │   ├── sla.js               # SLA management
│   │   │   ├── support.js           # Support workflows
│   │   │   ├── ticketTasks.js       # Multi-task workflows
│   │   │   └── tickets.js           # Management ticket operations
│   │   ├── agents.js                 # Agent management endpoints
│   │   ├── ai.js                     # AI integration endpoints
│   │   ├── auth.js                   # Authentication endpoints
│   │   ├── departments.js            # Department management
│   │   ├── faqs.js                   # FAQ management
│   │   ├── feedback.js               # Feedback management
│   │   ├── knowledge.js              # Knowledge base
│   │   ├── notifications.js          # Notification management
│   │   ├── productSpoc.js           # Product SPOC management
│   │   ├── settings.js               # System settings
│   │   ├── support.js                # Support integration
│   │   ├── tenantSpoc.js             # Tenant SPOC management
│   │   ├── tenants.js                # Multi-tenant management
│   │   ├── ticketLinks.js            # Linked ticket workflow
│   │   └── tickets.js                # Core ticket management
│   ├── services/                     # Business logic layer
│   │   ├── accountLifecycleService.js    # Account lifecycle
│   │   ├── aiAgentAllocationService.js   # AI ticket allocation
│   │   ├── aiAttachmentAnalysisService.js # AI attachment analysis
│   │   ├── aiExtractionService.js        # AI data extraction
│   │   ├── aiFeedbackAnalysisService.js # AI feedback analysis
│   │   ├── aiTemplateSuggestionService.js # AI reply suggestions
│   │   ├── appNotificationService.js     # In-app notifications
│   │   ├── attachmentTextExtractor.js     # Text extraction from files
│   │   ├── emailService.js               # Email sending/processing
│   │   ├── faqSemanticSearchService.js   # FAQ semantic search
│   │   ├── feedbackTokenService.js       # Feedback token management
│   │   ├── incomingEmailService.js       # Incoming email processing
│   │   ├── itsmAssistantPrompt.js        # ITSM AI prompts
│   │   ├── nvidiaAiService.js            # NVIDIA AI integration
│   │   ├── organizationService.js       # Organization management
│   │   ├── priorityService.js            # Priority calculation
│   │   ├── slaResolutionService.js       # SLA resolution management
│   │   ├── systemSettingsService.js      # System settings
│   │   ├── ticketActivityService.js      # Ticket activity logging
│   │   ├── ticketEventNotificationService.js # Notification orchestration
│   │   ├── ticketMessagesService.js      # Ticket message management
│   │   └── ticketService.js              # Core ticket logic
│   ├── middleware/                   # Express middleware
│   │   ├── auth.js                  # Authentication/authorization
│   │   ├── branchFilter.js          # Branch filtering
│   │   ├── tenant.js                # Multi-tenant context
│   │   ├── textFormatting.js        # Text formatting
│   │   ├── upload.js                # File upload handling
│   │   └── whatsapp-validation.js   # WhatsApp webhook validation
│   ├── utils/                        # Utility functions
│   │   ├── agentLevelSync.js        # Agent level synchronization
│   │   ├── emailCleaner.js          # Email content cleaning
│   │   ├── tenantQueries.js         # Tenant-specific queries
│   │   ├── textFormatter.js         # Text formatting utilities
│   │   ├── ticketAssignment.js      # Ticket assignment logic
│   │   └── whatsapp-notifications.js # WhatsApp notification sending
│   ├── src/                          # Modular architecture
│   │   ├── modules/                 # Feature modules
│   │   │   ├── auth/                # Authentication module
│   │   │   │   ├── auth.controller.js
│   │   │   │   ├── auth.middleware.js
│   │   │   │   ├── auth.routes.js
│   │   │   │   └── auth.service.js
│   │   │   ├── tickets/             # Tickets module
│   │   │   │   ├── ticket.controller.js
│   │   │   │   ├── ticket.routes.js
│   │   │   │   └── ticket.service.js
│   │   │   ├── agents/              # Agents module (empty)
│   │   │   ├── notifications/        # Notifications module (empty)
│   │   │   ├── sla/                 # SLA module (empty)
│   │   │   ├── uploads/             # Uploads module (empty)
│   │   │   └── users/               # Users module (empty)
│   │   ├── shared/                  # Shared utilities
│   │   │   ├── config/              # Configuration
│   │   │   │   ├── database.js
│   │   │   │   └── whatsapp.js
│   │   │   ├── middleware/          # Shared middleware
│   │   │   │   └── errorHandler.js
│   │   │   └── utils/               # Shared utilities
│   │   │       ├── constants.js
│   │   │       └── logger.js
│   │   ├── app.js                    # Express app configuration
│   │   └── server.js                 # Server entry point
│   ├── migrations/                   # Database migrations
│   ├── templates/                   # Email templates
│   ├── uploads/                      # File upload storage
│   ├── docs/                         # Backend documentation
│   ├── scripts/                      # Utility scripts
│   ├── scratch/                       # Development scratch files
│   ├── tests/                        # Test files
│   ├── database.js                   # Database connection & schema
│   ├── server.js                     # Main server entry point
│   ├── websocket-server.js           # WebSocket server
│   ├── websocket-instance.js          # WebSocket instance store
│   ├── scheduled-escalation.js       # Scheduled escalation workflow
│   ├── scheduled-inactivity.js        # Scheduled inactivity workflow
│   ├── package.json                  # Backend dependencies
│   ├── config.env                     # Environment configuration
│   └── Dockerfile                     # Docker configuration
│
├── frontend/                         # React frontend
│   ├── src/                          # Source code
│   │   ├── components/               # React components
│   │   │   ├── admin/               # Admin components
│   │   │   │   ├── AdminChatOverview.js
│   │   │   │   ├── AdminRoute.js
│   │   │   │   ├── FAQAdminPage.js
│   │   │   │   └── TicketAssignmentStats.js
│   │   │   ├── auth/                # Authentication components
│   │   │   │   ├── AgentLogin.js
│   │   │   │   ├── CustomerAccessPage.js
│   │   │   │   ├── ForgotPassword.js
│   │   │   │   ├── GlobalLogin.js
│   │   │   │   ├── Login.js
│   │   │   │   ├── LoginPage.js
│   │   │   │   ├── ResetPassword.js
│   │   │   │   ├── StaffLogin.js
│   │   │   │   ├── StaffSetPassword.js
│   │   │   │   ├── UserLogin.js
│   │   │   │   └── *.css (styling files)
│   │   │   ├── chat/                # Chat components
│   │   │   │   ├── CustomerChatPage.js
│   │   │   │   ├── CustomerTicketChat.js
│   │   │   │   ├── RealTimeChat.js
│   │   │   │   ├── SupportTicketChatTabs.js
│   │   │   │   └── TicketChat.js
│   │   │   ├── common/              # Common/shared components
│   │   │   │   ├── AuthEntryGate.js
│   │   │   │   ├── AutoLoginTest.js
│   │   │   │   ├── BusinessDashboardAuth.js
│   │   │   │   ├── HeaderNotificationBell.js
│   │   │   │   ├── SimpleTableTest.js
│   │   │   │   ├── SupportEntry.js
│   │   │   │   └── TicketViewDemo.js
│   │   │   ├── dashboards/          # Dashboard components
│   │   │   │   ├── AgentDashboard.js
│   │   │   │   ├── BusinessDashboard.js
│   │   │   │   ├── CEODashboard.js
│   │   │   │   ├── MailInbox.js
│   │   │   │   ├── MailReviewQueue.js
│   │   │   │   ├── ManagerDashboard.js
│   │   │   │   ├── ManagerEscalationRequests.js
│   │   │   │   ├── OrgSpocDashboard.js
│   │   │   │   ├── ProductDashboard.js
│   │   │   │   ├── ProductSpocDashboard.js
│   │   │   │   ├── UserDashboard.js
│   │   │   │   ├── AgdashNavIcon.js
│   │   │   │   ├── MdashKpiIcon.js
│   │   │   │   ├── *.css (styling files)
│   │   │   │   └── image.png
│   │   │   ├── feedback/            # Feedback components
│   │   │   │   ├── FeedbackFormPage.js
│   │   │   │   └── FeedbackInsightsPage.js
│   │   │   ├── help/                # Help components
│   │   │   │   └── HelpFAQPage.js
│   │   │   ├── notifications/       # Notification components
│   │   │   │   ├── NotificationBell.js
│   │   │   │   └── NotificationDropdown.js
│   │   │   ├── sla/                 # SLA components
│   │   │   │   ├── SLADashboard.js
│   │   │   │   ├── SLAManagement.js
│   │   │   │   └── SLATimer.js
│   │   │   ├── tickets/             # Ticket components
│   │   │   │   ├── GroupTicketPage.js
│   │   │   │   ├── LinkedTicketReviewPage.js
│   │   │   │   ├── ProductTickets.js
│   │   │   │   ├── TicketCard.js
│   │   │   │   ├── TicketDetailPage.js
│   │   │   │   ├── TicketTableView.js
│   │   │   │   ├── TicketTemplate.js
│   │   │   │   ├── TicketsView.js
│   │   │   │   └── UserForm.js
│   │   │   ├── assistant/           # AI assistant components
│   │   │   │   └── ItsmAssistant.js
│   │   │   ├── AgentDashboard.js    # Legacy agent dashboard
│   │   │   ├── BusinessDashboard.js # Legacy business dashboard
│   │   │   ├── GlobalLogin.js       # Legacy global login
│   │   │   ├── ManagerDashboard.js  # Legacy manager dashboard
│   │   │   ├── TicketDetailPage.js  # Legacy ticket detail
│   │   │   └── UserDashboard.js    # Legacy user dashboard
│   │   ├── pages/                   # Page components
│   │   │   └── KnowledgeBasePage.js
│   │   ├── context/                 # React context
│   │   │   └── NotificationContext.js
│   │   ├── utils/                   # Utility functions
│   │   │   ├── api.js               # API utilities
│   │   │   ├── customerAccessResolver.js
│   │   │   ├── dateTime.js          # Date/time formatting
│   │   │   └── formatRelativeTime.js
│   │   ├── App.js                   # Main app component
│   │   ├── App.css                  # Global styles
│   │   ├── index.js                 # Entry point
│   │   ├── index.css                # Base styles
│   │   └── logo.svg                 # App logo
│   ├── public/                      # Static assets
│   ├── package.json                 # Frontend dependencies
│   ├── .env                         # Environment variables
│   ├── .env.production              # Production environment
│   ├── Dockerfile                   # Docker configuration
│   └── nginx.conf                   # Nginx configuration
│
├── archive/                         # Archived ITSM functionality
│   ├── backend/                     # Archived backend components
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── models/
│   │   ├── middlewares/
│   │   ├── utils/
│   │   └── modules/
│   ├── frontend/                    # Archived frontend components
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── modules/
│   ├── database/
│   ├── notes/
│   └── docs/
│
├── docs/                            # Project documentation
│   ├── backend_inventory.md         # Backend component inventory
│   ├── frontend_inventory.md        # Frontend component inventory
│   └── project_structure.md         # This file
│
├── README.md                        # Project README
├── package.json                     # Root package.json
├── docker-compose.vps.yml           # Docker compose for VPS
├── config.env                       # Root environment config
└── *.sql, *.js, *.ps1, *.bat        # Various utility files
```

---

## Architecture Overview

### Backend Architecture

#### Layer Structure
1. **Routes Layer** (`backend/routes/`)
   - HTTP endpoint definitions
   - Request validation
   - Response formatting
   - Route organization by domain

2. **Services Layer** (`backend/services/`)
   - Business logic implementation
   - External service integration
   - Data processing
   - Workflow orchestration

3. **Middleware Layer** (`backend/middleware/`)
   - Authentication & authorization
   - Multi-tenant context
   - Request processing
   - Error handling

4. **Utility Layer** (`backend/utils/`)
   - Helper functions
   - Common algorithms
   - Shared logic

5. **Data Layer** (`backend/database.js`)
   - Database connection pooling
   - Schema management
   - Query execution

#### Modular Architecture
- **Traditional Pattern**: Route handlers with inline logic
- **Emerging Pattern**: Modular controllers in `src/modules/`
- **Shared Components**: Common utilities in `src/shared/`

### Frontend Architecture

#### Component Organization
1. **Page-Level Components** (`src/pages/`)
   - Full-page views
   - Route-level components

2. **Feature Components** (`src/components/`)
   - Organized by domain (admin, auth, chat, dashboards, etc.)
   - Reusable UI components
   - Feature-specific implementations

3. **Shared Components** (`src/components/common/`)
   - Cross-feature utilities
   - Authentication wrappers
   - Common UI elements

4. **Context Layer** (`src/context/`)
   - Global state management
   - Notification context

5. **Utility Layer** (`src/utils/`)
   - API utilities
   - Date/time formatting
   - Helper functions

#### Routing Structure
- **Public Routes**: Login, customer access, business dashboard
- **Customer Routes**: User dashboard, chat, feedback
- **Staff Routes**: Agent/Manager/CEO dashboards, ticket management
- **Universal Support Route**: `/:product` for auto-login

---

## Key Integrations

### Multi-Tenancy
- **Backend**: Tenant context middleware (`middleware/tenant.js`)
- **Extraction Methods**: Subdomain, X-Tenant-ID header, user tenant
- **Database**: Tenant-scoped queries
- **Frontend**: Tenant ID in API headers

### Authentication
- **Backend**: JWT-based authentication (`middleware/auth.js`)
- **Frontend**: Dual auth system (staff/customer)
- **Storage**: Session storage for staff, local storage for customers
- **Global 401 Handler**: Automatic logout on token expiration

### Real-Time Communication
- **WebSocket Server**: Custom WebSocket implementation (`websocket-server.js`)
- **Chat System**: Real-time messaging for tickets
- **Notifications**: Real-time notification delivery
- **Typing Indicators**: Live typing status

### AI Integration
- **OpenAI**: General AI features
- **NVIDIA AI**: Specialized AI services
- **Features**: 
  - Ticket allocation
  - Reply suggestions
  - Attachment analysis
  - Feedback analysis
  - Data extraction

### Communication Channels
- **Email**: Nodemailer for sending, Imapflow for receiving
- **WhatsApp**: Meta WhatsApp API integration
- **In-App Chat**: WebSocket-based real-time chat
- **Notifications**: Multi-channel notification delivery

### SLA Management
- **SLA Resolution Service**: SLA calculation and enforcement
- **Scheduled Escalation**: Auto-escalation based on SLA
- **SLA Timers**: Real-time SLA countdown
- **SLA Dashboard**: SLA monitoring and reporting

---

## Data Flow

### Ticket Creation Flow
1. Customer creates ticket via frontend
2. Frontend sends POST to `/api/tickets`
3. Backend validates request (auth, tenant, validation)
4. TicketService processes business logic
5. Database stores ticket
6. AI allocation service assigns to agent
7. Notification service sends notifications
8. WebSocket updates connected clients

### Chat Message Flow
1. User sends message via frontend chat component
2. Frontend sends POST to `/api/chat/messages`
3. Backend validates and stores message
4. WebSocket broadcasts to relevant users
5. Notification service triggers if needed
6. Frontend updates chat UI in real-time

### Authentication Flow
1. User submits login form
2. Frontend sends POST to `/api/auth/login`
3. Backend validates credentials
4. Backend generates JWT token
5. Frontend stores token (session/local storage)
6. Frontend includes token in subsequent requests
7. Backend validates token on protected routes

---

## Scheduled Tasks

### Backend Scheduled Workflows
1. **Scheduled Escalation** (`scheduled-escalation.js`)
   - Monitors SLA compliance
   - Auto-escalates overdue tickets
   - Sends escalation notifications

2. **Scheduled Inactivity** (`scheduled-inactivity.js`)
   - Monitors ticket inactivity
   - Sends reminder notifications (12h, 24h, 36h)
   - Auto-closes inactive tickets (48h)

3. **Incoming Email Poller** (`incomingEmailService.js`)
   - Polls email inbox periodically
   - Processes incoming emails
   - Converts to ticket messages

---

## Security Features

### Backend Security
- **Helmet**: HTTP header security
- **Rate Limiting**: API rate limiting (configurable)
- **CORS**: Configurable CORS policy
- **JWT Authentication**: Token-based auth
- **Role-Based Access Control**: Permission matrix
- **Input Validation**: express-validator
- **SQL Injection Prevention**: Parameterized queries
- **File Upload Validation**: Multer configuration

### Frontend Security
- **Route Guards**: Protected routes for authenticated access
- **Token Validation**: JWT expiration checking
- **Global 401 Handler**: Automatic logout on auth failure
- **XSS Prevention**: React's built-in XSS protection
- **CSRF Protection**: Token-based API calls

---

## Development Workflow

### Backend Development
- **Entry Point**: `backend/server.js`
- **Configuration**: `backend/config.env`
- **Database**: MySQL with connection pooling
- **Testing**: Various test files in backend root
- **Migrations**: SQL migration files in `backend/migrations/`

### Frontend Development
- **Entry Point**: `frontend/src/index.js`
- **Configuration**: `frontend/.env`
- **Proxy**: Backend proxy configured in package.json
- **Development Server**: `npm start` (react-scripts)
- **Build**: `npm run build`

---

## Deployment

### Docker Support
- **Backend Dockerfile**: `backend/Dockerfile`
- **Frontend Dockerfile**: `frontend/Dockerfile`
- **Docker Compose**: `docker-compose.vps.yml`
- **Nginx Config**: `frontend/nginx.conf`

### Environment Configuration
- **Backend**: `backend/config.env`
- **Frontend**: `frontend/.env` and `frontend/.env.production`
- **Root**: `config.env`

---

## Legacy Components

### Backend Legacy
- Traditional route-handler pattern (no explicit controllers)
- Inline business logic in routes
- Direct database queries in routes

### Frontend Legacy
- Root-level components (AgentDashboard.js, BusinessDashboard.js, etc.)
- Replaced by organized component structure in `src/components/`
- Kept for backward compatibility

---

## Migration Path to HCMS

### Archival Structure
- **Archive Directory**: `archive/` preserves old ITSM functionality
- **Organized by Type**: backend, frontend, database, notes, docs
- **README Files**: Each folder has documentation
- **No Modifications**: Existing files preserved

### Transformation Strategy
1. **Preserve**: Archive existing ITSM functionality
2. **Document**: Inventory current structure (completed)
3. **Analyze**: Identify components for transformation
4. **Migrate**: Gradually transform to HCMS architecture
5. **Test**: Validate transformed components
6. **Deploy**: Deploy HCMS system

---

## Summary

The HCMS project is a comprehensive ITSM/Case Management system with:

- **Backend**: 29 routes, 22 services, 6 middleware, 6 utilities
- **Frontend**: 69+ components organized in 11 categories
- **Architecture**: Multi-tenant, real-time, AI-powered
- **Features**: Ticket management, chat, SLA, notifications, workflows
- **Integrations**: Email, WhatsApp, AI, WebSocket
- **Security**: JWT auth, RBAC, rate limiting, CORS
- **Deployment**: Docker support, environment configuration

The system is currently transitioning from traditional ITSM to the HCMS Case Management architecture, with archival structures in place to preserve legacy functionality during the transformation.
