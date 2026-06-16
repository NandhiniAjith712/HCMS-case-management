# 🏢 ITSM Role-Based Ticketing System - Complete Documentation

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Role-Based Features](#role-based-features)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Components](#frontend-components)
7. [Implementation Plan](#implementation-plan)
8. [Security & Access Control](#security--access-control)

---

## 🎯 System Overview

### **ITSM (IT Service Management) System**
A comprehensive customer support platform with role-based access control, designed for enterprise-level service management with WhatsApp integration.

### **Technology Stack**
- **Backend**: Node.js, Express.js, MySQL
- **Frontend**: React.js, Material-UI
- **Authentication**: JWT with role-based tokens
- **WhatsApp**: Business API integration
- **Security**: RBAC, Rate Limiting, Input Validation

---

## 👥 User Roles & Permissions

### **1. User (Customer)**
**Role ID**: `user`
**Description**: End customers who create support tickets

#### **Permissions:**
- ✅ Create tickets via web form
- ✅ Create tickets via WhatsApp
- ✅ View own tickets and status
- ✅ Rate support after ticket closure
- ✅ Add comments to own tickets
- ✅ Download own ticket attachments
- ✅ Receive WhatsApp notifications

#### **Access Level:**
- **Dashboard**: Personal ticket view only
- **API Access**: Limited to own tickets
- **WhatsApp**: Full conversation flow

### **2. Support Executive**
**Role ID**: `support_agent`
**Description**: Frontline support staff who handle customer tickets

#### **Permissions:**
- ✅ View assigned tickets
- ✅ Reply to customer tickets
- ✅ Update ticket status (new → in_progress → closed)
- ✅ Add internal notes
- ✅ Assign tickets to other executives
- ✅ View customer history
- ✅ Send WhatsApp notifications
- ✅ Upload attachments to replies

#### **Access Level:**
- **Dashboard**: Assigned tickets view
- **API Access**: Ticket management for assigned tickets
- **WhatsApp**: Send notifications to customers

### **3. Support Manager**
**Role ID**: `support_manager`
**Description**: Supervisors who oversee support operations and staff performance

#### **Permissions:**
- ✅ All Support Executive permissions
- ✅ View all tickets across organization
- ✅ Assign tickets to executives
- ✅ Monitor executive performance
- ✅ Rate executive performance
- ✅ View support metrics and analytics
- ✅ Manage ticket priorities
- ✅ Escalate tickets
- ✅ View customer satisfaction ratings
- ✅ Generate performance reports

#### **Access Level:**
- **Dashboard**: Full ticket management + analytics
- **API Access**: Complete ticket management
- **Analytics**: Performance metrics and reports

### **4. CEO**
**Role ID**: `ceo`
**Description**: Executive leadership with strategic oversight

#### **Permissions:**
- ✅ View all system data
- ✅ Access executive dashboard
- ✅ View organizational metrics
- ✅ Generate strategic reports
- ✅ View customer satisfaction trends
- ✅ Monitor support performance
- ✅ View financial impact reports
- ✅ Access system analytics
- ✅ View WhatsApp integration metrics

#### **Access Level:**
- **Dashboard**: Executive analytics dashboard
- **API Access**: Read-only access to all data
- **Analytics**: Strategic business intelligence

### **5. System Administrator**
**Role ID**: `admin`
**Description**: Technical administrators who manage system configuration

#### **Permissions:**
- ✅ All system permissions
- ✅ Manage user accounts
- ✅ Configure system settings
- ✅ Manage WhatsApp integration
- ✅ View system logs
- ✅ Backup and restore data
- ✅ Manage database
- ✅ Configure security settings

#### **Access Level:**
- **Dashboard**: System administration panel
- **API Access**: Complete system access
- **System**: Full administrative control

---

## 🎯 Role-Based Features

### **User Features**
```javascript
// User Dashboard Components
- PersonalTicketList
- TicketCreationForm
- TicketDetailsView
- RatingSystem
- WhatsAppIntegration
```

### **Support Executive Features**
```javascript
// Support Executive Dashboard
- AssignedTicketsList
- TicketManagementPanel
- ReplyInterface
- StatusUpdateControls
- CustomerHistoryView
- WhatsAppNotificationPanel
```

### **Support Manager Features**
```javascript
// Support Manager Dashboard
- AllTicketsOverview
- ExecutivePerformanceMetrics
- TicketAssignmentPanel
- PerformanceRatingSystem
- AnalyticsDashboard
- ReportGeneration
```

### **CEO Features**
```javascript
// CEO Executive Dashboard
- StrategicAnalytics
- OrganizationalMetrics
- CustomerSatisfactionTrends
- PerformanceReports
- BusinessIntelligence
- WhatsAppIntegrationMetrics
```

### **System Administrator Features**
```javascript
// Admin Panel
- UserManagement
- SystemConfiguration
- WhatsAppSettings
- DatabaseManagement
- SecuritySettings
- SystemLogs
```

---

## 🗄️ Database Schema

### **Users Table**
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  role ENUM('user', 'support_agent', 'support_manager', 'ceo', 'admin') DEFAULT 'user',
  department VARCHAR(30),
  manager_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  last_login DATETIME,
  FOREIGN KEY (manager_id) REFERENCES users(id)
);
```

### **Tickets Table (Enhanced)**
```sql
CREATE TABLE tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  assigned_to INT,
  assigned_by INT,
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  status ENUM('new', 'in_progress', 'closed', 'escalated') DEFAULT 'new',
  category VARCHAR(30),
  subcategory VARCHAR(30),
  satisfaction_rating INT,
  satisfaction_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at DATETIME,
  resolution_time INT, -- in minutes
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);
```

### **Replies Table (Enhanced)**
```sql
CREATE TABLE replies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  user_id INT NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### **Performance Ratings Table**
```sql
CREATE TABLE performance_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  executive_id INT NOT NULL,
  manager_id INT NOT NULL,
  ticket_id INT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (executive_id) REFERENCES users(id),
  FOREIGN KEY (manager_id) REFERENCES users(id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);
```

### **WhatsApp Conversations Table**
```sql
CREATE TABLE whatsapp_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone_number VARCHAR(15) NOT NULL,
  user_id INT,
  conversation_state JSON,
  last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 🔌 API Endpoints

### **Authentication**
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile

### **User Management**
- `GET /api/users` - Get users (role-based)
- `POST /api/users` - Create user (admin only)
- `PUT /api/users/:id` - Update user (role-based)
- `DELETE /api/users/:id` - Delete user (admin only)

### **Ticket Management**
- `GET /api/tickets` - Get tickets (role-based)
- `POST /api/tickets` - Create ticket
- `GET /api/tickets/:id` - Get ticket details
- `PUT /api/tickets/:id` - Update ticket (role-based)
- `PUT /api/tickets/:id/assign` - Assign ticket (manager+)
- `PUT /api/tickets/:id/status` - Update status
- `POST /api/tickets/:id/rate` - Rate support (user only)

### **Reply System**
- `GET /api/replies/:ticketId` - Get replies
- `POST /api/replies` - Add reply (role-based)
- `PUT /api/replies/:id` - Update reply (role-based)

### **Analytics & Reports**
- `GET /api/analytics/overview` - System overview (CEO)
- `GET /api/analytics/performance` - Performance metrics (Manager+)
- `GET /api/analytics/satisfaction` - Satisfaction trends (CEO)
- `GET /api/analytics/whatsapp` - WhatsApp metrics (Admin)

### **WhatsApp Integration**
- `GET /api/whatsapp/webhook` - Webhook verification
- `POST /api/whatsapp/webhook` - Handle messages
- `POST /api/whatsapp/send` - Send message (role-based)
- `GET /api/whatsapp/status` - Service status

---

## 🎨 Frontend Components

### **Role-Based Dashboards**

#### **User Dashboard**
```javascript
// components/UserDashboard.js
- TicketCreationForm
- PersonalTicketList
- TicketDetailsView
- RatingModal
- WhatsAppChat
```

#### **Support Executive Dashboard**
```javascript
// components/SupportExecutiveDashboard.js
- AssignedTicketsList
- TicketManagementPanel
- ReplyInterface
- CustomerHistoryView
- PerformanceMetrics
```

#### **Support Manager Dashboard**
```javascript
// components/SupportManagerDashboard.js
- AllTicketsOverview
- ExecutivePerformancePanel
- TicketAssignmentInterface
- AnalyticsDashboard
- ReportGenerationPanel
```

#### **CEO Dashboard**
```javascript
// components/CEODashboard.js
- StrategicAnalytics
- OrganizationalMetrics
- CustomerSatisfactionTrends
- PerformanceReports
- BusinessIntelligence
```

#### **Admin Dashboard**
```javascript
// components/AdminDashboard.js
- UserManagementPanel
- SystemConfiguration
- WhatsAppSettings
- DatabaseManagement
- SecuritySettings
```

---

## 🔒 Security & Access Control

### **JWT Token Structure**
```javascript
{
  "userId": 123,
  "email": "user@company.com",
  "role": "support_manager",
  "permissions": ["view_tickets", "assign_tickets", "rate_performance"],
  "department": "support",
  "managerId": 456,
  "iat": 1640995200,
  "exp": 1641081600
}
```

### **Permission Matrix**
```javascript
const permissions = {
  user: [
    'create_ticket',
    'view_own_tickets',
    'rate_support',
    'whatsapp_chat'
  ],
  support_agent: [
    'view_assigned_tickets',
    'reply_to_tickets',
    'update_ticket_status',
    'send_whatsapp_notifications'
  ],
  support_manager: [
    'view_all_tickets',
    'assign_tickets',
    'rate_performance',
    'view_analytics',
    'generate_reports'
  ],
  ceo: [
    'view_all_data',
    'view_analytics',
    'view_reports',
    'view_business_intelligence'
  ],
  admin: [
    'all_permissions',
    'manage_users',
    'system_configuration',
    'database_management'
  ]
};
```

### **Middleware Functions**
```javascript
// middleware/auth.js
- authenticateToken
- authorizeRole
- checkPermission
- rateLimit
- validateInput
```

---

## 🚀 Implementation Plan

### **Phase 1: Core RBAC System**
1. ✅ Database schema implementation
2. ✅ User authentication with roles
3. ✅ Permission-based middleware
4. ✅ Role-based API endpoints

### **Phase 2: Role-Specific Features**
1. ✅ User dashboard and ticket creation
2. ✅ Support executive ticket management
3. ✅ Support manager analytics
4. ✅ CEO executive dashboard
5. ✅ Admin system management

### **Phase 3: Advanced Features**
1. ✅ Performance rating system
2. ✅ Customer satisfaction tracking
3. ✅ WhatsApp integration per role
4. ✅ Analytics and reporting
5. ✅ Advanced security features

### **Phase 4: Enterprise Features**
1. ✅ Multi-department support
2. ✅ SLA management
3. ✅ Escalation workflows
4. ✅ Advanced analytics
5. ✅ Integration APIs

---

## 📊 Success Metrics

### **User Satisfaction**
- Customer satisfaction ratings
- Response time metrics
- Resolution time tracking
- WhatsApp engagement rates

### **Support Performance**
- Executive performance ratings
- Ticket resolution rates
- Customer feedback scores
- Support efficiency metrics

### **Business Intelligence**
- Ticket volume trends
- Common issue patterns
- Customer satisfaction trends
- Support cost analysis

### **System Performance**
- API response times
- Database performance
- WhatsApp delivery rates
- System uptime metrics

---

## 🎯 System Benefits

### **For Users**
- ✅ **Easy ticket creation** via web or WhatsApp
- ✅ **Real-time updates** and notifications
- ✅ **Rating system** for feedback
- ✅ **Professional support** experience

### **For Support Staff**
- ✅ **Role-based access** to relevant tickets
- ✅ **Performance tracking** and feedback
- ✅ **Efficient ticket management** tools
- ✅ **WhatsApp integration** for notifications

### **For Management**
- ✅ **Performance analytics** and reporting
- ✅ **Staff evaluation** tools
- ✅ **Customer satisfaction** insights
- ✅ **Strategic business** intelligence

### **For Organization**
- ✅ **Scalable support** system
- ✅ **Quality assurance** mechanisms
- ✅ **Data-driven** decision making
- ✅ **Professional customer** service

