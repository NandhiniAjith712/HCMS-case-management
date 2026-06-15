# ITSM Case Management System – Features by User Type

## Overview

This document lists all implemented features organized by user role. The system supports multiple user types: **Customer**, **Support Executive/Agent**, **Support Manager**, **CEO**, **Admin**, and **Business Dashboard** (password-protected view).

---

## Customer (End User)

### Authentication
- Global login (Login ID + password)
- Auto-login from external links (email + name + product)
- Auto-login with phone number
- Remember-me (7-day session)
- Session expiration check

### Case Management
- Create tickets with fields: name, email, mobile, product, module, description, issue type, attachment
- View own tickets (by user ID or email)
- Filter tickets by: status, priority, issue type, date
- Search tickets
- Sort tickets

### Dashboard
- User dashboard at `/userdashboard`
- Summary counts: total, open, in progress, closed
- Unread reply count

### Chat
- Customer chat page at `/chat/:ticketId`
- Real-time chat with agents
- Customer ticket chat interface

### Notifications & Preferences
- Manage notification preferences
- Email notifications when agents reply

---

## Support Executive / Agent

### Authentication
- Global login (Login ID or email + password)
- Redirect to Agent Dashboard at `/agentdashboard`

### Case Management
- View tickets assigned to them
- Update ticket status: new, in progress, closed, escalated
- Use quick replies
- Ticket assignment (equal distribution)

### Dashboard
- Agent dashboard with tabs: New, In Progress, Escalated, Closed
- SLA timers per ticket
- Product filter
- Agent filter
- New ticket notifications (WebSocket)

### Chat
- Ticket chat with customers
- Real-time chat with typing status
- Trigger email and WhatsApp notifications on agent reply

### SLA
- View SLA timers on tickets
- Breach warnings

### Other
- View products
- Ticket assignment statistics

---

## Support Manager

### Authentication
- Global login
- Redirect to Manager Dashboard at `/manager`

### Case Management
- View all team tickets
- Assign tickets to agents
- Transfer ticket assignments between agents
- Reply to tickets
- Update ticket status
- Manage escalated tickets

### Dashboard
- Manager dashboard with tabs: Overview, Escalated, Closed
- Team performance metrics (resolved tickets, average resolution time)
- Team member list
- Escalated tickets table (sortable)
- Closed tickets table (sortable)

### Assignment Management
- Assign ticket to agent
- Transfer assignment to another agent
- Mark assignment as completed
- View agent workload statistics

### Reports & Analytics
- Team performance metrics
- Ticket resolution statistics

### Agent Management
- Register new agents (via API)

---

## CEO

### Authentication
- Global login
- Redirect to CEO Dashboard at `/ceo`

### Dashboard
- CEO dashboard with tabs: Executive, Assignments, Analytics
- Organization-wide metrics
- Department performance view
- Agent performance (sortable)
- Assignment history (sortable)
- Monthly trends

### Reports & Analytics
- Total and resolved tickets
- Average resolution time
- Customer satisfaction metrics
- Department performance
- Agent performance

### User Management
- List users (via API)
- Register new agents

---

## Admin

- Uses same routing as Support Executive → Agent Dashboard
- Same features as Support Executive/Agent
- Access to admin chat overview
- Ticket assignment statistics

---

## Business Dashboard (Password-Protected)

### Authentication
- Password gate (e.g. `vdata1234`)
- 24-hour session (no full login)

### Access
- Business dashboard at `/businessdashboard`
- Product dashboard at `/business-products`
- Tickets view at `/business-tickets`

### Features
- View products
- View tickets
- No full authentication (password only)

---

## Super Admin / System Admin (Tenant Management)

### Tenant Management
- List all tenants
- View tenant details
- View tenant statistics
- Create tenant
- Update tenant
- Delete tenant

---

## Cross-Cutting Features (Multiple Roles)

### Real-Time
- WebSocket server for live updates
- New ticket notifications
- Typing status in chat

### SLA & Escalation
- SLA configurations per product/module
- Scheduled auto-escalation for breached SLAs
- SLA timers and breach warnings

### Multi-Tenancy
- Tenant isolation for data
- Tenant-specific products, modules, tickets

### Support Call Logging
- Log support calls (via API)
- Support call history per user
- Support statistics (admin)

---

## Feature Summary Table

| Feature                    | Customer | Agent | Manager | CEO | Admin | Business |
|---------------------------|----------|-------|---------|-----|-------|----------|
| Create ticket             | ✓        |       |         |     |       |          |
| View own tickets          | ✓        |       |         |     |       | ✓        |
| View assigned tickets     |          | ✓     |         |     | ✓     |          |
| View all team tickets     |          |       | ✓       |     |       |          |
| Assign/transfer tickets   |          |       | ✓       |     |       |          |
| Reply to tickets          |          | ✓     | ✓       |     | ✓     |          |
| Update ticket status      |          | ✓     | ✓       |     | ✓     |          |
| Real-time chat            | ✓        | ✓     |         |     | ✓     |          |
| SLA timers                |          | ✓     |         |     | ✓     |          |
| Dashboards & reports      | ✓        | ✓     | ✓       | ✓   | ✓     | ✓        |
| Agent registration        |          |       | ✓       | ✓   |       |          |
| Tenant management         |          |       |         |     |       |          |

*(Tenant management is for Super Admin only)*
