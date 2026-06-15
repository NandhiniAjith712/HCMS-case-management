# 🔐 Enhanced Authentication System Documentation

## 📋 Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Security Features](#security-features)
- [Database Schema](#database-schema)
- [Implementation Details](#implementation-details)
- [Usage Examples](#usage-examples)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The Enhanced Authentication System is a comprehensive, secure authentication solution built with Node.js, Express, and JWT tokens. It provides complete user management capabilities including registration, login, password management, email verification, and security features.

### **Key Features:**
- **JWT-based Authentication**: Secure token-based authentication
- **Password Management**: Reset, change, and secure password handling
- **Email Verification**: Email verification system
- **Account Management**: Profile management and account deletion
- **Security Features**: Session management and security controls
- **Role-based Access**: Multi-role authorization system

---

## 🏗️ Architecture

### **System Components**

#### **1. Auth Routes** (`auth.routes.js`)
- **Route Definitions**: All authentication endpoints
- **Validation Middleware**: Input validation for all requests
- **Route Organization**: Grouped by functionality

#### **2. Auth Controller** (`auth.controller.js`)
- **Request Handling**: HTTP request processing
- **Validation**: Input validation and error handling
- **Response Management**: Standardized API responses

#### **3. Auth Service** (`auth.service.js`)
- **Business Logic**: Core authentication logic
- **Database Operations**: User data management
- **Security Operations**: Password hashing, token generation

#### **4. Auth Middleware** (`auth.middleware.js`)
- **Authentication**: Token verification
- **Authorization**: Role-based access control
- **Security**: Request security validation

### **Data Flow**
```
Client Request → Routes → Controller → Service → Database
                ↓         ↓         ↓
            Validation → Business → Security
                ↓         Logic      ↓
            Response ← Controller ← Service
```

---

## 🔌 API Endpoints

### **Authentication Routes**

#### **POST /api/auth/login**
```javascript
// Request
{
  "email": "user@example.com",
  "password": "password123"
}

// Response
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "customer"
  }
}
```

#### **POST /api/auth/register**
```javascript
// Request
{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "password123",
  "role": "customer"
}

// Response
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com",
    "role": "customer"
  }
}
```

#### **POST /api/auth/validate**
```javascript
// Headers
Authorization: Bearer <token>

// Response
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "customer"
  }
}
```

#### **POST /api/auth/logout**
```javascript
// Headers
Authorization: Bearer <token>

// Response
{
  "success": true,
  "message": "Logged out successfully"
}
```

### **Password Management Routes**

#### **POST /api/auth/forgot-password**
```javascript
// Request
{
  "email": "user@example.com"
}

// Response
{
  "success": true,
  "message": "Password reset link sent to your email"
}
```

#### **POST /api/auth/reset-password**
```javascript
// Request
{
  "token": "reset_token_here",
  "password": "newpassword123",
  "confirmPassword": "newpassword123"
}

// Response
{
  "success": true,
  "message": "Password reset successfully"
}
```

#### **POST /api/auth/change-password**
```javascript
// Headers
Authorization: Bearer <token>

// Request
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}

// Response
{
  "success": true,
  "message": "Password changed successfully"
}
```

### **Account Management Routes**

#### **GET /api/auth/profile**
```javascript
// Headers
Authorization: Bearer <token>

// Response
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com",
    "role": "customer",
    "created_at": "2024-01-15T10:30:00Z",
    "last_login": "2024-01-15T14:30:00Z"
  }
}
```

#### **PUT /api/auth/profile**
```javascript
// Headers
Authorization: Bearer <token>

// Request
{
  "name": "John Smith",
  "email": "johnsmith@example.com"
}

// Response
{
  "success": true,
  "message": "Profile updated successfully"
}
```

#### **DELETE /api/auth/account**
```javascript
// Headers
Authorization: Bearer <token>

// Response
{
  "success": true,
  "message": "Account deleted successfully"
}
```

### **Email Verification Routes**

#### **POST /api/auth/verify-email**
```javascript
// Request
{
  "token": "verification_token_here"
}

// Response
{
  "success": true,
  "message": "Email verified successfully"
}
```

#### **POST /api/auth/resend-verification**
```javascript
// Headers
Authorization: Bearer <token>

// Response
{
  "success": true,
  "message": "Verification email sent"
}
```

### **Security Routes**

#### **GET /api/auth/sessions**
```javascript
// Headers
Authorization: Bearer <token>

// Response
{
  "success": true,
  "sessions": [
    {
      "id": "current",
      "device": "Web Browser",
      "location": "Unknown",
      "lastActive": "2024-01-15T14:30:00Z",
      "current": true
    }
  ]
}
```

#### **POST /api/auth/revoke-session**
```javascript
// Headers
Authorization: Bearer <token>

// Request
{
  "sessionId": "session_id_here"
}

// Response
{
  "success": true,
  "message": "Session revoked successfully"
}
```

#### **POST /api/auth/revoke-all-sessions**
```javascript
// Headers
Authorization: Bearer <token>

// Response
{
  "success": true,
  "message": "All sessions revoked successfully"
}
```

### **Token Management Routes**

#### **POST /api/auth/refresh**
```javascript
// Request
{
  "refreshToken": "refresh_token_here"
}

// Response
{
  "success": true,
  "accessToken": "new_access_token",
  "expiresIn": "24h"
}
```

---

## 🛡️ Security Features

### **Password Security**

#### **Password Hashing**
```javascript
// bcrypt with 12 salt rounds
const saltRounds = 12;
const hashedPassword = await bcrypt.hash(password, saltRounds);
```

#### **Password Validation**
- **Minimum Length**: 6 characters
- **Confirmation**: Password confirmation required
- **Current Password**: Required for password changes

### **Token Security**

#### **JWT Configuration**
```javascript
const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
  expiresIn: '24h',
  algorithm: 'HS256'
};
```

#### **Token Types**
- **Access Token**: Short-lived (24h) for API access
- **Refresh Token**: Long-lived for token renewal
- **Reset Token**: Short-lived (1h) for password reset
- **Verification Token**: For email verification

### **Input Validation**

#### **Email Validation**
```javascript
body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
```

#### **Password Validation**
```javascript
body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
```

#### **Name Validation**
```javascript
body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
```

---

## 🗄️ Database Schema

### **Users Table**
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('customer', 'agent', 'manager', 'ceo', 'admin') DEFAULT 'customer',
  email_verified BOOLEAN DEFAULT FALSE,
  status ENUM('active', 'inactive', 'deleted') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  last_login TIMESTAMP NULL
);
```

### **Password Resets Table**
```sql
CREATE TABLE password_resets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### **Sessions Table** (Future Implementation)
```sql
CREATE TABLE user_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  device_info TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 🔧 Implementation Details

### **Error Handling**

#### **Custom Error Class**
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
```

#### **Error Response Format**
```javascript
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error information",
  "statusCode": 400
}
```

### **Validation Middleware**

#### **Express Validator Integration**
```javascript
const { body, validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};
```

### **Database Connection**

#### **MySQL Connection Pool**
```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

---

## 📝 Usage Examples

### **Frontend Integration**

#### **Login Implementation**
```javascript
const login = async (email, password) => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      localStorage.setItem('access_token', data.token);
      localStorage.setItem('userData', JSON.stringify(data.user));
      return data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};
```

#### **Protected API Calls**
```javascript
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = localStorage.getItem('access_token');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  if (response.status === 401) {
    // Token expired, redirect to login
    localStorage.removeItem('access_token');
    localStorage.removeItem('userData');
    window.location.href = '/login';
    return;
  }
  
  return response.json();
};
```

#### **Password Reset Flow**
```javascript
const resetPassword = async (email) => {
  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Password reset link sent to your email');
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Password reset failed:', error);
    throw error;
  }
};
```

### **Backend Integration**

#### **Route Protection**
```javascript
const express = require('express');
const authMiddleware = require('./auth.middleware');

const router = express.Router();

// Protected route
router.get('/protected', authMiddleware.authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
});

// Role-based protection
router.get('/admin-only', 
  authMiddleware.authenticateToken, 
  authMiddleware.authorizeRole('admin'), 
  (req, res) => {
    res.json({ message: 'Admin only route' });
  }
);
```

---

## 🔒 Security Best Practices

### **Password Security**
- **Strong Hashing**: Use bcrypt with 12+ salt rounds
- **Password Policy**: Enforce minimum length and complexity
- **Secure Storage**: Never store plain text passwords
- **Regular Updates**: Encourage password updates

### **Token Security**
- **Short Expiry**: Use short-lived access tokens
- **Secure Storage**: Store tokens securely on client
- **Token Rotation**: Implement token refresh mechanism
- **Revocation**: Support token revocation

### **Input Validation**
- **Server-side Validation**: Always validate on server
- **Sanitization**: Sanitize all inputs
- **Type Checking**: Validate data types
- **Length Limits**: Enforce reasonable limits

### **Database Security**
- **Prepared Statements**: Use parameterized queries
- **Connection Pooling**: Limit database connections
- **Access Control**: Restrict database access
- **Backup Strategy**: Regular secure backups

---

## 🔧 Troubleshooting

### **Common Issues**

#### **1. Token Expired**
```javascript
// Error Response
{
  "success": false,
  "message": "Invalid or expired token",
  "statusCode": 401
}

// Solution: Refresh token or re-authenticate
```

#### **2. Invalid Credentials**
```javascript
// Error Response
{
  "success": false,
  "message": "Invalid credentials",
  "statusCode": 401
}

// Solution: Check email/password or reset password
```

#### **3. Email Already Exists**
```javascript
// Error Response
{
  "success": false,
  "message": "User already exists",
  "statusCode": 409
}

// Solution: Use different email or login with existing account
```

#### **4. Validation Errors**
```javascript
// Error Response
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "msg": "Valid email is required",
      "param": "email",
      "location": "body"
    }
  ]
}

// Solution: Fix validation errors in request
```

### **Debug Tools**

#### **Enable Debug Logging**
```javascript
// Set environment variable
process.env.DEBUG = 'auth:*';

// Or enable specific logging
const debug = require('debug')('auth:service');
debug('Authentication attempt for user:', email);
```

#### **Token Debugging**
```javascript
// Decode JWT token (for debugging only)
const jwt = require('jsonwebtoken');
const decoded = jwt.decode(token, { complete: true });
console.log('Token payload:', decoded.payload);
```

---

## 🚀 Future Enhancements

### **Planned Features**

#### **Advanced Security**
- **Two-Factor Authentication**: SMS/Email 2FA
- **Biometric Authentication**: Fingerprint/Face ID
- **Device Management**: Device registration and management
- **Security Audit**: Login attempt monitoring

#### **Enhanced Features**
- **Social Login**: Google, Facebook, GitHub integration
- **Single Sign-On**: SSO with enterprise systems
- **Advanced Sessions**: Detailed session tracking
- **Rate Limiting**: API rate limiting and throttling

### **Technical Improvements**

#### **Performance**
- **Redis Caching**: Token and session caching
- **Database Optimization**: Query optimization
- **Connection Pooling**: Advanced connection management
- **Load Balancing**: Multi-instance support

#### **Monitoring**
- **Security Monitoring**: Real-time security alerts
- **Performance Metrics**: Authentication performance tracking
- **Error Tracking**: Comprehensive error monitoring
- **Audit Logging**: Complete audit trail

---

## 📞 Support & Maintenance

### **Documentation**
- **API Documentation**: Complete API reference
- **Integration Guides**: Step-by-step integration
- **Security Guidelines**: Security best practices
- **Troubleshooting**: Common issues and solutions

### **Maintenance**
- **Regular Updates**: Security patches and updates
- **Performance Monitoring**: Continuous monitoring
- **Security Audits**: Regular security assessments
- **Backup Strategy**: Data backup and recovery

---

## 📝 Conclusion

The Enhanced Authentication System provides a robust, secure, and scalable authentication solution for modern web applications. With its comprehensive feature set, strong security measures, and flexible architecture, it serves as a solid foundation for user authentication and authorization.

The system's modular design ensures easy maintenance and extension, while its security-first approach guarantees protection against common authentication vulnerabilities. Regular updates and monitoring ensure the system remains secure and performant.

For technical support, integration assistance, or security questions, please refer to the support channels outlined in this documentation.

---

**Last Updated**: January 2024  
**Version**: 2.0.0  
**Maintainer**: Development Team  
**Security Level**: Production Ready
