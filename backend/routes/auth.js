const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database');
const {
  authenticateToken,
  authorizeRole,
  generateToken,
  generateBusinessDashboardToken,
  hashPassword,
  comparePassword
} = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const emailService = require('../services/emailService');
const accountLifecycleService = require('../services/accountLifecycleService');

const router = express.Router();

// Validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['user', 'agent', 'manager', 'ceo']).withMessage('Invalid role'),
  body('department').optional().trim().isLength({ max: 100 }).withMessage('Department must be less than 100 characters'),
  body('public_domain_acknowledged').optional().isBoolean().withMessage('public_domain_acknowledged must be boolean')
];

const sendVerificationForUser = async (userId, email, name) => {
  const { token, expiresAt } = await accountLifecycleService.issueVerificationToken(userId);
  const appUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  const verificationLink = `${appUrl}/customer-access?verify_token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  return emailService.sendEmailVerificationEmail(email, name, verificationLink, expiresAt);
};

const resolveCustomerAccessState = (user) => {
  if (!user) return 'NEW_USER_CREATE_PASSWORD';
  const hasPassword = !!(user.password_hash && String(user.password_hash).trim());
  const isVerified = !!user.email_verified;
  const status = String(user.account_status || '').trim().toLowerCase();
  if (!isVerified || status === 'pending_verification') return 'PENDING_EMAIL_VERIFICATION';
  if (!hasPassword) return 'NEW_USER_CREATE_PASSWORD';
  return 'LOGIN_REQUIRED';
};

// POST /api/auth/login - User login
router.post('/login', validateLogin, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email (now using agents table)
    const [users] = await pool.execute(
      'SELECT * FROM agents WHERE email = ? AND is_active = TRUE',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

    // Check password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await pool.execute(
      'UPDATE agents SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Generate JWT token
    const token = generateToken(user);

    // Return user data (without password)
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      managerId: user.manager_id,
      lastLogin: user.last_login
    };

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// POST /api/auth/business-dashboard - Business Dashboard password-only auth (no staff login required)
router.post('/business-dashboard', async (req, res) => {
  try {
    const { password } = req.body;
    const expectedPassword = process.env.BUSINESS_DASHBOARD_PASSWORD || 'vdata1234';

    if (!password || password !== expectedPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    const tenantId = parseInt(process.env.DEFAULT_TENANT_ID || '1', 10);
    const token = generateBusinessDashboardToken(tenantId);

    res.json({
      success: true,
      message: 'Authentication successful',
      data: {
        token,
        user: {
          role: 'business_dashboard',
          tenant_id: tenantId,
          name: 'Business Dashboard'
        }
      }
    });
  } catch (error) {
    console.error('Business dashboard auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
});

// POST /api/auth/register - User registration (manager/ceo only)
router.post('/register', authenticateToken, authorizeRole(['manager', 'ceo']), validateRegistration, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, name, password, role, department, managerId } = req.body;

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM agents WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const [result] = await pool.execute(
      `INSERT INTO agents (email, name, password_hash, role, department, manager_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, name, hashedPassword, role || 'user', department, managerId]
    );

    // Get created user
    const [newUsers] = await pool.execute(
      'SELECT id, email, name, role, department, manager_id FROM agents WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: newUsers[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// GET /api/auth/profile - Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, email, name, role, department, manager_id, created_at, last_login FROM agents WHERE id = ?',
      [req.user.id]
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
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, department } = req.body;

    // Validate input
    if (name && (name.length < 2 || name.length > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Name must be between 2 and 100 characters'
      });
    }

    // Update profile
    const updateFields = [];
    const updateValues = [];

    if (name) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }

    if (department !== undefined) {
      updateFields.push('department = ?');
      updateValues.push(department);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateValues.push(req.user.id);

    await pool.execute(
      `UPDATE agents SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// POST /api/auth/logout - User logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a real application, you might want to blacklist the token
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// POST /api/auth/global-login - Staff sign-in only (agents table). Customers use customers/login or support URL flows.
router.post('/global-login', [
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    let email = req.body.email || req.body.login_id;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    email = String(email).trim().toLowerCase();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const password = req.body.password;
    const tenantId = req.tenantId || 1;
    console.log('📝 Login attempt for email:', email, 'tenant:', tenantId);

    // Check agents table (staff) - filter by tenant when available
    let [agents] = [];
    try {
      const [cols] = await pool.execute(
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME = 'tenant_id'"
      );
      if (cols.length > 0) {
        [agents] = await pool.execute(
          'SELECT * FROM agents WHERE (LOWER(TRIM(email)) = ? OR login_id = ? OR LOWER(TRIM(name)) = ?) AND tenant_id = ?',
          [email, email, email, tenantId]
        );
      } else {
        [agents] = await pool.execute(
          'SELECT * FROM agents WHERE LOWER(TRIM(email)) = ? OR login_id = ? OR LOWER(TRIM(name)) = ?',
          [email, email, email]
        );
      }
    } catch (e) {
      [agents] = await pool.execute(
        'SELECT * FROM agents WHERE LOWER(TRIM(email)) = ? OR login_id = ? OR LOWER(TRIM(name)) = ?',
        [email, email, email]
      );
    }
    if (agents.length === 0 && tenantId) {
      [agents] = await pool.execute(
        'SELECT * FROM agents WHERE LOWER(TRIM(email)) = ? OR login_id = ? OR LOWER(TRIM(name)) = ?',
        [email, email, email]
      );
    }
    console.log('🔍 Found agents:', agents.length);

    let user = null;
    const userType = 'agent';

    // Staff sign-in only: must exist in agents. Customers use Customer Access / product link + customers/login.
    if (agents.length === 0) {
      const [customerRows] = await pool.execute(
        'SELECT id FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(name)) = ? LIMIT 1',
        [email, email]
      );
      if (customerRows.length > 0) {
        console.log('❌ Customer account attempted staff global-login:', email);
        return res.status(403).json({
          success: false,
          message:
            'This sign-in page is for support staff only. Please use Customer Access or your product support link to log in.'
        });
      }
      console.log('❌ No staff account for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (agents.length > 1) {
      for (const a of agents) {
        if (a.password_hash && await bcrypt.compare(password, a.password_hash)) {
          user = a;
          break;
        }
      }
    }
    if (!user) user = agents[0];
    console.log('✅ Staff member candidate:', user.name, 'Role:', user.role);

    // Staff: check if password setup is required
    if (userType === 'agent' && !user.password_hash && user.password_setup_token) {
      return res.status(403).json({
        success: false,
        message: 'Please set up your password first. Use the setup link sent to your email.',
        requires_password_setup: true
      });
    }
    if (userType === 'agent' && !user.password_hash) {
      return res.status(403).json({
        success: false,
        message: 'Please set up your password first. Contact your administrator for the setup link.',
        requires_password_setup: true
      });
    }

    // Check if user is active
    if (!user.is_active) {
      console.log('❌ User account is not active:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Your account is not active. Please contact administrator.'
      });
    }

    // Verify password (already handled requires_password_setup above for staff)
    if (!user.password_hash) {
      console.log('❌ User has no password hash:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    await pool.execute('UPDATE agents SET last_login = NOW() WHERE id = ?', [user.id]);

    // Generate JWT token
    const token = generateToken(user);

    // Map roles for proper frontend routing
    let mappedRole = user.role;
    if (user.role === 'agent' || user.role === 'support_agent' || !user.role) {
      mappedRole = 'support_agent';
    } else if (user.role === 'manager' || user.role === 'support_manager') {
      mappedRole = 'support_manager';
    }

    const allowedStaffRoles = new Set(['support_agent', 'admin', 'support_manager', 'ceo']);
    if (!allowedStaffRoles.has(mappedRole)) {
      console.log('❌ Staff global-login rejected role:', mappedRole, user.email);
      return res.status(403).json({
        success: false,
        message: 'This account is not authorized for staff sign-in. Contact your administrator.'
      });
    }

    const dashboardType = 'staff';

    // Return user data with dashboard information
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: mappedRole,
      department: user.department,
      manager_id: user.manager_id,
      is_active: user.is_active,
      created_at: user.created_at,
      last_login: user.last_login,
      dashboard_type: dashboardType,
      user_type: userType
    };

    console.log('✅ Global login successful for:', user.name, 'Original Role:', user.role, 'Mapped Role:', mappedRole, 'Dashboard:', dashboardType);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token,
        dashboard_type: dashboardType
      }
    });
  } catch (error) {
    console.error('❌ Global login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  }
});

// POST /api/auth/staff/set-password - Staff sets initial password (from setup link)
router.post('/staff/set-password', [
  body('token').notEmpty().withMessage('Setup token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }
    const { token, password } = req.body;

    const [agents] = await pool.execute(
      'SELECT id, name, email, password_setup_token, password_setup_token_expires FROM agents WHERE password_setup_token = ?',
      [token]
    );
    if (!agents.length) {
      return res.status(400).json({ success: false, message: 'Invalid or expired setup link' });
    }
    const agent = agents[0];
    const expires = agent.password_setup_token_expires ? new Date(agent.password_setup_token_expires) : null;
    if (expires && new Date() > expires) {
      return res.status(400).json({ success: false, message: 'Setup link has expired. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await pool.execute(
      'UPDATE agents SET password_hash = ?, password_setup_token = NULL, password_setup_token_expires = NULL, is_active = 1 WHERE id = ?',
      [hashedPassword, agent.id]
    );

    res.json({ success: true, message: 'Password set successfully. Your account is now active. You can log in with your email.' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ success: false, message: 'Failed to set password' });
  }
});

// POST /api/auth/forgot-password - Request password reset (staff only)
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }
    const { email } = req.body;

    const [agents] = await pool.execute(
      'SELECT id, name, email FROM agents WHERE email = ? AND is_active = 1',
      [email]
    );
    // Always return success - don't reveal if email exists
    if (!agents.length) {
      return res.json({ success: true, message: 'If an account exists with that email, a reset link will be sent.' });
    }

    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.execute(
      'UPDATE agents SET password_reset_token = ?, password_reset_token_expires = ? WHERE id = ?',
      [resetToken, resetExpires, agents[0].id]
    );

    const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/staff/reset-password?token=${resetToken}`;

    const emailResult = await emailService.sendStaffResetEmail(email, agents[0].name, resetLink);
    if (!emailResult.success) {
      console.warn('⚠️ Failed to send password reset email:', emailResult.error);
    }

    res.json({ success: true, message: 'If an account exists with that email, a reset link will be sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }
    const { token, password } = req.body;

    const [agents] = await pool.execute(
      'SELECT id, password_reset_token, password_reset_token_expires FROM agents WHERE password_reset_token = ?',
      [token]
    );
    if (!agents.length) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
    }
    const agent = agents[0];
    const expires = agent.password_reset_token_expires ? new Date(agent.password_reset_token_expires) : null;
    if (expires && new Date() > expires) {
      return res.status(400).json({ success: false, message: 'Reset link has expired. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await pool.execute(
      'UPDATE agents SET password_hash = ?, password_reset_token = NULL, password_reset_token_expires = NULL WHERE id = ?',
      [hashedPassword, agent.id]
    );

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

// GET /api/auth/users - Get users (support_manager/ceo only)
router.get('/users', authenticateToken, authorizeRole(['support_manager', 'ceo']), async (req, res) => {
  try {
    let query = 'SELECT id, email, name, role, department, manager_id, created_at, last_login, is_active FROM agents';
    const params = [];

    // Support managers can only see their team
    if (req.user.role === 'support_manager') {
      query += ' WHERE manager_id = ? OR id = ?';
      params.push(req.user.id, req.user.id);
    }

    query += ' ORDER BY created_at DESC';

    const [users] = await pool.execute(query, params);

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// GET /api/auth/support/:product - Universal Support URL Integration
// Standard URL format: {base_url}/{product}?m={module_name}&u={user_name}&e={email_id}
// Product in path only. e is unique user identifier.
router.get('/support/:product', async (req, res) => {
  try {
    const productUtm = req.params.product;
    const userEmail = req.query.e || req.query.user_email; // e = standard, user_email = legacy
    const userName = req.query.u || req.query.user_name;
    const userPhone = req.query.user_phone; // optional, not in standard format

    if (!productUtm || !productUtm.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product is required in the URL path'
      });
    }

    if (!userEmail || !userEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter e (or user_email) is required and must be a valid email. Example: ?e=user@example.com'
      });
    }

    const email = userEmail.trim();
    const name = (userName && userName.trim()) ? userName.trim() : email.split('@')[0];

    console.log('🔗 Universal Support URL (UTM):', { utm: productUtm, email });

    // Resolve product by utm_description first (primary), then slug, then name (case-insensitive)
    let productRow;
    try {
      const [products] = await pool.execute(
        `SELECT * FROM products 
         WHERE status = 'active' 
         AND (LOWER(COALESCE(utm_description, '')) = LOWER(?) 
              OR LOWER(COALESCE(slug, '')) = LOWER(?) 
              OR LOWER(name) = LOWER(?))
         ORDER BY (LOWER(COALESCE(utm_description, '')) = LOWER(?)) DESC,
                  (LOWER(COALESCE(slug, '')) = LOWER(?)) DESC
         LIMIT 1`,
        [productUtm, productUtm, productUtm, productUtm, productUtm]
      );
      productRow = products[0];
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' && (err.message?.includes('slug') || err.message?.includes('utm_description'))) {
        // Fallback if columns missing - try name only
        const [products] = await pool.execute(
          'SELECT * FROM products WHERE status = ? AND LOWER(name) = LOWER(?) LIMIT 1',
          ['active', productUtm]
        );
        productRow = products[0];
      } else {
        throw err;
      }
    }

    if (!productRow) {
      return res.status(404).json({
        success: false,
        message: `Product "${productUtm}" not found. Add the product with a matching utm_description, slug, or name.`
      });
    }

    const productName = productRow.name;
    const utmDescription = productRow.utm_description || productUtm;

    // SECURITY: Block staff members - support URL is for customers only
    const [agents] = await pool.execute('SELECT * FROM agents WHERE email = ?', [email]);
    if (agents.length > 0) {
      return res.status(403).json({
        success: false,
        message: 'Support URL is for customers only. Staff should use the regular login.',
        redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
      });
    }

    // Find or create user by email
    const [users] = await pool.execute(
      `SELECT *
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
       ORDER BY
         COALESCE(email_verified, 0) DESC,
         CASE WHEN COALESCE(account_status, '') = 'active' THEN 0 ELSE 1 END,
         id DESC`,
      [email]
    );
    let user;
    let isNewUser = false;

    const tenantId = productRow.tenant_id ?? 1;

    if (users.length === 0) {
      try {
        const lifecycleState = accountLifecycleService.buildLifecycleState(email, true);
        const [result] = await pool.execute(
          `INSERT INTO users (
            name, email, phone, role, created_at, is_active, last_login,
            email_verified, email_verified_at, account_status,
            is_public_domain_email, public_domain_acknowledged, public_domain_acknowledged_at
          ) VALUES (?, ?, ?, 'user', NOW(), ?, NOW(), ?, ?, ?, ?, ?, ?)`,
          [
            name,
            email,
            null,
            lifecycleState.is_active,
            lifecycleState.email_verified,
            lifecycleState.email_verified_at,
            lifecycleState.account_status,
            lifecycleState.is_public_domain_email,
            lifecycleState.public_domain_acknowledged,
            lifecycleState.public_domain_acknowledged_at
          ]
        );
        const [newUsers] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
        if (!newUsers.length) throw new Error('Failed to retrieve new user');
        user = newUsers[0];
        isNewUser = true;
        console.log('✅ New customer created:', user.email, 'for product:', productName);
      } catch (insertError) {
        console.error('❌ Error creating user:', insertError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create user account: ' + insertError.message
        });
      }
    } else {
      user = users[0];
      if (name && (!user.name || user.name === user.email)) {
        await pool.execute('UPDATE users SET name = ? WHERE id = ?', [name, user.id]);
        user.name = name;
      }
      if (userPhone && userPhone.trim()) {
        await pool.execute('UPDATE users SET phone = ? WHERE id = ?', [userPhone.trim(), user.id]);
        user.phone = userPhone.trim();
      }
      if (!user.is_active) {
        await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [user.id]);
        user.is_active = true;
      }
    }

    if (!user.email_verified || user.account_status === 'pending_verification') {
      const emailResult = await sendVerificationForUser(user.id, user.email, user.name);
      return res.status(403).json({
        success: false,
        requiresEmailVerification: true,
        message: 'Your account is pending email verification. Please verify your email to continue.',
        data: {
          email: user.email,
          emailSent: !!emailResult?.success
        }
      });
    }

    // Check if user has any tickets (existing vs first-time experience)
    const [ticketCountRows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM tickets WHERE (user_id = ? OR email = ?)',
      [user.id, user.email]
    );
    const hasTickets = (ticketCountRows[0]?.cnt || 0) > 0;

    if (user.role !== 'user' && user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Support URL is for customers only.',
        redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
      });
    }

    // Returning users (session ended) must go through customer-access:
    // - Has password → login form
    // - No password → create password form (then login)
    const hasPassword = !!(user.password_hash && String(user.password_hash).trim());
    if (!isNewUser) {
      return res.json({
        success: true,
        requiresPassword: hasPassword,
        requiresCustomerAccess: true,
        message: hasPassword ? 'Sign in with your password to continue' : 'Set up a password to access your support dashboard',
        data: {
          email: user.email,
          name: user.name
        }
      });
    }

    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = generateToken({ ...user, tenant_id: user.tenant_id ?? tenantId });

    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const personalizedUrl = `${baseUrl}/${encodeURIComponent(utmDescription)}?m=&u=${encodeURIComponent(user.name)}&e=${encodeURIComponent(user.email)}`;

    const supportContext = {
      email: user.email,
      name: user.name,
      product: productName,
      productId: productRow.id,
      utmDescription,
      phone: userPhone && userPhone.trim() ? userPhone.trim() : user.phone,
      timestamp: new Date().toISOString(),
      source: 'support-url',
      sourcePlatform: utmDescription,
      personalizedUrl
    };

    // Send welcome email to first-time users (created just now)
    if (isNewUser) {
      try {
        const emailService = require('../services/emailService');
        await emailService.sendSupportWelcomeEmail(
          user.email,
          user.name,
          utmDescription,
          personalizedUrl
        );
        try {
          await pool.execute('UPDATE users SET welcome_url_sent = TRUE WHERE id = ?', [user.id]);
        } catch (e) {
          if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        }
      } catch (emailErr) {
        console.warn('⚠️ Could not send support welcome email:', emailErr.message);
      }
    }

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      tenant_id: user.tenant_id ?? tenantId,
      is_active: user.is_active,
      created_at: user.created_at,
      last_login: user.last_login
    };

    console.log('✅ Support login:', user.email, '| Product:', productName, '|', isNewUser ? 'NEW' : 'EXISTING');

    res.json({
      success: true,
      message: 'Support session initialized',
      data: {
        user: userData,
        token,
        product: { id: productRow.id, name: productName, utmDescription },
        supportContext,
        isNewUser,
        hasTickets,
        personalizedUrl
      }
    });
  } catch (error) {
    console.error('❌ Support login error:', error);
    res.status(500).json({
      success: false,
      message: 'Support login failed: ' + error.message
    });
  }
});

// POST /api/auth/customers/check-email - Check if customer exists and has password
router.post('/customers/check-email', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    }
    const { email } = req.body;
    const isPublicDomainEmail = accountLifecycleService.isPublicDomainEmail(email);
    const [users] = await pool.execute(
      `SELECT id, password_hash, email_verified, account_status, is_public_domain_email, public_domain_acknowledged
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
         AND role IN ('user', 'customer')
       ORDER BY
         COALESCE(email_verified, 0) DESC,
         CASE WHEN COALESCE(account_status, '') = 'active' THEN 0 ELSE 1 END,
         CASE WHEN password_hash IS NOT NULL AND TRIM(password_hash) <> '' THEN 0 ELSE 1 END,
         id DESC`,
      [email]
    );
    if (users.length > 0) {
      const hasPassword = !!(users[0].password_hash && users[0].password_hash.trim());
      const accessState = resolveCustomerAccessState(users[0]);
      console.log('[customer-check-email] decision', {
        email: String(email || '').trim().toLowerCase(),
        userId: users[0].id,
        hasPassword,
        emailVerified: !!users[0].email_verified,
        accountStatus: users[0].account_status || null,
        accessState
      });
      return res.json({
        success: true,
        exists: true,
        hasPassword,
        accessState,
        emailVerified: !!users[0].email_verified,
        accountStatus: users[0].account_status || (users[0].email_verified ? 'active' : 'pending_verification'),
        isPublicDomainEmail: !!users[0].is_public_domain_email,
        publicDomainAcknowledged: !!users[0].public_domain_acknowledged
      });
    }
    // Only block as staff when there is no customer account for this email.
    const [agents] = await pool.execute('SELECT id FROM agents WHERE email = ?', [email]);
    if (agents.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Staff should use the staff login',
        exists: false
      });
    }
    return res.json({
      success: true,
      exists: false,
      hasPassword: false,
      accessState: 'NEW_USER_CREATE_PASSWORD',
      emailVerified: false,
      accountStatus: 'pending_verification',
      isPublicDomainEmail,
      publicDomainAcknowledged: !isPublicDomainEmail
    });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/customers/set-password - Create password for customer (existing or first-time)
router.post('/customers/set-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').optional().isString(),
  body('public_domain_acknowledged').optional().isBoolean().withMessage('public_domain_acknowledged must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    const { email, password, name, public_domain_acknowledged } = req.body;
    accountLifecycleService.assertPublicDomainAck(email, !!public_domain_acknowledged);
    const [users] = await pool.execute(
      `SELECT id, password_hash, email_verified, account_status, public_domain_acknowledged
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
         AND role IN ('user', 'customer')
       ORDER BY
         COALESCE(email_verified, 0) DESC,
         CASE WHEN COALESCE(account_status, '') = 'active' THEN 0 ELSE 1 END,
         CASE WHEN password_hash IS NOT NULL AND TRIM(password_hash) <> '' THEN 0 ELSE 1 END,
         id DESC`,
      [email]
    );
    if (users.length === 0) {
      const [agents] = await pool.execute('SELECT id FROM agents WHERE email = ?', [email]);
      if (agents.length > 0) {
        return res.status(400).json({ success: false, message: 'Staff should use the staff login.' });
      }
    }
    if (users.length > 0 && users[0].password_hash && users[0].password_hash.trim()) {
      return res.status(400).json({ success: false, message: 'Password already set. Please use the login form.' });
    }

    let userId;
    if (users.length === 0) {
      const derivedName = (name && name.trim()) ? name.trim() : email.split('@')[0];
      const lifecycleState = accountLifecycleService.buildLifecycleState(email, !!public_domain_acknowledged);
      const [created] = await pool.execute(
        `INSERT INTO users (
          name, email, role, created_at, is_active, last_login,
          email_verified, email_verified_at, account_status,
          is_public_domain_email, public_domain_acknowledged, public_domain_acknowledged_at
        ) VALUES (?, LOWER(TRIM(?)), 'user', NOW(), ?, NOW(), ?, ?, ?, ?, ?, ?)`,
        [
          derivedName,
          email,
          lifecycleState.is_active,
          lifecycleState.email_verified,
          lifecycleState.email_verified_at,
          lifecycleState.account_status,
          lifecycleState.is_public_domain_email,
          lifecycleState.public_domain_acknowledged,
          lifecycleState.public_domain_acknowledged_at
        ]
      );
      userId = created.insertId;
    } else {
      userId = users[0].id;
    }

    const hashedPassword = await hashPassword(password);
    // Keep duplicate legacy rows (same email) from causing auth loops by syncing password hash.
    await pool.execute(
      `UPDATE users
       SET password_hash = ?, is_active = TRUE,
           public_domain_acknowledged = CASE
             WHEN is_public_domain_email = 1 THEN COALESCE(?, public_domain_acknowledged)
             ELSE public_domain_acknowledged
           END,
           public_domain_acknowledged_at = CASE
             WHEN is_public_domain_email = 1 AND ? = 1 THEN COALESCE(public_domain_acknowledged_at, NOW())
             ELSE public_domain_acknowledged_at
           END
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
         AND role IN ('user', 'customer')`,
      [hashedPassword, public_domain_acknowledged === true ? 1 : 0, public_domain_acknowledged === true ? 1 : 0, email]
    );
    const [updated] = await pool.execute(
      `SELECT id, name, email, role, phone, tenant_id, email_verified, account_status
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
         AND role IN ('user', 'customer')
       ORDER BY
         COALESCE(email_verified, 0) DESC,
         CASE WHEN COALESCE(account_status, '') = 'active' THEN 0 ELSE 1 END,
         id DESC
       LIMIT 1`,
      [email]
    );
    const user = updated[0];
    if (!user.email_verified || user.account_status === 'pending_verification') {
      const emailResult = await sendVerificationForUser(user.id, user.email, user.name);
      return res.status(202).json({
        success: true,
        requiresEmailVerification: true,
        message: 'Password created. Verify your email to activate account access.',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenant_id: user.tenant_id ?? 1,
            account_status: user.account_status || 'pending_verification',
            email_verified: !!user.email_verified
          },
          emailSent: !!emailResult?.success
        }
      });
    }
    const token = generateToken({ ...user, tenant_id: user.tenant_id ?? 1 });
    return res.json({
      success: true,
      message: 'Password created successfully',
      data: { user, token }
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/customers/login - Customer login with email + password
router.post('/customers/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    const { email, password } = req.body;
    const [users] = await pool.execute(
      `SELECT *
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
         AND role IN ('user', 'customer')
       ORDER BY
         COALESCE(email_verified, 0) DESC,
         CASE WHEN COALESCE(account_status, '') = 'active' THEN 0 ELSE 1 END,
         CASE WHEN password_hash IS NOT NULL AND TRIM(password_hash) <> '' THEN 0 ELSE 1 END,
         id DESC`,
      [email]
    );
    if (users.length === 0) {
      const [agents] = await pool.execute('SELECT id FROM agents WHERE email = ?', [email]);
      if (agents.length > 0) {
        return res.status(400).json({ success: false, message: 'Staff should use the staff login.', accessState: 'ACCESS_DENIED' });
      }
      return res.status(401).json({
        success: false,
        message: 'Account not found. Please access via your support link first.',
        accessState: 'NEW_USER_CREATE_PASSWORD'
      });
    }
    const user = users[0];
    if (!user.email_verified || user.account_status === 'pending_verification') {
      return res.status(403).json({
        success: false,
        requiresEmailVerification: true,
        message: 'Email is not verified. Please verify your email before login.',
        accessState: 'PENDING_EMAIL_VERIFICATION'
      });
    }
    if (!user.password_hash || !user.password_hash.trim()) {
      return res.status(400).json({
        success: false,
        message: 'No password set. Please create a password first.',
        needsPassword: true,
        accessState: 'NEW_USER_CREATE_PASSWORD'
      });
    }
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.', accessState: 'LOGIN_REQUIRED' });
    }
    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    const token = generateToken({ ...user, tenant_id: user.tenant_id ?? 1 });
    const userData = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, tenant_id: user.tenant_id ?? 1 };
    return res.json({ success: true, accessState: 'AUTHENTICATED_DASHBOARD_ACCESS', data: { user: userData, token } });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/verify-email - Verify customer email by token
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required'),
  body('email').optional().isEmail().normalizeEmail().withMessage('email must be valid')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    }
    const sendAccessLinkForUser = async (user) => {
      if (!user?.email) return { success: false, error: 'User email missing' };
      const appUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
      const accessLink = `${appUrl}/grc?m=grc&u=${encodeURIComponent(user.name || '')}&e=${encodeURIComponent(user.email)}`;
      const emailResult = await emailService.sendCustomerAccessLinkEmail(user.email, user.name, accessLink);
      return emailResult;
    };

    const result = await accountLifecycleService.verifyByToken(req.body.token);
    if (result.status === 'verified') {
      let accessLinkEmailSent = false;
      let userRole = null;
      let userEmail = null;
      let hasPassword = false;
      try {
        const [rows] = await pool.execute(
          `SELECT id, name, email, role, password_hash
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [result.userId]
        );
        if (rows.length > 0) {
          const user = rows[0];
          userRole = user.role;
          userEmail = user.email;
          hasPassword = !!(user.password_hash && user.password_hash.trim());
          const sent = await sendAccessLinkForUser(user);
          accessLinkEmailSent = !!sent?.success;
          console.log('[verify-email] access-link email after verified', {
            userId: user.id,
            email: user.email,
            sent: accessLinkEmailSent,
            error: sent?.error || null
          });
        }
      } catch (mailError) {
        console.error('Post-verification access-link email failed:', mailError);
      }
      return res.json({
        success: true,
        status: 'verified',
        accessLinkEmailSent,
        role: userRole,
        email: userEmail,
        hasPassword,
        message: 'Email verified successfully. You can now sign in.'
      });
    }
    if (result.status === 'already_verified') {
      let accessLinkEmailSent = false;
      let userRole = null;
      let userEmail = null;
      let hasPassword = false;
      try {
        const lookupEmail = String(req.body.email || '').trim().toLowerCase();
        if (lookupEmail) {
          const [rows] = await pool.execute(
            `SELECT id, name, email, role, password_hash
             FROM users
             WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
               AND role IN ('user', 'customer')
             ORDER BY id DESC
             LIMIT 1`,
            [lookupEmail]
          );
          if (rows.length > 0) {
            const user = rows[0];
            userRole = user.role;
            userEmail = user.email;
            hasPassword = !!(user.password_hash && user.password_hash.trim());
            const sent = await sendAccessLinkForUser(user);
            accessLinkEmailSent = !!sent?.success;
            console.log('[verify-email] access-link email after already_verified', {
              userId: user.id,
              email: user.email,
              sent: accessLinkEmailSent,
              error: sent?.error || null
            });
          }
        }
      } catch (mailError) {
        console.error('Access-link email on already_verified failed:', mailError);
      }
      return res.json({
        success: true,
        status: 'already_verified',
        accessLinkEmailSent,
        role: userRole,
        email: userEmail,
        hasPassword,
        message: 'Email is already verified.'
      });
    }
    if (result.status === 'expired') {
      return res.status(400).json({ success: false, status: 'expired', message: 'Verification link expired. Request a new one.' });
    }
    if (result.status === 'invalid' && req.body.email) {
      const [rows] = await pool.execute(
        `SELECT email_verified
         FROM users
         WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
           AND role IN ('user', 'customer')
         ORDER BY id DESC LIMIT 1`,
        [req.body.email]
      );
      if (rows.length > 0 && rows[0].email_verified) {
        return res.json({ success: true, status: 'already_verified', message: 'Email is already verified.' });
      }
    }
    return res.status(400).json({ success: false, status: 'invalid', message: 'Invalid verification link.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to verify email' });
  }
});

// POST /api/auth/customers/resend-verification - Resend verification email by customer email
router.post('/customers/resend-verification', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    }
    const email = String(req.body.email || '').trim().toLowerCase();
    const [rows] = await pool.execute(
      `SELECT id, name, email, email_verified
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
         AND role IN ('user', 'customer')
       ORDER BY id DESC LIMIT 1`,
      [email]
    );
    if (!rows.length) {
      return res.json({ success: true, message: 'If an account exists, a verification email has been sent.' });
    }
    const user = rows[0];
    const resend = await accountLifecycleService.resendVerification(user.id);
    if (resend.alreadyVerified) {
      return res.json({ success: true, alreadyVerified: true, message: 'Email is already verified.' });
    }
    const appUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const verificationLink = `${appUrl}/customer-access?verify_token=${encodeURIComponent(resend.token)}&email=${encodeURIComponent(user.email)}`;
    const emailResult = await emailService.sendEmailVerificationEmail(user.email, user.name, verificationLink, resend.expiresAt);
    return res.json({
      success: true,
      message: 'Verification email sent.',
      emailSent: !!emailResult?.success
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to resend verification' });
  }
});

// GET /api/auth/ticket-access/:ticketId - Secure ticket access for notification links (email match)
// Supports e (standard) or user_email (legacy)
router.get('/ticket-access/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userEmail = req.query.e || req.query.user_email;
    if (!userEmail || !userEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Query parameter e (email) is required' });
    }
    const [tickets] = await pool.execute(
      'SELECT id, email, user_id FROM tickets WHERE id = ?',
      [ticketId]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = tickets[0];
    const ticketEmail = ticket.email || null;
    let userEmailMatch = ticketEmail && ticketEmail.toLowerCase().trim() === userEmail.toLowerCase().trim();
    if (!userEmailMatch && ticket.user_id) {
      const [users] = await pool.execute('SELECT email FROM users WHERE id = ?', [ticket.user_id]);
      if (users.length > 0 && users[0].email && users[0].email.toLowerCase().trim() === userEmail.toLowerCase().trim()) {
        userEmailMatch = true;
      }
    }
    if (!userEmailMatch) {
      return res.status(403).json({ success: false, message: 'Access denied. Email does not match ticket.' });
    }
    const [users] = await pool.execute(
      `SELECT *
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
       ORDER BY
         COALESCE(email_verified, 0) DESC,
         CASE WHEN COALESCE(account_status, '') = 'active' THEN 0 ELSE 1 END,
         id DESC`,
      [userEmail]
    );
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = users[0];
    const token = generateToken({ ...user, tenant_id: user.tenant_id ?? 1 });
    const userData = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, tenant_id: user.tenant_id ?? 1 };
    return res.json({
      success: true,
      data: { user: userData, token, ticketId: parseInt(ticketId, 10) }
    });
  } catch (error) {
    console.error('Ticket access error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router; 