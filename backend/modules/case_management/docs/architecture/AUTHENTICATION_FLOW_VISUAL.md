# Authentication & Authorization Visual Flow Diagrams

## 🔐 Complete Authentication System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT REQUEST                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    authenticateToken Middleware                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Extract Bearer Token from Authorization Header                        │
│ 2. Verify JWT Token with Secret                                         │
│ 3. Decode Token to get userId                                           │
│ 4. Query Database for User Details                                      │
│ 5. Check if User is Active                                              │
│ 6. Load User Permissions based on Role                                  │
│ 7. Attach User Object to Request                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    authorizeRole Middleware                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Check if User Role is in Allowed Roles Array                            │
│ Allowed Roles: ['admin', 'ceo', 'support_manager', etc.]                │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  checkPermission Middleware                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Check if User has Required Permission                                    │
│ Permissions: ['create_ticket', 'view_analytics', etc.]                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  canAccessTicket Middleware                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Check Ticket Access Based on User Role and Ticket Ownership              │
│ • Admin/CEO/Manager: Access All Tickets                                 │
│ • Support Executive: Access Assigned Tickets                            │
│ • User: Access Own Tickets Only                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ROUTE HANDLER                                  │
│                    (Protected Business Logic)                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 👥 Role-Based Permission Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERMISSION MATRIX                              │
├─────────────────┬─────────────────────────────────────────────────────────┤
│      ROLE       │                    PERMISSIONS                         │
├─────────────────┼─────────────────────────────────────────────────────────┤
│      user       │ • create_ticket                                        │
│                 │ • view_own_tickets                                     │
│                 │ • rate_support                                         │
│                 │ • whatsapp_chat                                        │
├─────────────────┼─────────────────────────────────────────────────────────┤
│support_agent│ • view_assigned_tickets                                │
│                 │ • reply_to_tickets                                     │
│                 │ • update_ticket_status                                 │
│                 │ • send_whatsapp_notifications                          │
│                 │ • view_customer_history                                │
├─────────────────┼─────────────────────────────────────────────────────────┤
│support_manager  │ • view_all_tickets                                     │
│                 │ • assign_tickets                                       │
│                 │ • rate_performance                                     │
│                 │ • view_analytics                                       │
│                 │ • generate_reports                                     │
│                 │ • escalate_tickets                                     │
├─────────────────┼─────────────────────────────────────────────────────────┤
│      ceo        │ • view_all_data                                        │
│                 │ • view_analytics                                       │
│                 │ • view_reports                                         │
│                 │ • view_business_intelligence                           │
├─────────────────┼─────────────────────────────────────────────────────────┤
│     admin       │ • all_permissions                                      │
│                 │ • manage_users                                         │
│                 │ • system_configuration                                 │
│                 │ • database_management                                  │
└─────────────────┴─────────────────────────────────────────────────────────┘
```

## 🔑 JWT Token Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOKEN GENERATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. User Login with Email/Password                                       │
│ 2. Verify Password with bcrypt.compare()                                │
│ 3. Generate JWT Token with User Data                                    │
│ 4. Return Token to Client                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOKEN STRUCTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ {                                                                         │
│   "userId": "123",                                                        │
│   "email": "user@example.com",                                           │
│   "role": "support_agent",                                            │
│   "department": "IT",                                                     │
│   "managerId": "456"                                                      │
│ }                                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Expiration: 24 hours                                                     │
│ Algorithm: HMAC SHA256                                                   │
│ Secret: JWT_SECRET environment variable                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOKEN VALIDATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Extract Token from Authorization Header                               │
│ 2. Verify Token Signature with Secret                                    │
│ 3. Check Token Expiration                                                │
│ 4. Decode Token Payload                                                  │
│ 5. Query Database for User                                               │
│ 6. Verify User is Active                                                 │
│ 7. Load User Permissions                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🎫 Ticket Access Control Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TICKET ACCESS CONTROL                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Request with Ticket ID → Check User Role                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────┬─────────────────┬─────────────────┐
                    │                 │                 │                 │
                    ▼                 ▼                 ▼                 ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │   Admin/CEO/    │ │ Support Executive│ │ Regular User    │ │ Other Roles     │
        │   Manager       │ │                 │ │                 │ │                 │
        └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
                    │                 │                 │                 │
                    ▼                 ▼                 ▼                 ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │   ALLOW ACCESS  │ │ Check if Ticket │ │ Check if Ticket │ │   DENY ACCESS   │
        │   (All Tickets) │ │ is Assigned to  │ │ is Owned by     │ │                 │
        │                 │ │ User            │ │ User            │ │                 │
        └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
                    │                 │                 │                 │
                    │                 ▼                 ▼                 │
                    │         ┌─────────────────┐ ┌─────────────────┐     │
                    │         │   ALLOW ACCESS  │ │   ALLOW ACCESS  │     │
                    │         │ (Assigned Only) │ │ (Own Tickets)   │     │
                    │         └─────────────────┘ └─────────────────┘     │
                    │                 │                 │                 │
                    │                 ▼                 ▼                 │
                    │         ┌─────────────────┐ ┌─────────────────┐     │
                    │         │   DENY ACCESS   │ │   DENY ACCESS   │     │
                    │         │ (Not Assigned)  │ │ (Not Owned)     │     │
                    │         └─────────────────┘ └─────────────────┘     │
                    │                 │                 │                 │
                    └─────────────────┴─────────────────┴─────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ATTACH TICKET TO REQUEST                       │
│                    (if access granted) or ERROR RESPONSE                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🔒 Password Security Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PASSWORD SECURITY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                           REGISTRATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │           hashPassword Function                │
                    ├─────────────────────────────────────────────────┤
                    │ 1. Generate Salt (10 rounds)                  │
                    │ 2. Hash Password with bcrypt                   │
                    │ 3. Return Hashed Password                      │
                    └─────────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │           Store in Database                    │
                    │           (Hashed Password Only)              │
                    └─────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             LOGIN FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │         comparePassword Function               │
                    ├─────────────────────────────────────────────────┤
                    │ 1. Retrieve Hashed Password from DB           │
                    │ 2. Compare with bcrypt.compare()              │
                    │ 3. Return Boolean Result                       │
                    └─────────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────┬─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │   SUCCESS       │ │   FAILURE       │ │   ERROR         │
        │                 │ │                 │ │                 │
        │ Generate JWT    │ │ Return Error    │ │ Return Error    │
        │ Token           │ │ Message         │ │ Message         │
        └─────────────────┘ └─────────────────┘ └─────────────────┘
```

## ⚠️ Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR RESPONSES                                │
├─────────────────┬─────────────────┬─────────────────────────────────────┤
│   HTTP STATUS   │   ERROR TYPE    │   RESPONSE MESSAGE                  │
├─────────────────┼─────────────────┼─────────────────────────────────────┤
│      401        │   No Token      │   "Access token required"           │
│      401        │ Invalid User    │   "Invalid or inactive user"        │
│      401        │ Auth Required   │   "Authentication required"          │
│      403        │ Invalid Token   │   "Invalid token"                   │
│      403        │ Role Denied     │   "Insufficient permissions"        │
│      403        │ Permission Denied│   "Permission denied"              │
│      403        │ Ticket Access   │   "Access denied to this ticket"    │
│      404        │ Ticket Not Found│   "Ticket not found"                │
│      500        │ Server Error    │   "Error checking ticket access"    │
└─────────────────┴─────────────────┴─────────────────────────────────────┘
```

## 🛡️ Security Features

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SECURITY FEATURES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔐 JWT Token Security                                                    │
│    • 24-hour expiration                                                  │
│    • HMAC SHA256 algorithm                                              │
│    • Environment variable secret                                         │
│                                                                           │
│ 🔒 Password Security                                                     │
│    • bcrypt hashing with 10 salt rounds                                  │
│    • Constant-time comparison                                            │
│    • No plain text storage                                               │
│                                                                           │
│ 👥 Role-Based Access Control                                             │
│    • Granular permission system                                          │
│    • Role hierarchy enforcement                                          │
│    • Permission-based authorization                                      │
│                                                                           │
│ 🎫 Resource Isolation                                                    │
│    • Users can only access own tickets                                   │
│    • Support executives see assigned tickets                             │
│    • Managers and admins see all tickets                                │
│                                                                           │
│ 🛡️ Error Handling                                                        │
│    • No information leakage in errors                                    │
│    • Consistent error response format                                    │
│    • Proper HTTP status codes                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📋 Implementation Checklist

- [x] JWT token generation and validation
- [x] Password hashing with bcrypt
- [x] Role-based permission system
- [x] Ticket access control middleware
- [x] Error handling and responses
- [x] Database user validation
- [x] Environment variable configuration
- [x] Middleware chaining support
- [x] Security best practices implementation
- [x] Comprehensive documentation 