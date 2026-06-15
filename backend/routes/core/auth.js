const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database');
const { 
  authenticateToken, 
  authorizeRole, 
  generateToken, 
  hashPassword, 
  comparePassword 
} = require('../middleware/auth');
const bcrypt = require('bcryptjs'); // Added for global login

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
  body('department').optional().trim().isLength({ max: 100 }).withMessage('Department must be less than 100 characters')
];

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

// POST /api/auth/global-login - Global login for all user types
router.post('/global-login', [
  body('login_id').notEmpty().withMessage('Login ID is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    console.log('🔍 Global login request:', { login_id: req.body.login_id });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { login_id, password } = req.body;
    console.log('📝 Login attempt for login_id:', login_id);

    // First check agents table (staff members) - check both email and login_id
    let [agents] = await pool.execute(
      'SELECT * FROM agents WHERE email = ? OR login_id = ?',
      [login_id, login_id]
    );
    
    console.log('🔍 Found agents:', agents.length);

    // If not found in agents, check users table (customers)
    let [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [login_id]
    );
    
    console.log('🔍 Found users:', users.length);

    let user = null;
    let userType = null;

    if (agents.length > 0) {
      user = agents[0];
      userType = 'agent';
      console.log('✅ Staff member found:', user.name, 'Role:', user.role);
    } else if (users.length > 0) {
      user = users[0];
      userType = 'user';
      console.log('✅ Customer found:', user.name, 'Role:', user.role);
    } else {
      console.log('❌ User not found in either table:', login_id);
      return res.status(401).json({
        success: false,
        message: 'Invalid Login ID or Password'
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

    // Verify password
    if (!user.password_hash) {
      console.log('❌ User has no password hash:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid Login ID or Password'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid Login ID or Password'
      });
    }

    // Update last login based on user type
    if (userType === 'agent') {
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

    // Determine dashboard type based on role and user type
    let dashboardType = 'user';
    let role = user.role;
    
    // For agents table, roles are already in the correct format
    // No mapping needed since agents table has: support_agent, support_manager, ceo, admin
    if (userType === 'agent') {
      // Roles from agents table are already correct
      role = user.role;
    } else if (userType === 'user') {
      // Map user table roles to agent table roles for frontend compatibility
      if (user.role === 'manager') {
        role = 'support_manager';
      } else if (user.role === 'user') {
        role = 'support_agent';
      }
      // ceo role stays the same
    }
    
    if (['support_agent', 'support_manager', 'ceo', 'admin'].includes(role)) {
      dashboardType = 'staff';
    }

    // Return user data with dashboard information
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: role,
      department: user.department,
      manager_id: user.manager_id,
      phone: user.phone,
      is_active: user.is_active,
      created_at: user.created_at,
      last_login: user.last_login,
      dashboard_type: dashboardType,
      user_type: userType,
      tenant_id: user.tenant_id // ✅ Include tenant_id in userData
    };

    console.log('✅ Global login successful for:', user.name, 'Role:', user.role, 'Dashboard:', dashboardType);

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

// GET /api/auth/auto-login/:email/:name/:product - Auto-login for external integrations
router.get('/auto-login/:email/:name/:product', async (req, res) => {
  try {
    console.log('🔗 Auto-login request:', req.params);
    
    const { email, name, product } = req.params;
    
    // Validate email format
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate name parameter
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    // Clean and validate product
    if (!product || product.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product identifier is required'
      });
    }

    console.log('📋 Auto-login payload validation passed:');
    console.log('   - Email:', email);
    console.log('   - Name:', name);
    console.log('   - Product:', product);

    // SECURITY CHECK: First check if this email belongs to an agent/manager/CEO
    // Auto-login should only work for customers, not staff members
    console.log('🔒 Checking if email belongs to staff member (agents/managers/CEOs)');
    
    let [agents] = await pool.execute(
      'SELECT * FROM agents WHERE email = ?',
      [email]
    );

    if (agents.length > 0) {
      const agent = agents[0];
      console.log('❌ Auto-login blocked - Email belongs to staff member:');
      console.log('   - ID:', agent.id);
      console.log('   - Name:', agent.name);
      console.log('   - Email:', agent.email);
      console.log('   - Role:', agent.role);
      console.log('🔒 Auto-login is restricted to customers only');
      
      return res.status(403).json({
        success: false,
        message: 'Auto-login is not available for staff members. Agents, managers, and administrators should use the regular login system.',
        userRole: agent.role,
        redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
      });
    }

    console.log('✅ Email not found in agents table - proceeding with customer auto-login');
    
    // Find or create user by email in users table (not agents table)
    console.log('🔍 Checking if customer exists with email:', email);
    
    let [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    let user;
    let isNewUser = false;
    
    if (users.length === 0) {
      // Customer doesn't exist - CREATE NEW USER
      console.log('👤 Customer NOT found - Creating new customer user for auto-login');
      console.log('📝 New user details - Name:', name, 'Email:', email, 'Product:', product);
      
      try {
        const [result] = await pool.execute(
          `INSERT INTO users (name, email, phone, role, created_at, is_active, last_login) 
           VALUES (?, ?, ?, 'user', NOW(), TRUE, NOW())`,
          [name, email, null] // Use provided name, email, and no phone for now
        );

        console.log('✅ New user INSERT successful, ID:', result.insertId);
        
        // Fetch the newly created user
        const [newUsers] = await pool.execute(
          'SELECT * FROM users WHERE id = ?',
          [result.insertId]
        );

        if (newUsers.length === 0) {
          throw new Error('Failed to retrieve newly created user');
        }

        user = newUsers[0];
        isNewUser = true;
        console.log('✅ New customer user created successfully:');
        console.log('   - ID:', user.id);
        console.log('   - Name:', user.name);
        console.log('   - Email:', user.email);
        console.log('   - Role:', user.role);
        console.log('   - Created:', user.created_at);
        
      } catch (insertError) {
        console.error('❌ Error creating new user:', insertError);
        throw new Error(`Failed to create new customer user: ${insertError.message}`);
      }
      
    } else {
      // Customer EXISTS - LOGIN EXISTING USER
      user = users[0];
      console.log('✅ Existing customer found - Logging in existing user:');
      console.log('   - ID:', user.id);
      console.log('   - Name:', user.name);
      console.log('   - Email:', user.email);
      console.log('   - Role:', user.role);
      console.log('   - Status:', user.is_active ? 'Active' : 'Inactive');
      
      // Update user information if provided and different
      if (name && name !== user.name) {
        console.log('🔄 Updating existing user name from:', user.name, 'to:', name);
        await pool.execute(
          'UPDATE users SET name = ? WHERE id = ?',
          [name, user.id]
        );
        user.name = name;
        console.log('✅ User name updated successfully');
      }
      
      // Ensure user is active
      if (!user.is_active) {
        console.log('🔄 Activating inactive user account');
        await pool.execute(
          'UPDATE users SET is_active = TRUE WHERE id = ?',
          [user.id]
        );
        user.is_active = TRUE;
        console.log('✅ User account activated successfully');
      }
    }

    // Check if user is active
    if (!user.is_active) {
      console.log('❌ User account is not active:', user.email);
      return res.status(401).json({
        success: false,
        message: 'User account is not active'
      });
    }

    // SECURITY CHECK: Auto-login is ONLY for customers (role = 'user')
    // Agents, managers, and CEOs should use regular login
    if (user.role !== 'user') {
      console.log('❌ Auto-login access denied - User role is not "user":', user.role);
      console.log('🔒 Auto-login is restricted to customers only');
      console.log('👤 User details - ID:', user.id, 'Name:', user.name, 'Email:', user.email, 'Role:', user.role);
      
      return res.status(403).json({
        success: false,
        message: 'Auto-login is only available for customers. Agents, managers, and administrators should use the regular login system.',
        userRole: user.role,
        redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
      });
    }

    // Update last login
    await pool.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Generate JWT token
    const token = generateToken(user);

    // Store auto-login context in temporary storage
    const autoLoginContext = {
      email: user.email,
      name: user.name,
      product: product,
      timestamp: new Date().toISOString(),
      source: 'auto-login'
    };

    // Return user data with auto-login context
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      is_active: user.is_active,
      created_at: user.created_at,
      last_login: user.last_login,
      auto_login_context: autoLoginContext
    };

    // Check if the request accepts JSON or has format=json parameter
    console.log('🔍 Request headers:', req.headers);
    console.log('🔍 Accept header:', req.headers.accept);
    console.log('🔍 Query parameters:', req.query);
    const acceptsJson = (req.headers.accept && req.headers.accept.includes('application/json')) || req.query.format === 'json';
    console.log('🔍 Accepts JSON:', acceptsJson);
    
    if (acceptsJson) {
      // Return JSON response for API calls
      console.log('✅ Auto-login successful for:', user.name, 'Email:', user.email, 'Product:', product);
      console.log('📊 User type:', isNewUser ? 'NEW CUSTOMER CREATED' : 'EXISTING CUSTOMER LOGGED IN');
      
      // Final summary log
      console.log('🎯 AUTO-LOGIN SUMMARY:');
      console.log('   - Action:', isNewUser ? 'CREATED & LOGGED IN' : 'EXISTING USER LOGGED IN');
      console.log('   - User ID:', user.id);
      console.log('   - User Name:', user.name);
      console.log('   - User Email:', user.email);
      console.log('   - Source Product:', product);
      
      res.json({
        success: true,
        message: 'Auto-login successful',
        data: {
          user: userData,
          token: token,
          autoLoginContext: autoLoginContext
        }
      });
    } else {
      // Return HTML redirect for direct browser access - standard format: /{product}?m=&u=&e=
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${baseUrl}/${encodeURIComponent(product)}?m=&u=${encodeURIComponent(user.name)}&e=${encodeURIComponent(user.email)}`;
      
      console.log('✅ Auto-login successful for:', user.name, 'Email:', user.email, 'Product:', product);
      console.log('📊 User type:', isNewUser ? 'NEW CUSTOMER CREATED' : 'EXISTING CUSTOMER LOGGED IN');
      console.log('🔄 Redirecting to:', redirectUrl);
      
      // Final summary log
      console.log('🎯 AUTO-LOGIN SUMMARY:');
      console.log('   - Action:', isNewUser ? 'CREATED & LOGGED IN' : 'EXISTING USER LOGGED IN');
      console.log('   - User ID:', user.id);
      console.log('   - User Name:', user.name);
      console.log('   - User Email:', user.email);
      console.log('   - Source Product:', product);
      console.log('   - Redirect URL:', redirectUrl);
      
      // Create HTML page that will redirect with user data in URL
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Auto-login Successful - ITSM Ticketing</title>
          <meta charset="utf-8">
          <meta http-equiv="refresh" content="4;url=${redirectUrl}">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        </head>
        <body>
          <!-- Particle System -->
          <div id="particles-js"></div>
          
          <!-- Holographic Grid -->
          <div class="holographic-grid"></div>
          
          <!-- Main Container -->
          <div class="container">
            <!-- Futuristic Success Card -->
            <div class="success-card">
              <!-- Animated Border -->
              <div class="card-border">
                <div class="border-line border-line-1"></div>
                <div class="border-line border-line-2"></div>
                <div class="border-line border-line-3"></div>
                <div class="border-line border-line-4"></div>
              </div>
              
              <!-- Animated Success Icon -->
              <div class="success-icon">
                <div class="icon-container">
                  <div class="checkmark-circle">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" class="circle-animation"/>
                      <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="checkmark-animation"/>
                    </svg>
                  </div>
                  <div class="pulse-rings">
                    <div class="pulse-ring ring-1"></div>
                    <div class="pulse-ring ring-2"></div>
                    <div class="pulse-ring ring-3"></div>
                  </div>
                </div>
              </div>
              
              <!-- Futuristic Title -->
              <h1 class="title">
                <span class="title-text">ACCESS GRANTED</span>
                <div class="title-glow"></div>
              </h1>
              
              <p class="subtitle">Customer authentication successful • System redirecting...</p>
              
              <!-- Advanced Loading Container -->
              <div class="loading-container">
                <div class="holographic-spinner">
                  <div class="spinner-ring ring-1"></div>
                  <div class="spinner-ring ring-2"></div>
                  <div class="spinner-ring ring-3"></div>
                  <div class="spinner-core"></div>
                </div>
                <p class="loading-text">Initializing secure connection...</p>
                <div class="loading-progress">
                  <div class="progress-bar">
                    <div class="progress-fill"></div>
                  </div>
                  <span class="progress-text">Loading: <span id="progress-percent">0</span>%</span>
                </div>
              </div>
              
              <!-- User Data Display -->
              <div class="user-info">
                <div class="info-header">
                  <div class="header-icon">👤</div>
                  <span>USER PROFILE</span>
                </div>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">IDENTITY:</span>
                    <span class="info-value">${user.name}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">EMAIL:</span>
                    <span class="info-value">${user.email}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">PRODUCT:</span>
                    <span class="info-value product-badge">${product}</span>
                  </div>
                </div>
              </div>
              
              <!-- Action Buttons -->
              <div class="action-buttons">
                <a href="${redirectUrl}" class="primary-btn">
                  <div class="btn-content">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>PROCEED TO DASHBOARD</span>
                  </div>
                  <div class="btn-glow"></div>
                </a>
                <button class="secondary-btn" onclick="window.location.reload()">
                  <div class="btn-content">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M3 21v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>REFRESH</span>
                  </div>
                </button>
              </div>
              
              <!-- Status Information -->
              <div class="status-info">
                <div class="countdown-display">
                  <span class="countdown-label">AUTO-REDIRECT IN:</span>
                  <span class="countdown-timer" id="countdown">4</span>
                  <span class="countdown-unit">SECONDS</span>
                </div>
                <p class="note">Customer session data securely loaded • Connection established</p>
              </div>
            </div>
            
            <!-- Floating Elements -->
            <div class="floating-elements">
              <div class="floating-orb orb-1"></div>
              <div class="floating-orb orb-2"></div>
              <div class="floating-orb orb-3"></div>
              <div class="floating-orb orb-4"></div>
              <div class="floating-orb orb-5"></div>
            </div>
            
            <!-- Data Stream Effect -->
            <div class="data-stream">
              <div class="stream-line stream-1"></div>
              <div class="stream-line stream-2"></div>
              <div class="stream-line stream-3"></div>
            </div>
          </div>
          
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'Orbitron', 'Inter', monospace;
              background: #000;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #fff;
              overflow: hidden;
              position: relative;
            }
            
            /* Particle System */
            #particles-js {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              z-index: 1;
              background: radial-gradient(ellipse at center, #0a0a0a 0%, #000 100%);
            }
            
            /* Holographic Grid */
            .holographic-grid {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background-image: 
                linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px);
              background-size: 50px 50px;
              animation: gridMove 20s linear infinite;
              z-index: 2;
            }
            
            .container {
              position: relative;
              width: 100%;
              max-width: 600px;
              padding: 20px;
              z-index: 10;
            }
            
            /* Futuristic Success Card */
            .success-card {
              background: rgba(0, 20, 40, 0.9);
              backdrop-filter: blur(20px);
              border-radius: 20px;
              padding: 40px 30px;
              text-align: center;
              box-shadow: 
                0 0 50px rgba(0, 255, 255, 0.3),
                inset 0 0 50px rgba(0, 255, 255, 0.1);
              border: 2px solid rgba(0, 255, 255, 0.3);
              position: relative;
              overflow: hidden;
              animation: cardGlow 3s ease-in-out infinite alternate;
            }
            
            /* Animated Border */
            .card-border {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              border-radius: 20px;
              overflow: hidden;
            }
            
            .border-line {
              position: absolute;
              background: linear-gradient(90deg, transparent, #00ffff, transparent);
              height: 2px;
              animation: borderFlow 3s linear infinite;
            }
            
            .border-line-1 { top: 0; left: -100%; width: 100%; animation-delay: 0s; }
            .border-line-2 { top: -100%; right: 0; width: 2px; height: 100%; animation-delay: 0.75s; }
            .border-line-3 { bottom: 0; right: -100%; width: 100%; animation-delay: 1.5s; }
            .border-line-4 { bottom: -100%; left: 0; width: 2px; height: 100%; animation-delay: 2.25s; }
            
            /* Animated Success Icon */
            .success-icon {
              margin-bottom: 30px;
              position: relative;
            }
            
            .icon-container {
              position: relative;
              display: inline-block;
            }
            
            .checkmark-circle {
              color: #00ffff;
              animation: iconPulse 2s ease-in-out infinite;
            }
            
            .circle-animation {
              stroke-dasharray: 62.83;
              stroke-dashoffset: 62.83;
              animation: drawCircle 1.5s ease-out forwards;
            }
            
            .checkmark-animation {
              stroke-dasharray: 20;
              stroke-dashoffset: 20;
              animation: drawCheckmark 1s ease-out 1.5s forwards;
            }
            
            .pulse-rings {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            }
            
            .pulse-ring {
              position: absolute;
              border: 2px solid rgba(0, 255, 255, 0.3);
              border-radius: 50%;
              animation: pulseRing 2s ease-out infinite;
            }
            
            .ring-1 { width: 100px; height: 100px; animation-delay: 0s; }
            .ring-2 { width: 140px; height: 140px; animation-delay: 0.5s; }
            .ring-3 { width: 180px; height: 180px; animation-delay: 1s; }
            
            /* Futuristic Title */
            .title {
              position: relative;
              margin-bottom: 15px;
            }
            
            .title-text {
              font-family: 'Orbitron', monospace;
              font-size: 32px;
              font-weight: 900;
              color: #00ffff;
              text-shadow: 0 0 20px #00ffff;
              letter-spacing: 3px;
              animation: titleGlow 2s ease-in-out infinite alternate;
            }
            
            .title-glow {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: radial-gradient(circle, rgba(0, 255, 255, 0.3) 0%, transparent 70%);
              animation: glowPulse 3s ease-in-out infinite;
            }
            
            .subtitle {
              font-size: 16px;
              color: #88ccff;
              margin-bottom: 30px;
              font-weight: 400;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            /* Advanced Loading Container */
            .loading-container {
              margin: 30px 0;
            }
            
            .holographic-spinner {
              position: relative;
              width: 80px;
              height: 80px;
              margin: 0 auto 20px;
            }
            
            .spinner-ring {
              position: absolute;
              border: 3px solid transparent;
              border-radius: 50%;
              animation: spinnerRotate 2s linear infinite;
            }
            
            .spinner-ring.ring-1 {
              width: 80px;
              height: 80px;
              border-top-color: #00ffff;
              animation-delay: 0s;
            }
            
            .spinner-ring.ring-2 {
              width: 60px;
              height: 60px;
              border-right-color: #0088ff;
              animation-delay: 0.3s;
            }
            
            .spinner-ring.ring-3 {
              width: 40px;
              height: 40px;
              border-bottom-color: #0044ff;
              animation-delay: 0.6s;
            }
            
            .spinner-core {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 20px;
              height: 20px;
              background: #00ffff;
              border-radius: 50%;
              box-shadow: 0 0 20px #00ffff;
              animation: corePulse 1s ease-in-out infinite alternate;
            }
            
            .loading-text {
              font-size: 14px;
              color: #88ccff;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 15px;
            }
            
            .loading-progress {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 10px;
            }
            
            .progress-bar {
              width: 200px;
              height: 4px;
              background: rgba(0, 255, 255, 0.2);
              border-radius: 2px;
              overflow: hidden;
            }
            
            .progress-fill {
              height: 100%;
              background: linear-gradient(90deg, #00ffff, #0088ff);
              border-radius: 2px;
              animation: progressFill 4s ease-out forwards;
            }
            
            .progress-text {
              font-size: 12px;
              color: #88ccff;
              font-weight: 500;
            }
            
            /* User Data Display */
            .user-info {
              background: rgba(0, 40, 80, 0.5);
              border-radius: 15px;
              padding: 25px;
              margin: 25px 0;
              border: 1px solid rgba(0, 255, 255, 0.2);
              position: relative;
            }
            
            .info-header {
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 20px;
              gap: 10px;
            }
            
            .header-icon {
              font-size: 20px;
            }
            
            .info-header span {
              font-size: 14px;
              color: #00ffff;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .info-grid {
              display: grid;
              gap: 12px;
            }
            
            .info-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid rgba(0, 255, 255, 0.1);
            }
            
            .info-item:last-child {
              border-bottom: none;
            }
            
            .info-label {
              font-weight: 500;
              color: #88ccff;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            .info-value {
              font-weight: 600;
              color: #ffffff;
              font-size: 14px;
            }
            
            .product-badge {
              background: linear-gradient(135deg, #00ffff, #0088ff);
              color: #000;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
            }
            
            /* Action Buttons */
            .action-buttons {
              display: flex;
              gap: 15px;
              justify-content: center;
              margin: 30px 0;
              flex-wrap: wrap;
            }
            
            .primary-btn, .secondary-btn {
              position: relative;
              display: inline-flex;
              align-items: center;
              gap: 10px;
              padding: 15px 25px;
              border-radius: 10px;
              font-weight: 600;
              font-size: 14px;
              text-decoration: none;
              border: none;
              cursor: pointer;
              transition: all 0.3s ease;
              min-width: 180px;
              justify-content: center;
              text-transform: uppercase;
              letter-spacing: 1px;
              overflow: hidden;
            }
            
            .primary-btn {
              background: linear-gradient(135deg, #00ffff, #0088ff);
              color: #000;
              box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
            }
            
            .primary-btn:hover {
              transform: translateY(-3px);
              box-shadow: 0 0 30px rgba(0, 255, 255, 0.8);
            }
            
            .btn-glow {
              position: absolute;
              top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
              animation: btnGlow 2s ease-in-out infinite;
            }
            
            .secondary-btn {
              background: rgba(0, 255, 255, 0.1);
              color: #00ffff;
              border: 1px solid rgba(0, 255, 255, 0.3);
            }
            
            .secondary-btn:hover {
              background: rgba(0, 255, 255, 0.2);
              transform: translateY(-2px);
              box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
            }
            
            /* Status Information */
            .status-info {
              margin-top: 25px;
              padding-top: 25px;
              border-top: 1px solid rgba(0, 255, 255, 0.2);
            }
            
            .countdown-display {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              margin-bottom: 15px;
            }
            
            .countdown-label {
              font-size: 12px;
              color: #88ccff;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .countdown-timer {
              font-size: 24px;
              font-weight: 900;
              color: #00ffff;
              text-shadow: 0 0 10px #00ffff;
              animation: countdownPulse 1s ease-in-out infinite;
            }
            
            .countdown-unit {
              font-size: 12px;
              color: #88ccff;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .note {
              font-size: 12px;
              color: #88ccff;
              font-weight: 400;
              text-align: center;
            }
            
            /* Floating Elements */
            .floating-elements {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              z-index: -1;
              overflow: hidden;
            }
            
            .floating-orb {
              position: absolute;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(0, 255, 255, 0.3) 0%, transparent 70%);
              animation: orbFloat 8s ease-in-out infinite;
            }
            
            .orb-1 { width: 60px; height: 60px; top: 10%; left: 10%; animation-delay: 0s; }
            .orb-2 { width: 40px; height: 40px; top: 20%; right: 15%; animation-delay: 2s; }
            .orb-3 { width: 80px; height: 80px; bottom: 20%; left: 20%; animation-delay: 4s; }
            .orb-4 { width: 30px; height: 30px; bottom: 30%; right: 10%; animation-delay: 6s; }
            .orb-5 { width: 50px; height: 50px; top: 50%; left: 50%; animation-delay: 1s; }
            
            /* Data Stream Effect */
            .data-stream {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              z-index: -1;
              overflow: hidden;
            }
            
            .stream-line {
              position: absolute;
              width: 2px;
              background: linear-gradient(to bottom, transparent, #00ffff, transparent);
              animation: dataStream 3s linear infinite;
            }
            
            .stream-1 { left: 20%; height: 100px; animation-delay: 0s; }
            .stream-2 { left: 50%; height: 150px; animation-delay: 1s; }
            .stream-3 { left: 80%; height: 120px; animation-delay: 2s; }
            
            /* Animations */
            @keyframes gridMove {
              0% { transform: translate(0, 0); }
              100% { transform: translate(50px, 50px); }
            }
            
            @keyframes cardGlow {
              0% { box-shadow: 0 0 50px rgba(0, 255, 255, 0.3); }
              100% { box-shadow: 0 0 80px rgba(0, 255, 255, 0.6); }
            }
            
            @keyframes borderFlow {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
            
            @keyframes iconPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.1); }
            }
            
            @keyframes drawCircle {
              to { stroke-dashoffset: 0; }
            }
            
            @keyframes drawCheckmark {
              to { stroke-dashoffset: 0; }
            }
            
            @keyframes pulseRing {
              0% { transform: scale(0.8); opacity: 1; }
              100% { transform: scale(1.2); opacity: 0; }
            }
            
            @keyframes titleGlow {
              0% { text-shadow: 0 0 20px #00ffff; }
              100% { text-shadow: 0 0 30px #00ffff, 0 0 40px #00ffff; }
            }
            
            @keyframes glowPulse {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.6; }
            }
            
            @keyframes spinnerRotate {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            
            @keyframes corePulse {
              0% { box-shadow: 0 0 20px #00ffff; }
              100% { box-shadow: 0 0 40px #00ffff; }
            }
            
            @keyframes progressFill {
              0% { width: 0%; }
              100% { width: 100%; }
            }
            
            @keyframes btnGlow {
              0% { left: -100%; }
              100% { left: 100%; }
            }
            
            @keyframes countdownPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.1); }
            }
            
            @keyframes orbFloat {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              33% { transform: translateY(-30px) rotate(120deg); }
              66% { transform: translateY(20px) rotate(240deg); }
            }
            
            @keyframes dataStream {
              0% { transform: translateY(-100%); opacity: 0; }
              50% { opacity: 1; }
              100% { transform: translateY(100vh); opacity: 0; }
            }
            
            /* Responsive Design */
            @media (max-width: 480px) {
              .container {
                padding: 10px;
              }
              
              .success-card {
                padding: 30px 20px;
                border-radius: 15px;
              }
              
              .title-text {
                font-size: 24px;
              }
              
              .action-buttons {
                flex-direction: column;
                align-items: center;
              }
              
              .primary-btn, .secondary-btn {
                width: 100%;
                max-width: 280px;
              }
              
              .countdown-display {
                flex-direction: column;
                gap: 5px;
              }
            }
          </style>
          
          <script>
            // Advanced Countdown Timer with Progress
            let timeLeft = 4;
            const countdownElement = document.getElementById('countdown');
            const progressElement = document.getElementById('progress-percent');
            
            const countdown = setInterval(() => {
              timeLeft--;
              countdownElement.textContent = timeLeft;
              
              // Update progress bar
              const progress = ((4 - timeLeft) / 4) * 100;
              progressElement.textContent = Math.round(progress);
              
              if (timeLeft <= 0) {
                clearInterval(countdown);
                countdownElement.textContent = '0';
                progressElement.textContent = '100';
              }
            }, 1000);
            
            // Particle System
            function createParticles() {
              const particlesContainer = document.getElementById('particles-js');
              
              for (let i = 0; i < 50; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                const animDuration = 3 + Math.random() * 4;
                const leftPos = Math.random() * 100;
                const topPos = Math.random() * 100;
                const opacity = 0.3 + Math.random() * 0.7;
                
                particle.style.cssText = 
                  'position: absolute;' +
                  'width: 2px;' +
                  'height: 2px;' +
                  'background: #00ffff;' +
                  'border-radius: 50%;' +
                  'pointer-events: none;' +
                  'animation: particleFloat ' + animDuration + 's linear infinite;' +
                  'left: ' + leftPos + '%;' +
                  'top: ' + topPos + '%;' +
                  'opacity: ' + opacity + ';';
                particlesContainer.appendChild(particle);
              }
            }
            
            // Add particle animation CSS
            const style = document.createElement('style');
            style.textContent = 
              '@keyframes particleFloat {' +
              '  0% {' +
              '    transform: translateY(100vh) rotate(0deg);' +
              '    opacity: 0;' +
              '  }' +
              '  10% {' +
              '    opacity: 1;' +
              '  }' +
              '  90% {' +
              '    opacity: 1;' +
              '  }' +
              '  100% {' +
              '    transform: translateY(-100px) rotate(360deg);' +
              '    opacity: 0;' +
              '  }' +
              '}';
            document.head.appendChild(style);
            
            // Futuristic Entry Animation
            document.addEventListener('DOMContentLoaded', () => {
              const card = document.querySelector('.success-card');
              const title = document.querySelector('.title-text');
              const icon = document.querySelector('.success-icon');
              
              // Initial state
              card.style.opacity = '0';
              card.style.transform = 'scale(0.8) translateY(50px)';
              title.style.opacity = '0';
              title.style.transform = 'translateY(20px)';
              icon.style.opacity = '0';
              icon.style.transform = 'scale(0.5)';
              
              // Staggered animation sequence
              setTimeout(() => {
                card.style.transition = 'all 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                card.style.opacity = '1';
                card.style.transform = 'scale(1) translateY(0)';
              }, 200);
              
              setTimeout(() => {
                icon.style.transition = 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                icon.style.opacity = '1';
                icon.style.transform = 'scale(1)';
              }, 800);
              
              setTimeout(() => {
                title.style.transition = 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                title.style.opacity = '1';
                title.style.transform = 'translateY(0)';
              }, 1200);
              
              // Initialize particles
              createParticles();
              
              // Add hover effects
              const buttons = document.querySelectorAll('.primary-btn, .secondary-btn');
              buttons.forEach(btn => {
                btn.addEventListener('mouseenter', () => {
                  btn.style.transform = 'translateY(-3px) scale(1.05)';
                });
                
                btn.addEventListener('mouseleave', () => {
                  btn.style.transform = 'translateY(0) scale(1)';
                });
              });
              
              // Add click effects
              buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                  btn.style.transform = 'translateY(-1px) scale(0.98)';
                  setTimeout(() => {
                    btn.style.transform = 'translateY(0) scale(1)';
                  }, 150);
                });
              });
            });
            
            // Add glitch effect to title
            function addGlitchEffect() {
              const title = document.querySelector('.title-text');
              const glitchText = title.textContent;
              
              setInterval(() => {
                if (Math.random() > 0.95) {
                  title.style.textShadow = '2px 0 #ff0000, -2px 0 #00ffff';
                  setTimeout(() => {
                    title.style.textShadow = '0 0 20px #00ffff';
                  }, 100);
                }
              }, 2000);
            }
            
            // Initialize glitch effect
            setTimeout(addGlitchEffect, 3000);
            
            // Add data stream effect
            function createDataStream() {
              const streamContainer = document.querySelector('.data-stream');
              const characters = '01';
              
              setInterval(() => {
                const stream = document.createElement('div');
                const leftPos = Math.random() * 100;
                stream.style.cssText = 
                  'position: absolute;' +
                  'color: #00ffff;' +
                  'font-family: "Orbitron", monospace;' +
                  'font-size: 12px;' +
                  'left: ' + leftPos + '%;' +
                  'top: -20px;' +
                  'animation: dataStreamText 3s linear forwards;' +
                  'opacity: 0.7;';
                stream.textContent = characters[Math.floor(Math.random() * characters.length)];
                streamContainer.appendChild(stream);
                
                setTimeout(() => {
                  stream.remove();
                }, 3000);
              }, 200);
            }
            
            // Add data stream animation CSS
            const dataStyle = document.createElement('style');
            dataStyle.textContent = 
              '@keyframes dataStreamText {' +
              '  0% {' +
              '    transform: translateY(-20px);' +
              '    opacity: 0;' +
              '  }' +
              '  10% {' +
              '    opacity: 0.7;' +
              '  }' +
              '  90% {' +
              '    opacity: 0.7;' +
              '  }' +
              '  100% {' +
              '    transform: translateY(100vh);' +
              '    opacity: 0;' +
              '  }' +
              '}';
            document.head.appendChild(dataStyle);
            
            // Initialize data stream
            setTimeout(createDataStream, 1000);
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    }
  } catch (error) {
    console.error('❌ Auto-login error:', error);
    res.status(500).json({
      success: false,
      message: 'Auto-login failed: ' + error.message
    });
  }
});

module.exports = router; 