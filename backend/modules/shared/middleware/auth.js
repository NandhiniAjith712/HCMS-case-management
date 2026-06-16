const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../database/database');

// Permission matrix for all roles
const permissions = {
  super_admin: [
    'view_all_data',
    'manage_tenants',
    'view_analytics',
    'view_reports',
    'view_business_intelligence',
    'view_performance_metrics',
    'manage_platform_settings'
  ],
  support_agent: [
    'view_assigned_tickets',
    'reply_to_tickets',
    'update_ticket_status',
    'send_whatsapp_notifications',
    'view_customer_history'
  ],
  support_manager: [
    'view_all_tickets',
    'assign_tickets',
    'rate_performance',
    'view_analytics',
    'generate_reports',
    'escalate_tickets',
    'manage_agents'
  ],
  ceo: [
    'view_all_data',
    'view_analytics',
    'view_reports',
    'view_business_intelligence',
    'view_performance_metrics',
    'manage_products',
    'manage_sla',
    'manage_agents',
    'manage_departments',
    'manage_workflows'
  ],
  user: [
    'view_assigned_tickets',
    'reply_to_tickets',
    'update_ticket_status',
    'send_whatsapp_notifications',
    'view_customer_history'
  ],
  org_spoc: [
    'view_assigned_tickets',
    'reply_to_tickets',
    'update_ticket_status',
    'send_whatsapp_notifications',
    'view_customer_history',
    'manage_product_spocs'
  ],
  product_spoc: [
    'view_assigned_tickets',
    'reply_to_tickets',
    'update_ticket_status',
    'send_whatsapp_notifications',
    'view_customer_history'
  ]
};

// Authenticate JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Strict behavior: any invalid/expired/malformed token must return 401.
    // jwt.verify will throw for expiry (TokenExpiredError) and invalid tokens (JsonWebTokenError).
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    
    console.log('🔍 Debug - JWT decoded:', decoded);
    
    // Business Dashboard: token issued on password verification, no DB lookup needed
    if (decoded.role === 'business_dashboard') {
      req.user = {
        id: 0,
        agentId: 0,
        email: 'business@dashboard',
        name: 'Business Dashboard',
        role: 'business_dashboard',
        tenant_id: decoded.tenant_id || 1,
        department: 'Business',
        permissions: ['view_all_data', 'view_analytics', 'manage_products', 'manage_sla', 'manage_agents']
      };
      return next();
    }
    
    // Get user ID from token (handle userId, id, and agentId fields)
    const userId = decoded.userId || decoded.id || decoded.agentId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - no user ID found'
      });
    }
    
    const decodedRole = (decoded.role || '').toLowerCase();
    const roleLooksCustomer = ['user', 'customer', 'org_spoc', 'product_spoc'].includes(decodedRole);
    const roleLooksStaff = ['support_agent', 'support_manager', 'ceo', 'admin', 'super_admin', 'agent', 'manager'].includes(decodedRole);

    const fetchAgentById = async () => {
      const [agents] = await pool.execute(
        'SELECT id, name, email, role, tenant_id, department, primary_department_id, manager_id FROM agents WHERE id = ? AND is_active = TRUE',
        [userId]
      );
      return agents[0] || null;
    };

    const fetchUserById = async () => {
      const [users] = await pool.execute(
        'SELECT id, email, name, role, department, manager_id, is_active, tenant_id, product_scope_id FROM users WHERE id = ? AND is_active = TRUE',
        [userId]
      );
      return users[0] || null;
    };

    // Use token role to avoid users/agents ID collision issues.
    let agent = null;
    let user = null;
    if (roleLooksCustomer) {
      user = await fetchUserById();
      if (!user) agent = await fetchAgentById(); // fallback safety
    } else if (roleLooksStaff) {
      agent = await fetchAgentById();
      if (!agent) user = await fetchUserById(); // fallback safety
    } else {
      // Unknown role in token: preserve old behavior with staff-first lookup
      agent = await fetchAgentById();
      if (!agent) user = await fetchUserById();
    }

    if (agent) {
      console.log('🔍 Debug - Agent found:', agent);
      req.user = {
        id: agent.id,
        agentId: agent.id,
        email: agent.email,
        name: agent.name,
        role: agent.role || 'support_agent',
        tenant_id: agent.tenant_id,
        department: agent.department || 'IT Support',
        primary_department_id: agent.primary_department_id,
        primaryDeptId: agent.primary_department_id,
        managerId: agent.manager_id,
        product_scope_id: agent.product_scope_id,
        permissions: permissions[agent.role] || permissions['support_agent'] || []
      };
    } else if (user) {
      console.log('🔍 Debug - User found:', user);
      let mappedAgentId = null;
      let mappedPrimaryDeptId = null;
      let mappedManagerId = null;
      let mappedDepartment = user.department;
      
      const userRole = (user.role || '').toLowerCase();
      const isStaffUser = ['support_agent', 'support_manager', 'ceo', 'admin', 'agent', 'manager'].includes(userRole);
      if (isStaffUser && user.email) {
        try {
          const [agentRows] = await pool.execute(
            'SELECT id, department, primary_department_id, manager_id FROM agents WHERE email = ? AND tenant_id = ? AND is_active = TRUE LIMIT 1',
            [user.email, user.tenant_id]
          );
          if (agentRows.length > 0) {
            mappedAgentId = agentRows[0].id;
            mappedPrimaryDeptId = agentRows[0].primary_department_id;
            mappedManagerId = agentRows[0].manager_id;
            if (agentRows[0].department) {
              mappedDepartment = agentRows[0].department;
            }
          }
        } catch (mapErr) {
          console.warn('⚠️ Could not map staff user to agents.id:', mapErr?.message);
        }
      }
      req.user = {
        id: isStaffUser ? (mappedAgentId || user.id) : user.id,
        agentId: mappedAgentId,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant_id: user.tenant_id,
        department: mappedDepartment || 'IT Support',
        primary_department_id: mappedPrimaryDeptId,
        primaryDeptId: mappedPrimaryDeptId,
        managerId: mappedManagerId || user.manager_id,
        product_scope_id: user.product_scope_id,
        permissions: permissions[user.role] || []
      };
    } else {
      console.log('❌ Debug - User not found in either table for ID:', userId);
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive user'
      });
    }

    console.log('🔍 Debug - Final req.user:', req.user);
    next();
  } catch (error) {
    const name = String(error?.name || '');
    const isJwtFailure = name === 'TokenExpiredError' || name === 'JsonWebTokenError' || name === 'NotBeforeError';
    if (isJwtFailure) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    console.error('❌ Authentication error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Authorize specific role
const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Check specific permission
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }

    next();
  };
};

// Check if user can access ticket
const canAccessTicket = async (req, res, next) => {
  try {
    const ticketId = req.params.id || req.body.ticketId;
    if (!ticketId) {
      return next();
    }

    const [tickets] = await pool.execute(
      'SELECT user_id, assigned_to, tenant_id, product_id FROM tickets WHERE id = ?',
      [ticketId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket = tickets[0];
    
    // Handle role mapping: support_agent in agents table maps to 'user' in users table
    const isSupportExecutive = req.user.role === 'support_agent' || 
                              (req.user.role === 'user' && req.user.agentId); // Check if user has agentId (indicating they're a support executive)
    
    const role = String(req.user.role || '').toLowerCase();
    
    let canAccess = false;
    if (role === 'admin' || role === 'ceo' || role === 'support_manager') {
      canAccess = true;
    } else if (isSupportExecutive) {
      canAccess = ticket.assigned_to === req.user.id;
    } else if (role === 'org_spoc') {
      canAccess = Number(ticket.tenant_id || 0) === Number(req.user.tenant_id || 1);
    } else if (role === 'product_spoc') {
      canAccess = Number(ticket.tenant_id || 0) === Number(req.user.tenant_id || 1) && 
                  Number(ticket.product_id || 0) === Number(req.user.product_scope_id || 0);
    } else {
      canAccess = ticket.user_id === req.user.id;
    }

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this ticket'
      });
    }

    req.ticket = ticket;
    next();
  } catch (error) {
    console.error('Ticket access check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking ticket access'
    });
  }
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id, // ✅ Add tenant_id to token
      department: user.department,
      managerId: user.manager_id
    },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '42h' }
  );
};

// Generate token for Business Dashboard (password-only auth, no DB user)
const generateBusinessDashboardToken = (tenantId = 1) => {
  return jwt.sign(
    {
      userId: 0,
      role: 'business_dashboard',
      tenant_id: tenantId
    },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '24h' }
  );
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

module.exports = {
  authenticateToken,
  authorizeRole,
  checkPermission,
  canAccessTicket,
  generateToken,
  generateBusinessDashboardToken,
  hashPassword,
  comparePassword,
  permissions
}; 
