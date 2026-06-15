const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('../../services/emailService');
const accountLifecycleService = require('../../services/accountLifecycleService');

const router = express.Router();

// Validation middleware
const validateUserRegistration = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['user', 'agent', 'manager', 'ceo', 'business_team']).withMessage('Invalid role'),
  body('department').optional(),
  body('manager_id').optional(),
  body('public_domain_acknowledged').optional().isBoolean().withMessage('public_domain_acknowledged must be boolean')
];

const validateUserLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

// Helper function to hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Helper function to compare password
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Helper function to generate JWT token
const generateToken = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenant_id: user.tenant_id
  };

  // Add product_scope_id if it exists (for product_spoc agents)
  if (user.product_scope_id) {
    payload.product_scope_id = user.product_scope_id;
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '42h' }
  );
};

// GET /api/users - Get users with optional role filter
router.get('/', async (req, res) => {
  try {
    let query = `SELECT
      id, name, email, phone, created_at, user_type,
      email_verified, email_verified_at, account_status,
      is_public_domain_email, public_domain_acknowledged, public_domain_acknowledged_at
      FROM users ORDER BY name ASC`;

    const [users] = await pool.execute(query);

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// POST /api/users/register - Register new user
router.post('/register', validateUserRegistration, async (req, res) => {
  try {
    console.log('🔍 User registration request body:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, role = 'user', department = null, manager_id = null, public_domain_acknowledged } = req.body;
    accountLifecycleService.assertPublicDomainAck(email, !!public_domain_acknowledged);

    console.log('📝 Parsed data:', { name, email, role, department, manager_id });

    // Convert manager_id to integer or null
    const managerId = manager_id ? parseInt(manager_id) : null;
    console.log('🔢 Manager ID converted:', managerId);

    // Clean up department - convert empty string to null
    const cleanDepartment = department && department.trim() ? department.trim() : null;
    console.log('🏢 Department cleaned:', cleanDepartment);

    // Check if user already exists by email in users table
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      console.log('⚠️ User already exists:', existingUsers);
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Get or create default tenant for new users
    let tenantId = 1; // Default to tenant 1
    try {
      const [tenants] = await pool.execute(
        'SELECT id FROM tenants WHERE subdomain = \'default\' AND status = \'active\' LIMIT 1'
      );
      if (tenants.length > 0) {
        tenantId = tenants[0].id;
      } else {
        // If no default tenant, get the first active tenant
        const [firstTenant] = await pool.execute(
          'SELECT id FROM tenants WHERE status = \'active\' LIMIT 1'
        );
        if (firstTenant.length > 0) {
          tenantId = firstTenant[0].id;
        }
      }
      console.log(`🏢 Assigning user to tenant_id: ${tenantId}`);
    } catch (error) {
      console.warn('⚠️ Could not determine tenant, using default tenant_id: 1');
    }

    // Create customer user in users table with tenant_id and password_hash
    const lifecycleState = accountLifecycleService.buildLifecycleState(email, !!public_domain_acknowledged);
    const [result] = await pool.execute(
      `INSERT INTO users (
         name, email, phone, password_hash, tenant_id, created_at, user_type, is_active,
         email_verified, email_verified_at, account_status,
         is_public_domain_email, public_domain_acknowledged, public_domain_acknowledged_at
       ) VALUES (?, ?, ?, ?, ?, NOW(), 'customer', ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        null,
        hashedPassword,
        tenantId,
        lifecycleState.is_active,
        lifecycleState.email_verified,
        lifecycleState.email_verified_at,
        lifecycleState.account_status,
        lifecycleState.is_public_domain_email,
        lifecycleState.public_domain_acknowledged,
        lifecycleState.public_domain_acknowledged_at
      ]
    );

    console.log('✅ User created with ID:', result.insertId);

    // Get created customer user
    const [newUsers] = await pool.execute(
      'SELECT id, name, email, phone, created_at, user_type FROM users WHERE id = ?',
      [result.insertId]
    );

    try {
      const { token, expiresAt } = await accountLifecycleService.issueVerificationToken(result.insertId);
      const appUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
      const verificationLink = `${appUrl}/customer-access?verify_token=${encodeURIComponent(token)}`;
      await emailService.sendEmailVerificationEmail(email, name, verificationLink, expiresAt);
    } catch (mailErr) {
      console.warn('⚠️ Could not send verification email for /api/users/register:', mailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email to activate your account.',
      requiresEmailVerification: true,
      data: newUsers[0]
    });
  } catch (error) {
    console.error('❌ User registration error:', error);
    res.status(500).json({
      success: false,
      message: 'User registration failed: ' + error.message
    });
  }
});

// POST /api/users/login - User login with email and password
router.post('/login', validateUserLogin, async (req, res) => {
  try {
    console.log('🔍 User login request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    console.log('📝 Login attempt for:', { email, passwordLength: password.length });

    // First check users table (for regular users)
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    console.log('🔍 Found users in users table:', users.length);

    let user = null;
    let isAgent = false;

    if (users.length > 0) {
      user = users[0];
      console.log('👤 User found in users table:', { id: user.id, name: user.name, email: user.email, is_active: user.is_active });

      // Check if user is active
      if (!user.is_active) {
        console.log('❌ User is not active:', user.email);
        return res.status(401).json({
          success: false,
          message: 'User account is not active'
        });
      }

      if (!user.email_verified || user.account_status === 'pending_verification') {
        return res.status(403).json({
          success: false,
          requiresEmailVerification: true,
          message: 'Email is not verified. Please verify your email before login.'
        });
      }

      // Check if user has password hash
      if (!user.password_hash) {
        console.log('❌ User has no password hash:', user.email);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
    } else {
      // If not found in users table, check agents table (for agents, managers, ceo, org_spoc, product_spoc)
      const [agents] = await pool.execute(
        'SELECT * FROM agents WHERE email = ?',
        [email]
      );
      console.log('🔍 Found agents in agents table:', agents.length);

      if (agents.length === 0) {
        console.log('❌ No user or agent found with email:', email);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      user = agents[0];
      isAgent = true;
      console.log('👤 Agent found in agents table:', { id: user.id, name: user.name, email: user.email, role: user.role, is_active: user.is_active });

      // Check if agent is active
      if (!user.is_active) {
        console.log('❌ Agent is not active:', user.email);
        return res.status(401).json({
          success: false,
          message: 'Agent account is not active'
        });
      }

      // Check if agent has password hash
      if (!user.password_hash) {
        console.log('❌ Agent has no password hash:', user.email);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
    }

    // Validate password
    const isValidPassword = await comparePassword(password, user.password_hash);
    console.log('🔐 Password validation:', isValidPassword);

    if (!isValidPassword) {
      console.log('❌ Invalid password for:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    if (isAgent) {
      await pool.execute(
        'UPDATE agents SET last_login = NOW() WHERE id = ?',
        [user.id]
      );
    } else {
      await pool.execute(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [user.id]
      );
    }

    // Generate JWT token
    const token = generateToken(user);

    // Return user data (without password)
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      manager_id: user.manager_id,
      is_active: user.is_active,
      created_at: user.created_at,
      last_login: user.last_login
    };

    console.log('✅ Login successful for user:', user.name);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token
      }
    });
  } catch (error) {
    console.error('❌ User login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  }
});

// POST /api/users/login-by-email - Customer login with email only
router.post('/login-by-email', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    console.log('🔍 Customer email-only login request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;
    console.log('📝 Login attempt for email:', email);

    return res.status(410).json({
      success: false,
      message: 'Email-only login is deprecated. Please use Customer Access with password and email verification.'
    });
  } catch (error) {
    console.error('❌ Customer login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  }
});

// GET /api/users/profile - Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');

    const [users] = await pool.execute(
      'SELECT id, name, email, role, department, manager_id, is_active, created_at, last_login FROM agents WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// PUT /api/users/profile - Update user profile
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    const { name, department } = req.body;

    const [result] = await pool.execute(
      'UPDATE users SET name = ?, department = ?, updated_at = NOW() WHERE id = ?',
      [name, department, decoded.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user profile'
    });
  }
});

// POST /api/users/logout - User logout
router.post('/logout', async (req, res) => {
  try {
    // In a real application, you might want to blacklist the token
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// PUT /api/users/:id/notification-preferences - Update user's notification preferences
router.put('/:id/notification-preferences', async (req, res) => {
  try {
    const { id } = req.params;
    const { email_notifications } = req.body;

    // Validate inputs
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (typeof email_notifications !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'email_notifications must be a boolean value'
      });
    }

    // Check if user exists
    const [users] = await pool.execute(
      'SELECT id, email FROM agents WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update notification preferences
    await pool.execute(
      'UPDATE users SET email_notifications = ? WHERE id = ?',
      [email_notifications, id]
    );

    console.log(`✅ Updated notification preferences for user ${users[0].email}: email_notifications = ${email_notifications}`);

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        user_id: id,
        email_notifications: email_notifications
      }
    });

  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/users/:id/notification-preferences - Get user's notification preferences
router.get('/:id/notification-preferences', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate inputs
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Get user's notification preferences
    const [users] = await pool.execute(
      'SELECT id, email, name, email_notifications FROM agents WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    res.json({
      success: true,
      data: {
        user_id: user.id,
        email: user.email,
        name: user.name,
        email_notifications: user.email_notifications
      }
    });

  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 