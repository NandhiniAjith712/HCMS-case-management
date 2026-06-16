# Frontend Inventory

## Overview
The frontend is a React-based single-page application serving as the user interface for the HCMS Case Management system. It provides role-based dashboards, ticket management, real-time chat, and comprehensive workflow features.

## Technology Stack
- **Framework**: React 19.1.0
- **Routing**: React Router DOM 7.6.3
- **UI Library**: Material-UI (MUI) 7.2.0
- **Styling**: CSS modules, inline styles
- **HTTP Client**: Axios 1.10.0
- **Icons**: Material Icons, react-country-flag
- **Form Handling**: react-select, react-phone-input-2
- **Date Handling**: MUI X Date Pickers
- **Testing**: React Testing Library

---

## Pages

### `KnowledgeBasePage.js` (8940 bytes)
- **Purpose**: Knowledge base browsing and search page
- **Dependencies**: react, react-router-dom
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Browse knowledge articles, search functionality, role-based access

---

## Components

### Root Components

#### `App.js` (382 lines)
- **Purpose**: Main application component with routing and authentication
- **Dependencies**: react, react-router-dom
- **Related Modules**: All components, utils/api, context/NotificationContext
- **Key Features**: Route configuration, authentication guards, user state management, role-based routing

#### `AgentDashboard.js` (43544 bytes)
- **Purpose**: Legacy agent dashboard component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Agent-specific dashboard views
- **Status**: Legacy component (replaced by dashboards/AgentDashboard.js)

#### `BusinessDashboard.js` (78587 bytes)
- **Purpose**: Legacy business dashboard component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Business-specific dashboard views
- **Status**: Legacy component

#### `ManagerDashboard.js` (32818 bytes)
- **Purpose**: Legacy manager dashboard component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Manager-specific dashboard views
- **Status**: Legacy component (replaced by dashboards/ManagerDashboard.js)

#### `UserDashboard.js` (48435 bytes)
- **Purpose**: Legacy user dashboard component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: User-specific dashboard views
- **Status**: Legacy component (replaced by dashboards/UserDashboard.js)

#### `TicketDetailPage.js` (25376 bytes)
- **Purpose**: Legacy ticket detail page component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Ticket detail views
- **Status**: Legacy component (replaced by tickets/TicketDetailPage.js)

#### `GlobalLogin.js` (7134 bytes)
- **Purpose**: Legacy global login component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Login functionality
- **Status**: Legacy component (replaced by auth/GlobalLogin.js)

---

### Admin Components (`components/admin/`)

#### `AdminChatOverview.js` (9904 bytes)
- **Purpose**: Admin overview of chat activity
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Chat statistics, admin chat monitoring

#### `AdminRoute.js` (1942 bytes)
- **Purpose**: Admin route protection wrapper
- **Dependencies**: react, react-router-dom
- **Related Modules**: utils/api
- **Key Features**: Admin authentication guard

#### `FAQAdminPage.js` (13460 bytes)
- **Purpose**: FAQ management interface for admins
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: FAQ CRUD, FAQ management

#### `TicketAssignmentStats.js` (6596 bytes)
- **Purpose**: Ticket assignment statistics display
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Assignment metrics, statistics visualization

---

### Authentication Components (`components/auth/`)

#### `AgentLogin.js` (6123 bytes)
- **Purpose**: Agent-specific login page
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Agent authentication, role-specific login

#### `AgentRegistration.css` (3197 bytes)
- **Purpose**: Styling for agent registration
- **Dependencies**: None
- **Related Modules**: None

#### `CustomerAccessPage.js` (21513 bytes)
- **Purpose**: Customer access and authentication page
- **Dependencies**: react, react-router-dom
- **Related Modules**: utils/api
- **Key Features**: Customer login, registration, password setup, email verification

#### `ForgotPassword.js` (3141 bytes)
- **Purpose**: Forgot password functionality
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Password reset request

#### `GlobalLogin.js` (11846 bytes)
- **Purpose**: Global login page for all user types
- **Dependencies**: react, react-router-dom
- **Related Modules**: utils/api
- **Key Features**: Unified login, role detection, remember me

#### `Login.js` (1852 bytes)
- **Purpose**: Generic login component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Basic login form

#### `LoginPage.js` (1190 bytes)
- **Purpose**: Simple login page wrapper
- **Dependencies**: react
- **Related Modules**: None
- **Key Features**: Login page layout

#### `ResetPassword.js` (4443 bytes)
- **Purpose**: Password reset form
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Password reset with token

#### `StaffLogin.js` (4200 bytes)
- **Purpose**: Staff-specific login page
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Staff authentication

#### `StaffSetPassword.js` (4486 bytes)
- **Purpose**: Staff password setup page
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Initial password setup for staff

#### `UserLogin.js` (3254 bytes)
- **Purpose**: User-specific login page
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: User authentication

#### `UserRegistration.css` (3438 bytes)
- **Purpose**: Styling for user registration
- **Dependencies**: None
- **Related Modules**: None

---

### Chat Components (`components/chat/`)

#### `CustomerChatPage.js` (8285 bytes)
- **Purpose**: Customer-facing chat interface
- **Dependencies**: react
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Real-time chat, message history, typing indicators

#### `CustomerTicketChat.js` (8530 bytes)
- **Purpose**: Customer chat for specific tickets
- **Dependencies**: react
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Ticket-specific chat, customer messaging

#### `RealTimeChat.js` (13496 bytes)
- **Purpose**: Real-time chat component with WebSocket
- **Dependencies**: react
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: WebSocket integration, real-time messaging

#### `SupportTicketChatTabs.js` (32239 bytes)
- **Purpose**: Tabbed chat interface for support tickets
- **Dependencies**: react, @mui/material
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Multiple chat tabs, message management, quoted content handling, reply suggestions

#### `TicketChat.js` (38426 bytes)
- **Purpose**: Comprehensive ticket chat interface
- **Dependencies**: react
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Full chat functionality, attachments, rich messaging

---

### Common Components (`components/common/`)

#### `AuthEntryGate.js` (2567 bytes)
- **Purpose**: Authentication entry point for various auth flows
- **Dependencies**: react, react-router-dom
- **Related Modules**: utils/api
- **Key Features**: Route-based auth flow selection

#### `AutoLoginTest.js` (3931 bytes)
- **Purpose**: Auto-login testing component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Auto-login functionality testing

#### `BusinessDashboardAuth.js` (4262 bytes)
- **Purpose**: Business dashboard authentication wrapper
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Business dashboard access control

#### `HeaderNotificationBell.js` (289 bytes)
- **Purpose**: Notification bell icon component
- **Dependencies**: react
- **Related Modules**: None
- **Key Features**: Notification indicator

#### `SimpleTableTest.js` (6124 bytes)
- **Purpose**: Simple table testing component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Table rendering test

#### `SupportEntry.js` (7114 bytes)
- **Purpose**: Support entry point for universal support URLs
- **Dependencies**: react, react-router-dom
- **Related Modules**: utils/api
- **Key Features**: Universal support URL handling, auto-login from URL parameters

#### `TicketViewDemo.js` (2947 bytes)
- **Purpose**: Ticket view demonstration component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Ticket view demo

---

### Dashboard Components (`components/dashboards/`)

#### `AgdashNavIcon.js` (1797 bytes)
- **Purpose**: Navigation icon for agent dashboard
- **Dependencies**: react
- **Related Modules**: None
- **Key Features**: SVG navigation icons

#### `AgentDashboard.js` (70538 bytes)
- **Purpose**: Main agent dashboard with comprehensive features
- **Dependencies**: react, react-router-dom, @mui/material
- **Related Modules**: utils/api, utils/dateTime, components/common/HeaderNotificationBell
- **Key Features**: Ticket management, sidebar navigation, status filtering, ticket actions, real-time updates

#### `BusinessDashboard.js` (28177 bytes)
- **Purpose**: Business dashboard for organizational overview
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Business metrics, organizational views

#### `CEODashboard.js` (132566 bytes)
- **Purpose**: CEO dashboard with executive-level analytics
- **Dependencies**: react, react-router-dom, @mui/material
- **Related Modules**: utils/api, utils/dateTime, components/feedback/FeedbackInsightsPage
- **Key Features**: Executive analytics, department views, agent management, assignments, performance metrics

#### `CEODashboard_temp.js` (13135 bytes)
- **Purpose**: Temporary CEO dashboard version
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: CEO dashboard features (temporary version)
- **Status**: Temporary/backup file

#### `MailInbox.js` (34631 bytes)
- **Purpose**: Email inbox management interface
- **Dependencies**: react
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Email review, inbox management, email processing

#### `MailReviewQueue.js` (26433 bytes)
- **Purpose**: Mail review queue for managers
- **Dependencies**: react
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Email review workflow, queue management

#### `ManagerDashboard.js` (92052 bytes)
- **Purpose**: Manager dashboard with team management features
- **Dependencies**: react, react-router-dom, @mui/material
- **Related Modules**: utils/api, utils/dateTime, components/tickets/UserForm, components/feedback/FeedbackInsightsPage
- **Key Features**: Team overview, ticket assignment, escalation requests, mail review, analytics

#### `ManagerEscalationRequests.js` (13811 bytes)
- **Purpose**: Manager escalation request handling
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Escalation request review, approval workflow

#### `MdashKpiIcon.js` (1818 bytes)
- **Purpose**: KPI icon for manager dashboard
- **Dependencies**: react
- **Related Modules**: None
- **Key Features**: SVG KPI icons

#### `OrgSpocDashboard.js` (72964 bytes)
- **Purpose**: Organization SPOC dashboard
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Organization-level SPOC views, organizational metrics

#### `ProductDashboard.js` (10543 bytes)
- **Purpose**: Product dashboard for product-specific views
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Product metrics, product-specific ticket views

#### `ProductSpocDashboard.js` (40751 bytes)
- **Purpose**: Product SPOC dashboard
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Product SPOC views, product-level management

#### `UserDashboard.js` (45725 bytes)
- **Purpose**: User dashboard for customers
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Customer ticket views, customer-specific features

---

### Feedback Components (`components/feedback/`)

#### `FeedbackFormPage.js` (3857 bytes)
- **Purpose**: Feedback submission form
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Feedback collection, rating submission

#### `FeedbackInsightsPage.js` (3418 bytes)
- **Purpose**: Feedback analytics and insights
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Feedback analysis, sentiment insights, feedback trends

---

### Help Components (`components/help/`)

#### `HelpFAQPage.js` (9743 bytes)
- **Purpose**: Help and FAQ page for users
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: FAQ browsing, help content, search functionality

---

### Notification Components (`components/notifications/`)

#### `NotificationBell.js` (3017 bytes)
- **Purpose**: Notification bell with dropdown
- **Dependencies**: react
- **Related Modules**: context/NotificationContext
- **Key Features**: Notification display, notification count, notification dropdown

#### `NotificationDropdown.js` (2255 bytes)
- **Purpose**: Notification dropdown menu
- **Dependencies**: react
- **Related Modules**: context/NotificationContext
- **Key Features**: Notification list, notification actions

---

### SLA Components (`components/sla/`)

#### `SLADashboard.js` (11732 bytes)
- **Purpose**: SLA dashboard for monitoring service levels
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: SLA metrics, SLA compliance monitoring

#### `SLAManagement.js` (23580 bytes)
- **Purpose**: SLA management interface
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: SLA configuration, SLA rules, SLA editing

#### `SLATimer.js` (7134 bytes)
- **Purpose**: SLA timer component for tickets
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Real-time SLA countdown, SLA status display

---

### Ticket Components (`components/tickets/`)

#### `GroupTicketPage.js` (11268 bytes)
- **Purpose**: Group ticket management page
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Group ticket operations, bulk ticket management

#### `LinkedTicketReviewPage.js` (6307 bytes)
- **Purpose**: Linked ticket review interface
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Linked ticket viewing, relationship management

#### `ProductTickets.js` (7625 bytes)
- **Purpose**: Product-specific ticket views
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Product-filtered tickets, product ticket management

#### `TicketCard.js` (10673 bytes)
- **Purpose**: Ticket card component for list views
- **Dependencies**: react
- **Related Modules**: utils/api, utils/dateTime
- **Key Features**: Ticket summary, quick actions, ticket preview

#### `TicketDetailPage.js` (226270 bytes)
- **Purpose**: Comprehensive ticket detail page
- **Dependencies**: react, react-router-dom, @mui/material
- **Related Modules**: utils/api, utils/dateTime, components/chat/SupportTicketChatTabs
- **Key Features**: Full ticket details, chat integration, activity timeline, attachments, status management, SLA display, linked tickets, ticket actions

#### `TicketTableView.js` (12337 bytes)
- **Purpose**: Table view for tickets
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Tabular ticket display, sorting, filtering

#### `TicketTemplate.js` (14110 bytes)
- **Purpose**: Ticket template component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Ticket templates, template management

#### `TicketsView.js` (17250 bytes)
- **Purpose**: General tickets view component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: Ticket listing, view options, ticket navigation

#### `UserForm.js` (53030 bytes)
- **Purpose**: User form for ticket creation/management
- **Dependencies**: react, @mui/material
- **Related Modules**: utils/api
- **Key Features**: User information form, ticket creation, form validation

---

### Assistant Components (`components/assistant/`)

#### `ItsmAssistant.js`
- **Purpose**: ITSM AI assistant component
- **Dependencies**: react
- **Related Modules**: utils/api
- **Key Features**: AI-powered assistance, contextual help

---

## Hooks

**Note**: The frontend uses standard React hooks (useState, useEffect, useCallback, useMemo, useRef) throughout components. No custom hooks directory exists in the current structure.

---

## API Services

### `utils/api.js` (486 lines)
- **Purpose**: Centralized API utility functions for authentication and HTTP requests
- **Dependencies**: None (uses fetch API)
- **Related Modules**: All components
- **Key Functions**:
  - `isStaffRoute()`: Determines if current route should use staff authentication
  - `getAuthHeaders()`: Returns authentication headers for API requests
  - `getAuthHeadersFormData()`: Returns auth headers for form data requests
  - `authenticatedFetch()`: Wrapper for authenticated API calls
  - `buildApiUrl()`: Builds full API URLs
  - `clearAllAuthStorage()`: Clears all authentication storage
  - `isStaffSessionValid()`: Validates staff session
  - `isCustomerSessionValid()`: Validates customer session
  - `installGlobal401Handler()`: Installs global 401 error handler
  - `fetchTicketReplySuggestions()`: Fetches AI-powered reply suggestions
  - `getTenantId()`: Retrieves tenant ID from storage
  - `canonicalizeEmail()`: Normalizes email addresses

---

## Utility Functions

### `utils/customerAccessResolver.js` (2887 bytes)
- **Purpose**: Customer access resolution logic
- **Dependencies**: None
- **Related Modules**: utils/api
- **Key Functions**: Resolve customer access state, determine access requirements

### `utils/dateTime.js` (1523 bytes)
- **Purpose**: Date and time formatting utilities
- **Dependencies**: None
- **Related Modules**: All components
- **Key Functions**:
  - `formatDateTimeIST()`: Format datetime in IST timezone
  - `formatTimeIST()`: Format time in IST timezone
  - `formatDateIST()`: Format date in IST timezone

### `utils/formatRelativeTime.js` (789 bytes)
- **Purpose**: Relative time formatting (e.g., "2 hours ago")
- **Dependencies**: None
- **Related Modules**: All components
- **Key Functions**: Format relative time strings

---

## Context

### `context/NotificationContext.js` (6924 bytes)
- **Purpose**: Global notification state management
- **Dependencies**: react
- **Related Modules**: All components
- **Key Functions**:
  - Provides notification state to entire app
  - Notification CRUD operations
  - Notification count management
  - Real-time notification updates

---

## Key Frontend Files

### `src/index.js` (535 bytes)
- **Purpose**: React application entry point
- **Dependencies**: react, react-dom
- **Related Modules**: App.js
- **Key Functions**: Render React app to DOM

### `src/App.css` (10072 bytes)
- **Purpose**: Global application styles
- **Dependencies**: None
- **Related Modules**: All components
- **Key Features**: Global CSS, theme styles, utility classes

### `src/index.css` (366 bytes)
- **Purpose**: Base CSS imports and resets
- **Dependencies**: None
- **Related Modules**: All components
- **Key Features**: CSS normalization, base styles

---

## Component Organization Summary

### By Category
- **Root Components**: 7 (App.js, legacy dashboards, legacy pages)
- **Admin Components**: 4
- **Authentication Components**: 14
- **Chat Components**: 5
- **Common Components**: 7
- **Dashboard Components**: 14
- **Feedback Components**: 2
- **Help Components**: 1
- **Notification Components**: 2
- **SLA Components**: 3
- **Ticket Components**: 9
- **Assistant Components**: 1

### Total Components: 69+ components organized in 11 categories

---

## Routing Structure

The application uses React Router with the following main route groups:

### Public Routes
- `/login` - Global login
- `/customer-access` - Customer access page
- `/staff/set-password` - Staff password setup
- `/staff/forgot-password` - Forgot password
- `/staff/reset-password` - Reset password
- `/businessdashboard` - Business dashboard (no auth required)

### Customer Routes
- `/userdashboard` - User dashboard
- `/chat/:ticketId` - Customer chat
- `/feedback/:ticketId` - Feedback form
- `/customer/ticket/:ticketId` - Customer ticket view
- `/user/ticket/:ticketId` - User ticket view

### Staff Routes
- `/agentdashboard` - Agent dashboard
- `/manager` - Manager dashboard
- `/ceo` - CEO dashboard
- `/products` - Product dashboard (agent)
- `/manager/products` - Product dashboard (manager)
- `/manager/knowledge-base` - Knowledge base (manager)
- `/agent/knowledge-base` - Knowledge base (agent)
- `/faq-admin` - FAQ admin (CEO)
- `/feedback-insights` - Feedback insights
- `/tickets` - Tickets view
- `/tickets-table` - Ticket table view
- `/agent/ticket/:ticketId` - Agent ticket detail
- `/manager/ticket/:ticketId` - Manager ticket detail
- `/ticket/:ticketId` - Universal ticket route

### Universal Support Route
- `/:product` - Universal support URL with auto-login

---

## Authentication Flow

The application implements a dual authentication system:

1. **Staff Authentication**: Uses sessionStorage with `staffData` and `staffToken`
2. **Customer Authentication**: Uses localStorage with `customerData` and `customerToken`

### Authentication Guards
- `ProtectedRoute`: Protects staff routes requiring authentication
- `UserDashboardGuard`: Protects customer routes
- `isStaffRoute()`: Determines which auth system to use based on URL path

### Global 401 Handler
- Automatically clears auth storage on 401 responses
- Redirects to appropriate login page based on route type

---

## Summary

The frontend follows a component-based architecture with:
- **69+ components** organized by domain
- **Role-based dashboards** for agents, managers, CEOs, and customers
- **Real-time features** via WebSocket integration
- **Comprehensive ticket management** with chat, attachments, and workflow
- **Multi-tenant support** with tenant context
- **Dual authentication system** for staff and customers
- **Centralized API utilities** for consistent HTTP handling
- **Context-based state management** for notifications
- **Material-UI** for consistent UI components
- **CSS modules** for component-specific styling
