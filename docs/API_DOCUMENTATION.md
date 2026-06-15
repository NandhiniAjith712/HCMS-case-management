# 🔌 Tick System API Documentation

## 📋 Table of Contents
- [API Overview](#api-overview)
- [Authentication](#authentication)
- [Base URL & Environment](#base-url--environment)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [API Endpoints](#api-endpoints)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Ticket Management](#ticket-management)
  - [Reply System](#reply-system)
  - [WhatsApp Integration](#whatsapp-integration)
  - [User Management](#user-management)
  - [SLA Management](#sla-management)
  - [Agent Management](#agent-management)
  - [Chat System](#chat-system)
  - [Assignment Management](#assignment-management)
- [WebSocket API](#websocket-api)
- [Request/Response Examples](#requestresponse-examples)
- [Status Codes](#status-codes)
- [Security](#security)

---

## 🎯 API Overview

The Tick System API is a comprehensive RESTful API built with Node.js and Express.js that provides complete ticket management functionality for IT Service Management (ITSM). The API supports role-based access control, real-time communication, WhatsApp integration, and automated SLA management.

### **Key Features**
- **Role-based Authentication**: JWT tokens with different access levels
- **Real-time Communication**: WebSocket support for live updates
- **WhatsApp Integration**: Complete ticket creation and notification system
- **SLA Management**: Automated timer tracking and escalation
- **File Upload**: Support for ticket attachments
- **Auto-assignment**: Intelligent ticket distribution among agents
- **Multi-channel Support**: Web, mobile, and WhatsApp interfaces

---

## 🔐 Authentication

### **Authentication Methods**

#### **1. JWT Token Authentication**
All protected endpoints require a valid JWT token in the Authorization header:

```http
Authorization: Bearer <your_jwt_token>
```

#### **2. Global Login System**
The system supports unified login for both customers and staff:

```http
POST /api/auth/global-login
```

**Login ID Options:**
- Email address
- Login ID (for staff)
- Name (for both customers and staff)

#### **3. Auto-login for External Integrations**
Special endpoint for external system integrations:

```http
GET /api/auth/auto-login/:email/:name/:product
```

### **User Roles & Permissions**

| Role | Description | Access Level |
|------|-------------|--------------|
| `user` | Customer | Own tickets only |
| `support_agent` | Support Agent | Assigned tickets |
| `support_manager` | Team Manager | Team tickets + management |
| `ceo` | Executive | Full system access |
| `admin` | Administrator | System administration |

---

## 🌐 Base URL & Environment

### **Development**
```
Base URL: http://localhost:5000
WebSocket: ws://localhost:5000/ws
```

### **Production**
```
Base URL: https://yourdomain.com
WebSocket: wss://yourdomain.com/ws
```

### **Environment Variables**
```bash
NODE_ENV=development|production
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=tick_system
JWT_SECRET=your_jwt_secret
WHATSAPP_ACCESS_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
```

---

## ⚠️ Error Handling

### **Standard Error Response Format**
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "field_name",
      "message": "Validation error message"
    }
  ]
}
```

### **Common Error Codes**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (duplicate resource)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## 🚦 Rate Limiting

### **Default Limits**
- **General API**: 100 requests per 15 minutes per IP
- **WhatsApp API**: 10 requests per minute per phone number
- **Authentication**: 5 login attempts per 15 minutes per IP

### **Rate Limit Headers**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## 🔌 API Endpoints

## 🔐 Authentication Endpoints

### **POST** `/api/auth/login`
Standard login for staff members.

**Request Body:**
```json
{
  "email": "agent@company.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "email": "agent@company.com",
      "name": "John Agent",
      "role": "support_agent",
      "department": "Support",
      "managerId": 2,
      "lastLogin": "2024-01-15T10:30:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### **POST** `/api/auth/global-login`
Universal login supporting both customers and staff.

**Request Body:**
```json
{
  "login_id": "customer@email.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "John Customer",
      "email": "customer@email.com",
      "role": "user",
      "dashboard_type": "user",
      "user_type": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "dashboard_type": "user"
  }
}
```

### **GET** `/api/auth/auto-login/:email/:name/:product`
Auto-login for external integrations (customers only).

**Parameters:**
- `email`: Customer email address
- `name`: Customer name
- `product`: Product identifier

**Response:**
```json
{
  "success": true,
  "message": "Auto-login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "John Customer",
      "email": "customer@email.com",
      "role": "user",
      "auto_login_context": {
        "email": "customer@email.com",
        "name": "John Customer",
        "product": "ProjectX",
        "timestamp": "2024-01-15T10:30:00Z",
        "source": "auto-login"
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### **GET** `/api/auth/profile`
Get current user profile.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "agent@company.com",
    "name": "John Agent",
    "role": "support_agent",
    "department": "Support",
    "manager_id": 2,
    "created_at": "2024-01-01T00:00:00Z",
    "last_login": "2024-01-15T10:30:00Z"
  }
}
```

### **PUT** `/api/auth/profile`
Update user profile.

**Request Body:**
```json
{
  "name": "John Updated",
  "department": "Advanced Support"
}
```

### **POST** `/api/auth/logout`
Logout current user.

---

## 🎫 Ticket Management

### **GET** `/api/tickets`
Get all tickets with optional filtering.

**Query Parameters:**
- `status`: Filter by status (`new`, `in_progress`, `closed`, `escalated`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "John Customer",
      "email": "customer@email.com",
      "mobile": "+1234567890",
      "product": "ProjectX",
      "product_id": 1,
      "module": "Authentication",
      "module_id": 1,
      "description": "Login issue",
      "issue_type": "Technical Support",
      "issue_title": "Cannot login to system",
      "status": "new",
      "user_id": 1,
      "assigned_to": 2,
      "assigned_by": 3,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "assigned_to_name": "Jane Agent",
      "assigned_to_email": "jane@company.com"
    }
  ]
}
```

### **GET** `/api/tickets/:id`
Get single ticket with replies.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Customer",
    "email": "customer@email.com",
    "mobile": "+1234567890",
    "product": "ProjectX",
    "description": "Login issue",
    "issue_type": "Technical Support",
    "issue_title": "Cannot login to system",
    "status": "new",
    "created_at": "2024-01-15T10:30:00Z",
    "replies": [
      {
        "id": 1,
        "ticket_id": 1,
        "agent_name": "Jane Agent",
        "message": "I'll help you with this login issue.",
        "is_customer_reply": false,
        "sent_at": "2024-01-15T11:00:00Z"
      }
    ]
  }
}
```

### **POST** `/api/tickets`
Create new ticket.

**Request Body:**
```json
{
  "name": "John Customer",
  "email": "customer@email.com",
  "mobile": "+1234567890",
  "product": "ProjectX",
  "module": "Authentication",
  "description": "I cannot login to the system",
  "issueType": "Technical Support",
  "issueTitle": "Login Issue",
  "userId": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Ticket created successfully and assigned to Jane Agent",
  "data": {
    "id": 1,
    "name": "John Customer",
    "email": "customer@email.com",
    "mobile": "+1234567890",
    "product": "ProjectX",
    "product_id": 1,
    "module": "Authentication",
    "module_id": 1,
    "description": "I cannot login to the system",
    "issueType": "Technical Support",
    "issueTitle": "Login Issue",
    "status": "new",
    "assignment": {
      "assigned_to": 2,
      "assigned_to_name": "Jane Agent",
      "assignment_method": "equal_distribution"
    }
  }
}
```

### **PUT** `/api/tickets/:id`
Update ticket.

**Request Body:**
```json
{
  "name": "John Updated",
  "email": "updated@email.com",
  "status": "in_progress",
  "description": "Updated description"
}
```

### **PUT** `/api/tickets/:id/status`
Update ticket status.

**Request Body:**
```json
{
  "status": "in_progress"
}
```

**Valid Statuses:** `new`, `in_progress`, `closed`, `escalated`

### **GET** `/api/tickets/:id/attachment`
Download ticket attachment.

**Response:** File download with appropriate headers.

### **GET** `/api/tickets/user/:userId`
Get all tickets for a specific user.

### **DELETE** `/api/tickets/:id`
Delete ticket.

### **GET** `/api/tickets/assignment-stats`
Get ticket assignment statistics.

**Response:**
```json
{
  "success": true,
  "message": "Assignment statistics retrieved successfully",
  "data": {
    "agents": [
      {
        "agent_id": 1,
        "agent_name": "Jane Agent",
        "total_tickets": 15,
        "active_tickets": 5,
        "closed_tickets": 10
      }
    ],
    "total_agents": 5,
    "total_tickets": 75,
    "average_tickets_per_agent": "15.00"
  }
}
```

### **POST** `/api/tickets/rebalance`
Rebalance ticket assignments across agents.

### **POST** `/api/tickets/:id/assign-equally`
Manually assign ticket using equal distribution.

**Request Body:**
```json
{
  "assigned_by": 1
}
```

---

## 💬 Reply System

### **GET** `/api/replies/:ticketId`
Get all replies for a ticket.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "ticket_id": 1,
      "agent_name": "Jane Agent",
      "message": "I'll help you with this issue.",
      "is_customer_reply": false,
      "sent_at": "2024-01-15T11:00:00Z"
    },
    {
      "id": 2,
      "ticket_id": 1,
      "customer_name": "John Customer",
      "message": "Thank you for your help!",
      "is_customer_reply": true,
      "sent_at": "2024-01-15T11:30:00Z"
    }
  ]
}
```

### **POST** `/api/replies`
Add reply to ticket.

**Request Body:**
```json
{
  "ticketId": 1,
  "agentName": "Jane Agent",
  "message": "I'll help you with this issue.",
  "isCustomerReply": false,
  "customerName": "John Customer"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reply added successfully",
  "data": {
    "id": 1,
    "ticket_id": 1,
    "agent_name": "Jane Agent",
    "message": "I'll help you with this issue.",
    "is_customer_reply": false,
    "sent_at": "2024-01-15T11:00:00Z"
  },
  "whatsappSent": true
}
```

### **PUT** `/api/replies/:id`
Update reply.

**Request Body:**
```json
{
  "agentName": "Jane Agent",
  "message": "Updated message content"
}
```

### **DELETE** `/api/replies/:id`
Delete reply.

### **GET** `/api/replies/user/:userId`
Get all replies for all tickets of a user.

---

## 📱 WhatsApp Integration

### **GET** `/api/whatsapp/webhook`
Webhook verification endpoint.

**Query Parameters:**
- `hub.mode`: `subscribe`
- `hub.challenge`: Challenge string
- `hub.verify_token`: Verification token

**Response:** Challenge string

### **POST** `/api/whatsapp/webhook`
Handle incoming WhatsApp messages.

**Request Body:** WhatsApp webhook payload

### **POST** `/api/whatsapp/send`
Send WhatsApp message manually.

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "message": "Your ticket has been updated!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp message sent successfully",
  "data": {
    "messaging_product": "whatsapp",
    "contacts": [
      {
        "input": "+1234567890",
        "wa_id": "1234567890"
      }
    ],
    "messages": [
      {
        "id": "wamid.xxx"
      }
    ]
  }
}
```

### **GET** `/api/whatsapp/status`
Check WhatsApp service status.

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp webhook is running",
  "timestamp": "2024-01-15T10:30:00Z",
  "verifyToken": "Configured",
  "whatsappApi": "FULLY OPERATIONAL",
  "phoneNumberId": "521803094347148",
  "qualityRating": "GREEN",
  "verificationStatus": "VERIFIED",
  "activeConversations": 5
}
```

### **POST** `/api/whatsapp/reset-conversation`
Reset WhatsApp conversation state.

**Request Body:**
```json
{
  "phoneNumber": "+1234567890"
}
```

### **POST** `/api/whatsapp/send-template`
Send WhatsApp template message.

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "templateName": "welcome"
}
```

### **GET** `/api/whatsapp/templates`
Get available WhatsApp templates.

**Response:**
```json
{
  "success": true,
  "templates": [
    "welcome",
    "nameReceived",
    "emailReceived",
    "ticketCreated",
    "status",
    "help"
  ]
}
```

### **POST** `/api/whatsapp/test-notification`
Send test WhatsApp notification.

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "notificationType": "agent_reply",
  "ticketData": {
    "ticketId": 123,
    "issueTitle": "Test Issue",
    "agentName": "Test Agent",
    "message": "This is a test reply"
  }
}
```

---

## 👥 User Management

### **GET** `/api/users`
Get users (role-based access).

**Headers:**
```http
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "customer@email.com",
      "name": "John Customer",
      "role": "user",
      "created_at": "2024-01-01T00:00:00Z",
      "last_login": "2024-01-15T10:30:00Z",
      "is_active": true
    }
  ]
}
```

### **POST** `/api/users`
Create user (admin only).

**Request Body:**
```json
{
  "email": "newuser@email.com",
  "name": "New User",
  "password": "password123",
  "role": "user",
  "department": "Customer Service"
}
```

### **PUT** `/api/users/:id`
Update user.

### **DELETE** `/api/users/:id`
Delete user (admin only).

---

## ⏱️ SLA Management

### **GET** `/api/sla/configurations`
Get SLA configurations.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "product_id": 1,
      "module_id": 1,
      "issue_name": "Login Issues",
      "priority_level": "P1",
      "response_time_minutes": 30,
      "resolution_time_minutes": 240,
      "escalation_time_minutes": 120,
      "is_active": true
    }
  ]
}
```

### **POST** `/api/sla/configurations`
Create SLA configuration.

**Request Body:**
```json
{
  "product_id": 1,
  "module_id": 1,
  "issue_name": "Critical Bug",
  "priority_level": "P0",
  "response_time_minutes": 15,
  "resolution_time_minutes": 120,
  "escalation_time_minutes": 60
}
```

### **PUT** `/api/sla/configurations/:id`
Update SLA configuration.

### **DELETE** `/api/sla/configurations/:id`
Delete SLA configuration.

### **GET** `/api/sla/timers/:ticketId`
Get SLA timer status for ticket.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "ticket_id": 1,
      "sla_configuration_id": 1,
      "timer_type": "response",
      "sla_deadline": "2024-01-15T11:00:00Z",
      "status": "active",
      "time_remaining": 1800
    }
  ]
}
```

---

## 👨‍💼 Agent Management

### **GET** `/api/agents`
Get all agents.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "agent@company.com",
      "name": "Jane Agent",
      "role": "support_agent",
      "department": "Support",
      "manager_id": 2,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "last_login": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### **POST** `/api/agents`
Create agent.

### **PUT** `/api/agents/:id`
Update agent.

### **DELETE** `/api/agents/:id`
Delete agent.

---

## 💬 Chat System

### **GET** `/api/chat/messages/:ticketId`
Get chat messages for ticket.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "ticket_id": 1,
      "sender_type": "agent",
      "sender_id": 1,
      "message": "Hello! How can I help you?",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### **POST** `/api/chat/messages`
Add chat message.

**Request Body:**
```json
{
  "ticketId": 1,
  "senderType": "agent",
  "senderId": 1,
  "message": "Hello! How can I help you?"
}
```

### **PUT** `/api/chat/messages/read/:ticketId`
Mark messages as read.

### **GET** `/api/chat/session/:ticketId`
Get chat session.

### **POST** `/api/chat/session`
Join chat session.

### **PUT** `/api/chat/typing`
Update typing status.

### **PUT** `/api/chat/session/leave`
Leave chat session.

### **GET** `/api/chat/unread/:ticketId/:userType`
Get unread message count.

---

## 📋 Assignment Management

### **GET** `/api/assignments`
Get ticket assignments.

### **POST** `/api/assignments`
Create assignment.

### **PUT** `/api/assignments/:id`
Update assignment.

### **DELETE** `/api/assignments/:id`
Delete assignment.

---

## 🔌 WebSocket API

### **Connection**
```javascript
const socket = io('ws://localhost:5000/ws', {
  auth: {
    userId: 1,
    userRole: 'support_agent'
  }
});
```

### **Events**

#### **Client → Server**
- `join_ticket`: Join ticket room
- `leave_ticket`: Leave ticket room
- `send_message`: Send chat message
- `typing`: Update typing status

#### **Server → Client**
- `message`: New chat message
- `ticket_update`: Ticket status change
- `notification`: System notification
- `typing`: User typing indicator

### **Example Usage**
```javascript
// Join ticket room
socket.emit('join_ticket', ticketId);

// Send message
socket.emit('send_message', {
  ticketId: 1,
  message: 'Hello!',
  senderType: 'agent',
  senderId: 1
});

// Listen for messages
socket.on('message', (data) => {
  console.log('New message:', data);
});

// Listen for ticket updates
socket.on('ticket_update', (data) => {
  console.log('Ticket updated:', data);
});
```

---

## 📊 Request/Response Examples

### **Complete Ticket Creation Flow**

#### **1. Create Ticket**
```http
POST /api/tickets
Content-Type: application/json

{
  "name": "John Customer",
  "email": "customer@email.com",
  "mobile": "+1234567890",
  "product": "ProjectX",
  "module": "Authentication",
  "description": "I cannot login to the system",
  "issueType": "Technical Support",
  "issueTitle": "Login Issue",
  "userId": 1
}
```

#### **2. Add Reply**
```http
POST /api/replies
Content-Type: application/json

{
  "ticketId": 1,
  "agentName": "Jane Agent",
  "message": "I'll help you with this login issue. Can you tell me what error message you're seeing?",
  "isCustomerReply": false
}
```

#### **3. Update Status**
```http
PUT /api/tickets/1/status
Content-Type: application/json

{
  "status": "in_progress"
}
```

#### **4. Send WhatsApp Notification**
```http
POST /api/whatsapp/send
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "message": "📋 Ticket Update\n\n🎫 Ticket ID: #1\n🏷️ Issue: Login Issue\n📊 Status: ⚡ In Progress\n\nYour ticket is being worked on by our support team!"
}
```

---

## 📈 Status Codes

### **Success Codes**
- `200` - OK
- `201` - Created
- `204` - No Content

### **Client Error Codes**
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests

### **Server Error Codes**
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable

---

## 🔒 Security

### **Authentication Security**
- JWT tokens with expiration
- Password hashing with bcrypt (12 rounds)
- Role-based access control
- Session management

### **Data Security**
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CORS configuration
- Rate limiting

### **WhatsApp Security**
- Webhook verification
- Message validation
- Rate limiting per phone number
- Conversation state management

### **File Upload Security**
- File type validation
- Size limits (50MB)
- Secure file storage
- Access control

---

## 🚀 Getting Started

### **1. Install Dependencies**
```bash
npm install
```

### **2. Set Environment Variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

### **3. Initialize Database**
```bash
npm run db:init
```

### **4. Start Server**
```bash
npm start
```

### **5. Test API**
```bash
# Health check
curl http://localhost:5000/health

# Test authentication
curl -X POST http://localhost:5000/api/auth/global-login \
  -H "Content-Type: application/json" \
  -d '{"login_id":"test@email.com","password":"password123"}'
```

---

## 📚 Additional Resources

- [Frontend Architecture](./FRONTEND_ARCHITECTURE.md)
- [Database Architecture](./DATABASE_ARCHITECTURE.md)
- [Authentication System](./AUTHENTICATION_SYSTEM.md)
- [Project Overview](./PROJECT_OVERVIEW.md)

---

*This API documentation provides comprehensive coverage of all Tick System endpoints, authentication methods, and integration patterns. For additional support or questions, please refer to the project documentation or contact the development team.*
