# 🔐 Authentication & Authorization System

## 📋 Table of Contents
- [Authentication Overview](#authentication-overview)
- [User Types & Roles](#user-types--roles)
- [Authentication Flow](#authentication-flow)
- [Authorization System](#authorization-system)
- [Security Implementation](#security-implementation)
- [Session Management](#session-management)
- [API Security](#api-security)

---

## 🎯 Authentication Overview

### **Multi-Tier Authentication System**

The Tick System implements a sophisticated authentication system that handles multiple user types with different access levels and security requirements.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (MySQL)       │
│                 │    │                 │    │                 │
│ • Login Forms   │    │ • JWT Tokens    │    │ • User Data     │
│ • Route Guards  │    │ • Role Mapping  │    │ • Role Storage   │
│ • State Mgmt    │    │ • Validation    │    │ • Sessions      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **Authentication Architecture**

#### **1. Dual Table System**
```sql
-- Customers (Limited Access)
users table:
├── role: 'user' (customers only)
├── Access: Own tickets only
└── Features: Submit tickets, view status

-- Staff (Full Access)  
agents table:
├── role: 'support_agent' | 'support_manager' | 'ceo'
├── Access: System-wide access
└── Features: Manage tickets, analytics, admin functions
```

#### **2. Global Login System**
```javascript
// Single login endpoint handles all user types
POST /api/auth/global-login
{
  "login_id": "hey248",     // Can be email, name, or login_id
  "password": "password123"
}
```

---

## 👥 User Types & Roles

### **Customer (users table)**

#### **Role Definition**
- **Database Role**: `'user'`
- **Frontend Role**: `'user'`
- **Access Level**: Limited
- **Dashboard**: `/userdashboard`

#### **Capabilities**
```javascript
const customerCapabilities = {
  tickets: {
    create: true,           // Submit new tickets
    read: 'own_only',      // View own tickets only
    update: 'own_only',    // Update own tickets
    delete: false          // Cannot delete tickets
  },
  communication: {
    chat: 'own_tickets',   // Chat on own tickets
    replies: 'own_tickets' // Reply to own tickets
  },
  system: {
    profile: 'own_only',   // View own profile
    settings: 'own_only'   // Manage own settings
  }
};
```

#### **Authentication Flow**
```javascript
// Customer login validation
if (userType === 'user') {
  // Must be in users table with role 'user'
  if (user.role === 'user' || !user.role) {
    // Valid customer
    dashboardType = 'user';
    redirectTo = '/userdashboard';
  }
}
```

### **Support Executive (agents table)**

#### **Role Definition**
- **Database Role**: `'agent'` or `'support_agent'`
- **Frontend Role**: `'support_agent'`
- **Access Level**: Agent-level
- **Dashboard**: `/agentdashboard`

#### **Capabilities**
```javascript
const agentCapabilities = {
  tickets: {
    create: true,                    // Create tickets for customers
    read: 'assigned_only',          // View assigned tickets
    update: 'assigned_only',        // Update assigned tickets
    delete: false,                  // Cannot delete tickets
    assign: 'self_only'             // Can assign to self
  },
  communication: {
    chat: 'assigned_tickets',       // Chat on assigned tickets
    replies: 'assigned_tickets',    // Reply to assigned tickets
    internal_notes: true           // Add internal notes
  },
  system: {
    profile: 'own_only',           // View own profile
    performance: 'own_only',       // View own performance
    settings: 'own_only'           // Manage own settings
  }
};
```

#### **Role Mapping**
```javascript
// Database role → Frontend role mapping
if (userType === 'agent') {
  if (user.role === 'agent' || !user.role) {
    mappedRole = 'support_agent';  // Default agent role
  } else if (user.role === 'manager') {
    mappedRole = 'support_manager';   // Manager role
  }
  // ceo role stays the same
}
```

### **Support Manager (agents table)**

#### **Role Definition**
- **Database Role**: `'manager'` or `'support_manager'`
- **Frontend Role**: `'support_manager'`
- **Access Level**: Manager-level
- **Dashboard**: `/managerdashboard`

#### **Capabilities**
```javascript
const managerCapabilities = {
  tickets: {
    create: true,                    // Create tickets
    read: 'team_tickets',           // View team tickets
    update: 'team_tickets',         // Update team tickets
    delete: false,                  // Cannot delete tickets
    assign: 'team_members',         // Assign to team members
    escalate: true                  // Escalate tickets
  },
  team: {
    view_performance: 'team_only',  // View team performance
    manage_workload: 'team_only',   // Manage team workload
    approve_time_off: true          // Approve time off
  },
  analytics: {
    team_metrics: true,             // View team metrics
    sla_reports: true,              // SLA compliance reports
    performance_trends: true        // Performance trends
  }
};
```

### **CEO/Executive (agents table)**

#### **Role Definition**
- **Database Role**: `'ceo'`
- **Frontend Role**: `'ceo'`
- **Access Level**: Executive-level
- **Dashboard**: `/ceodashboard`

#### **Capabilities**
```javascript
const ceoCapabilities = {
  system: {
    full_access: true,              // Full system access
    user_management: true,          // Manage all users
    system_configuration: true,    // Configure system
    data_export: true              // Export all data
  },
  analytics: {
    company_metrics: true,         // Company-wide metrics
    department_performance: true,   // Department performance
    roi_analysis: true,            // ROI analysis
    strategic_insights: true       // Strategic insights
  },
  management: {
    approve_budget: true,          // Approve budgets
    set_policies: true,            // Set company policies
    manage_departments: true       // Manage departments
  }
};
```

---

## 🔄 Authentication Flow

### **1. Login Process**

#### **Frontend Login Flow**
```javascript
// 1. User submits credentials
const loginData = {
  login_id: "hey248",      // Can be email, name, or login_id
  password: "password123"
};

// 2. Send to global login endpoint
const response = await fetch('/api/auth/global-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(loginData)
});

// 3. Handle response
if (response.success) {
  const { user, token, dashboard_type } = response.data;
  
  // 4. Store authentication data
  localStorage.setItem('userData', JSON.stringify(user));
  localStorage.setItem('userToken', token);
  localStorage.setItem('is_logged_in', 'true');
  
  // 5. Redirect to appropriate dashboard
  navigate(`/${dashboard_type}dashboard`);
}
```

#### **Backend Authentication Logic**
```javascript
// 1. Check agents table first (staff members)
let [agents] = await pool.execute(
  'SELECT * FROM agents WHERE email = ? OR login_id = ? OR name = ?',
  [login_id, login_id, login_id]
);

// 2. If not found, check users table (customers)
if (agents.length === 0) {
  let [users] = await pool.execute(
    'SELECT * FROM users WHERE email = ? OR name = ?',
    [login_id, login_id]
  );
  
  // 3. Validate customer role
  if (users.length > 0) {
    const customer = users[0];
    if (customer.role === 'user' || !customer.role) {
      // Valid customer
      user = customer;
      userType = 'user';
    } else {
      // Staff role in users table - should be in agents table
      return res.status(401).json({
        success: false,
        message: 'Invalid Login ID or Password'
      });
    }
  }
}

// 4. Verify password
const isPasswordValid = await bcrypt.compare(password, user.password_hash);
if (!isPasswordValid) {
  return res.status(401).json({
    success: false,
    message: 'Invalid Login ID or Password'
  });
}

// 5. Generate JWT token
const token = generateToken(user);

// 6. Return user data with role mapping
const userData = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: mappedRole,           // Mapped role for frontend
  dashboard_type: dashboardType,
  user_type: userType
};
```

### **2. Role Mapping Process**

#### **Database → Frontend Role Mapping**
```javascript
const mapRoleForFrontend = (user, userType) => {
  let mappedRole = user.role;
  
  if (userType === 'agent') {
    // Map agent roles to frontend-expected roles
    if (user.role === 'agent' || !user.role) {
      mappedRole = 'support_agent';  // Default agent role
    } else if (user.role === 'manager') {
      mappedRole = 'support_manager';    // Manager role
    }
    // ceo role stays the same
  }
  
  return mappedRole;
};

const determineDashboardType = (mappedRole) => {
  if (['support_agent', 'support_manager', 'ceo', 'admin'].includes(mappedRole)) {
    return 'staff';
  }
  return 'user';
};
```

### **3. Dashboard Routing**

#### **Frontend Route Protection**
```javascript
const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('userData'));
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Check if user is staff member
  const isStaffMember = user.role && 
    ['support_agent', 'support_manager', 'ceo', 'admin'].includes(user.role);
  
  if (!isStaffMember) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Route configuration
<Route path="/agentdashboard" element={
  <ProtectedRoute>
    <AgentDashboard />
  </ProtectedRoute>
} />
```

---

## 🛡️ Authorization System

### **1. Route-Level Authorization**

#### **Protected Routes**
```javascript
// Customer routes
<Route path="/userdashboard" element={<UserDashboard />} />

// Staff routes (protected)
<Route path="/agentdashboard" element={
  <ProtectedRoute requiredRole="support_agent">
    <AgentDashboard />
  </ProtectedRoute>
} />

<Route path="/managerdashboard" element={
  <ProtectedRoute requiredRole="support_manager">
    <ManagerDashboard />
  </ProtectedRoute>
} />

<Route path="/ceodashboard" element={
  <ProtectedRoute requiredRole="ceo">
    <CEODashboard />
  </ProtectedRoute>
} />
```

#### **Role-Based Component Access**
```javascript
const ProtectedRoute = ({ children, requiredRole }) => {
  const user = JSON.parse(localStorage.getItem('userData'));
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Check specific role requirement
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return children;
};
```

### **2. API-Level Authorization**

#### **Middleware Implementation**
```javascript
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};
```

#### **Protected API Endpoints**
```javascript
// Agent-only endpoints
router.get('/tickets/assigned', 
  authenticateToken, 
  authorizeRole(['support_agent']), 
  getAssignedTickets
);

// Manager-only endpoints
router.get('/team/performance', 
  authenticateToken, 
  authorizeRole(['support_manager', 'ceo']), 
  getTeamPerformance
);

// CEO-only endpoints
router.get('/analytics/company', 
  authenticateToken, 
  authorizeRole(['ceo']), 
  getCompanyAnalytics
);
```

### **3. Data-Level Authorization**

#### **Row-Level Security**
```javascript
// Customers can only access their own tickets
const getCustomerTickets = async (req, res) => {
  const userId = req.user.id;
  const [tickets] = await pool.execute(
    'SELECT * FROM tickets WHERE user_id = ?',
    [userId]
  );
  res.json(tickets);
};

// Agents can only access assigned tickets
const getAgentTickets = async (req, res) => {
  const agentId = req.user.id;
  const [tickets] = await pool.execute(
    'SELECT * FROM tickets WHERE assigned_to = ?',
    [agentId]
  );
  res.json(tickets);
};

// Managers can access team tickets
const getManagerTickets = async (req, res) => {
  const managerId = req.user.id;
  const [tickets] = await pool.execute(`
    SELECT t.* FROM tickets t
    JOIN agents a ON t.assigned_to = a.id
    WHERE a.manager_id = ?
  `, [managerId]);
  res.json(tickets);
};
```

---

## 🔒 Security Implementation

### **1. Password Security**

#### **Password Hashing**
```javascript
const bcrypt = require('bcryptjs');

// Hash password during registration
const hashPassword = async (password) => {
  const saltRounds = 12;  // Industry standard
  return await bcrypt.hash(password, saltRounds);
};

// Verify password during login
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
```

#### **Password Requirements**
```javascript
const validatePassword = (password) => {
  const requirements = {
    minLength: 6,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumbers: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };
  
  return Object.values(requirements).every(req => req === true);
};
```

### **2. JWT Token Security**

#### **Token Generation**
```javascript
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id,
      email: user.email,
      role: user.role,
      userType: user.userType
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: '24h',        // Token expires in 24 hours
      issuer: 'tick-system',    // Token issuer
      audience: 'tick-system'  // Token audience
    }
  );
};
```

#### **Token Validation**
```javascript
const validateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};
```

### **3. Input Validation**

#### **Express Validator Middleware**
```javascript
const { body, validationResult } = require('express-validator');

const validateLogin = [
  body('login_id').notEmpty().withMessage('Login ID is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['user', 'agent', 'manager', 'ceo']).withMessage('Invalid role')
];
```

#### **SQL Injection Prevention**
```javascript
// ❌ Vulnerable to SQL injection
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Safe parameterized query
const [users] = await pool.execute(
  'SELECT * FROM users WHERE email = ?',
  [email]
);
```

---

## 📱 Session Management

### **1. Client-Side Session Storage**

#### **LocalStorage Management**
```javascript
const sessionManager = {
  // Store authentication data
  setSession: (userData, token) => {
    localStorage.setItem('userData', JSON.stringify(userData));
    localStorage.setItem('userToken', token);
    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('login_timestamp', new Date().toISOString());
    localStorage.setItem('session_expires', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
  },
  
  // Retrieve authentication data
  getSession: () => {
    const userData = localStorage.getItem('userData');
    const token = localStorage.getItem('userToken');
    const isLoggedIn = localStorage.getItem('is_logged_in');
    
    if (userData && token && isLoggedIn === 'true') {
      return {
        user: JSON.parse(userData),
        token: token,
        isLoggedIn: true
      };
    }
    return null;
  },
  
  // Clear session data
  clearSession: () => {
    localStorage.removeItem('userData');
    localStorage.removeItem('userToken');
    localStorage.removeItem('is_logged_in');
    localStorage.removeItem('session_expires');
    localStorage.removeItem('login_timestamp');
  },
  
  // Check session validity
  isSessionValid: () => {
    const expires = localStorage.getItem('session_expires');
    if (!expires) return false;
    
    return new Date() < new Date(expires);
  }
};
```

### **2. Auto-Login System**

#### **Session Persistence**
```javascript
const handleAutoLogin = async () => {
  const session = sessionManager.getSession();
  
  if (session && sessionManager.isSessionValid()) {
    // Valid session exists, auto-login user
    const userData = session.user;
    
    // Update App.js state
    setUser(userData);
    setIsAutoLoginInProgress(false);
    
    // Redirect to appropriate dashboard
    const dashboardPath = `/${userData.dashboard_type}dashboard`;
    navigate(dashboardPath, { replace: true });
  } else {
    // Invalid or expired session
    sessionManager.clearSession();
    setIsAutoLoginInProgress(false);
  }
};
```

### **3. Session Timeout**

#### **Automatic Logout**
```javascript
const checkSessionTimeout = () => {
  const expires = localStorage.getItem('session_expires');
  
  if (expires && new Date() > new Date(expires)) {
    // Session expired
    sessionManager.clearSession();
    navigate('/login');
    alert('Your session has expired. Please log in again.');
  }
};

// Check session timeout every minute
setInterval(checkSessionTimeout, 60000);
```

---

## 🔌 API Security

### **1. CORS Configuration**

#### **Cross-Origin Resource Sharing**
```javascript
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from frontend
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

### **2. Rate Limiting**

#### **API Rate Limiting**
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/global-login', loginLimiter);
```

### **3. Security Headers**

#### **Helmet.js Security**
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

---

## 🎯 Authentication System Benefits

### **For Security**
- **Multi-layer protection** with JWT tokens and role-based access
- **Secure password storage** with bcrypt hashing
- **SQL injection prevention** with parameterized queries
- **Session management** with automatic timeout

### **For User Experience**
- **Single login endpoint** for all user types
- **Automatic session persistence** with auto-login
- **Role-based dashboards** with appropriate access
- **Seamless navigation** between different user interfaces

### **For Developers**
- **Clear separation** between customers and staff
- **Modular authentication** with reusable components
- **Comprehensive validation** with express-validator
- **Easy role management** with flexible role mapping

### **For Business**
- **Scalable authentication** that grows with business
- **Compliance-ready** with proper audit trails
- **Cost-effective** with efficient session management
- **Secure by design** with industry-standard practices

---

*This authentication system provides a robust, secure, and user-friendly foundation for the Tick System's multi-role access control.*
