const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../../shared/database/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken, authorizeRole } = require('../../shared/middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../../shared/middleware/tenant');
const emailService = require('../services/emailService');
const { syncExecutiveAgentLevelsToNull } = require('../../shared/utils/agentLevelSync');

const router = express.Router();

/** CEO/Admin can manage staff; super_admin can manage all */
const AGENT_MANAGEMENT_ACTOR_ROLES = [
  'support_manager',
  'manager',
  'ceo',
  'admin',
  'super_admin'
];

// Apply tenant context to all routes
router.use(setTenantContext);

let agentMetricsSchemaEnsured = false;
const ensureAgentMetricsSchema = async () => {
  if (agentMetricsSchemaEnsured) return;
  const metricColumns = [
    { name: 'active_tickets', sql: 'ALTER TABLE agents ADD COLUMN active_tickets INT NOT NULL DEFAULT 0 AFTER department' },
    { name: 'escalation_count', sql: 'ALTER TABLE agents ADD COLUMN escalation_count INT NOT NULL DEFAULT 0 AFTER active_tickets' },
    { name: 'avg_response_minutes', sql: 'ALTER TABLE agents ADD COLUMN avg_response_minutes DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER escalation_count' },
    { name: 'avg_resolution_minutes', sql: 'ALTER TABLE agents ADD COLUMN avg_resolution_minutes DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER avg_response_minutes' }
  ];
  for (const col of metricColumns) {
    try {
      await pool.execute(col.sql);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  agentMetricsSchemaEnsured = true;
};

let agentAuthSchemaEnsured = false;
const ensureAgentAuthSchema = async () => {
  if (agentAuthSchemaEnsured) return;
  const authColumns = [
    { sql: 'ALTER TABLE agents ADD COLUMN password_hash VARCHAR(255) NULL AFTER email', dup: 'ER_DUP_FIELDNAME' },
    { sql: 'ALTER TABLE agents ADD COLUMN password_setup_token VARCHAR(255) NULL AFTER is_active', dup: 'ER_DUP_FIELDNAME' },
    { sql: 'ALTER TABLE agents ADD COLUMN password_setup_token_expires DATETIME NULL AFTER password_setup_token', dup: 'ER_DUP_FIELDNAME' },
    { sql: 'ALTER TABLE agents ADD COLUMN last_login DATETIME NULL AFTER password_setup_token_expires', dup: 'ER_DUP_FIELDNAME' }
  ];
  for (const col of authColumns) {
    try {
      await pool.execute(col.sql);
    } catch (error) {
      if (error.code !== col.dup) throw error;
    }
  }
  agentAuthSchemaEnsured = true;
};

let agentAvailabilitySchemaEnsured = false;
const ensureAgentAvailabilitySchema = async () => {
  if (agentAvailabilitySchemaEnsured) return;
  try {
    await pool.execute(
      "ALTER TABLE agents ADD COLUMN availability_status ENUM('available', 'unavailable', 'on_leave') NOT NULL DEFAULT 'available' AFTER is_active"
    );
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
  agentAvailabilitySchemaEnsured = true;
};

let agentSkillsSchemaEnsured = false;
const ensureAgentSkillsSchema = async () => {
  if (agentSkillsSchemaEnsured) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS agent_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        agent_id INT NOT NULL,
        domain VARCHAR(80) NOT NULL,
        sub_skill VARCHAR(80) NOT NULL,
        proficiency ENUM('Beginner','Intermediate','Expert') NOT NULL DEFAULT 'Beginner',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_agent_skill (tenant_id, agent_id, domain, sub_skill),
        KEY idx_agent_skill_lookup (tenant_id, domain, sub_skill, proficiency),
        KEY idx_agent_skill_agent (tenant_id, agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    agentSkillsSchemaEnsured = true;
  } catch (e) {
    console.warn('⚠️ Could not ensure agent_skills table:', e?.message || e);
    agentSkillsSchemaEnsured = true;
  }
};

const PROFI_VALUES = new Set(['Beginner', 'Intermediate', 'Expert']);
const normalizeSkillRow = (row) => {
  let domain = String(row?.domain || '').trim().slice(0, 80);
  const sub_skill = String(row?.sub_skill || row?.subSkill || '').trim().slice(0, 80);
  const profRaw = String(row?.proficiency || '').trim();
  const proficiency = PROFI_VALUES.has(profRaw) ? profRaw : 'Beginner';
  if (!domain || !sub_skill) return null;
  // Normalize common user-entered variants/typos to canonical domains used by AI.
  const d = domain.toLowerCase();
  if (d === 'developement' || d === 'dev' || d === 'development ') domain = 'Development';
  if (d === 'deployement') domain = 'Deployment';
  if (d === 'qa') domain = 'Testing';
  return { domain, sub_skill, proficiency };
};
const upsertAgentSkills = async ({ tenantId, agentId, skills }) => {
  await ensureAgentSkillsSchema();
  console.log('🛠️ upsertAgentSkills called:', { tenantId, agentId, skillsCount: Array.isArray(skills) ? skills.length : 'not-array', skills });
  const rows = Array.isArray(skills) ? skills.map(normalizeSkillRow).filter(Boolean) : [];
  console.log('🛠️ normalized rows:', rows);
  // Clear+replace for simplicity (additive; avoids partial stale data).
  const [delResult] = await pool.execute(
    'DELETE FROM agent_skills WHERE tenant_id = ? AND agent_id = ?',
    [tenantId, agentId]
  );
  console.log('🛠️ deleted existing skills:', delResult.affectedRows);
  if (!rows.length) return [];
  const values = [];
  const params = [];
  for (const r of rows) {
    values.push('(?,?,?,?,?)');
    params.push(tenantId, agentId, r.domain, r.sub_skill, r.proficiency);
  }
  const [insertResult] = await pool.execute(
    `INSERT INTO agent_skills (tenant_id, agent_id, domain, sub_skill, proficiency)
     VALUES ${values.join(',')}`,
    params
  );
  console.log('🛠️ inserted skills:', insertResult.affectedRows);
  return rows;
};

let agentLevelSchemaEnsured = false;

const ensureAgentLevelSchema = async () => {
  if (!agentLevelSchemaEnsured) {
    try {
      await pool.execute(
        "ALTER TABLE agents ADD COLUMN level ENUM('L1','L2','L3') NULL DEFAULT NULL AFTER role"
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    try {
      await pool.execute(
        "ALTER TABLE agents MODIFY COLUMN level ENUM('L1','L2','L3','MANAGER') NULL DEFAULT NULL"
      );
    } catch (error) {
      console.warn('⚠️ Could not widen agents.level enum for migration:', error.message);
    }
    try {
      await pool.execute(`
        UPDATE agents SET level = 'L1'
        WHERE level = 'MANAGER'
      `);
    } catch (error) {
      console.warn('⚠️ Could not remap legacy MANAGER level on agents:', error.message);
    }
    try {
      await pool.execute(
        "ALTER TABLE agents MODIFY COLUMN level ENUM('L1','L2','L3') NULL DEFAULT NULL"
      );
    } catch (error) {
      console.warn('⚠️ Could not finalize agents.level enum:', error.message);
    }
    try {
      await pool.execute(`
        UPDATE agents SET level = 'L1'
        WHERE level IS NULL
          AND LOWER(COALESCE(role, '')) NOT IN ('support_manager', 'manager', 'ceo', 'admin')
      `);
    } catch (error) {
      console.warn('⚠️ Could not default L1 for line agents:', error.message);
    }
    try {
      await pool.execute('CREATE INDEX idx_agents_level ON agents(level)');
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') {
        console.warn('⚠️ Could not create idx_agents_level:', error.message);
      }
    }
    agentLevelSchemaEnsured = true;
  }
  await syncExecutiveAgentLevelsToNull();
};

let agentRoleNormalizationEnsured = false;
const ensureAgentRoleNormalization = async () => {
  if (agentRoleNormalizationEnsured) return;
  try {
    // Ensure DB enum supports app role values before normalization/inserts.
    await pool.execute(`
      ALTER TABLE agents
      MODIFY COLUMN role ENUM('support_agent', 'support_manager', 'ceo') DEFAULT 'support_agent'
    `);
  } catch (error) {
    console.warn('⚠️ Could not update agents.role enum:', error.message);
  }
  try {
    // Normalize legacy/empty resolver roles to supported app roles in agents table
    await pool.execute(`
      UPDATE agents
      SET role = CASE
        WHEN role IS NULL OR TRIM(role) = '' OR role = 'agent' THEN 'support_agent'
        WHEN role = 'manager' THEN 'support_manager'
        ELSE role
      END
      WHERE role IS NULL OR TRIM(role) = '' OR role IN ('agent', 'manager')
    `);
  } catch (error) {
    console.warn('⚠️ Could not normalize agent roles:', error.message);
  }
  agentRoleNormalizationEnsured = true;
};

// Validation middleware
const validateAgentRegistration = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['support_agent', 'support_manager', 'ceo']).withMessage('Invalid role. Must be: support_agent, support_manager, or ceo'),
  body('level').custom((value, { req }) => {
    const raw = String(req.body.role || 'support_agent').toLowerCase();
    const roleNorm = raw === 'agent' ? 'support_agent' : raw === 'manager' ? 'support_manager' : raw;
    if (['support_manager', 'ceo'].includes(roleNorm)) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        throw new Error('Leave support level empty for Manager and CEO');
      }
      return true;
    }
    const lv = String(value || 'L1').trim().toUpperCase();
    if (!['L1', 'L2', 'L3'].includes(lv)) {
      throw new Error('Support level must be L1, L2, or L3 for support agents');
    }
    return true;
  }),
  body('department').optional(),
  body('manager_id').optional()
];

const validateAgentLogin = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
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
const generateToken = (agent) => {
  return jwt.sign(
    { 
      agentId: agent.id, 
      name: agent.name
    },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    { expiresIn: '24h' }
  );
};

// Helper to save manager department permissions
const saveManagerDepartmentPermissions = async (managerId, permissions) => {
  if (!Array.isArray(permissions)) return;
  
  // Clear existing permissions for simplicity
  await pool.execute(
    'DELETE FROM manager_department_permissions WHERE manager_id = ?',
    [managerId]
  );
  
  if (permissions.length === 0) return;
  
  for (const perm of permissions) {
    const {
      department_id,
      can_view = 0,
      can_update = 0,
      can_assign = 0,
      can_close = 0,
      can_view_reports = 0,
      can_manage_escalations = 0
    } = perm;
    
    if (!department_id) continue;
    
    await pool.execute(
      `INSERT INTO manager_department_permissions 
       (manager_id, department_id, can_view, can_update, can_assign, can_close, can_view_reports, can_manage_escalations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        managerId,
        department_id,
        can_view ? 1 : 0,
        can_update ? 1 : 0,
        can_assign ? 1 : 0,
        can_close ? 1 : 0,
        can_view_reports ? 1 : 0,
        can_manage_escalations ? 1 : 0
      ]
    );
  }
};

// Helper to generate secure random token
const crypto = require('crypto');
const generateSecureToken = () => crypto.randomBytes(32).toString('hex');

const findCurrentAgentRecord = async ({ tenantId, agentId, userId, email }) => {
  const idCandidates = [agentId, userId].filter((v) => v !== null && v !== undefined);
  for (const id of idCandidates) {
    let [rows] = await pool.execute(
      'SELECT id, name, email, role, availability_status, tenant_id FROM agents WHERE id = ? AND tenant_id = ? LIMIT 1',
      [id, tenantId]
    );
    if (rows.length) return rows[0];

    [rows] = await pool.execute(
      'SELECT id, name, email, role, availability_status, tenant_id FROM agents WHERE id = ? AND tenant_id IS NULL LIMIT 1',
      [id]
    );
    if (rows.length) return rows[0];

    [rows] = await pool.execute(
      'SELECT id, name, email, role, availability_status, tenant_id FROM agents WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length) return rows[0];
  }

  if (email) {
    let [rows] = await pool.execute(
      'SELECT id, name, email, role, availability_status, tenant_id FROM agents WHERE email = ? AND tenant_id = ? AND is_active = TRUE LIMIT 1',
      [email, tenantId]
    );
    if (rows.length) return rows[0];

    [rows] = await pool.execute(
      'SELECT id, name, email, role, availability_status, tenant_id FROM agents WHERE email = ? AND is_active = TRUE LIMIT 1',
      [email]
    );
    if (rows.length) return rows[0];
  }
  return null;
};

// POST /api/agents/register - Register new staff (name, email, role). Staff sets own password via setup link.
router.post('/register', authenticateToken, verifyTenantAccess, validateAgentRegistration, async (req, res) => {
  try {
    await ensureAgentLevelSchema();
    await ensureAgentAuthSchema();
    await ensureAgentAvailabilitySchema();
    await ensureAgentSkillsSchema();
    await ensureAgentLevelSchema();
    await ensureAgentRoleNormalization();
    console.log('🔍 Agent registration request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!AGENT_MANAGEMENT_ACTOR_ROLES.includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only business team or admin/manager can create staff members'
      });
    }

    const { name, email, role = 'support_agent', level, department = null, primary_department_id = null, manager_id = null, skills = [], additional_permissions = [] } = req.body;
    const rawRole = String(role).toLowerCase();
    const normalizedRole = rawRole === 'agent' ? 'support_agent' : rawRole === 'manager' ? 'support_manager' : rawRole;
    let levelForDb = null;
    if (['support_manager', 'ceo'].includes(normalizedRole)) {
      levelForDb = null;
    } else {
      const lv = String(level || 'L1').trim().toUpperCase();
      levelForDb = ['L1', 'L2', 'L3'].includes(lv) ? lv : 'L1';
    }
    console.log('📝 Parsed data:', { name, email, role: normalizedRole, level: levelForDb, department, primary_department_id, manager_id, skillsCount: skills?.length, skills });

    // Convert manager_id to integer or null
    const managerId = manager_id ? parseInt(manager_id) : null;
    console.log('🔢 Manager ID converted:', managerId);

    let primaryDeptId = primary_department_id ? parseInt(primary_department_id) : null;

    // FORCE ALIGNMENT: If the agent reports to a manager, overwrite primary department to strictly match manager's!
    if (normalizedRole === 'support_agent' && managerId) {
      const [mgrRows] = await pool.execute('SELECT primary_department_id FROM agents WHERE id = ?', [managerId]);
      if (mgrRows.length > 0 && mgrRows[0].primary_department_id) {
        primaryDeptId = mgrRows[0].primary_department_id;
      }
    }

    // Clean up department - convert empty string to null
    let cleanDepartment = department && department.trim() ? department.trim() : null;
    if (primaryDeptId) {
      const [depts] = await pool.execute('SELECT name FROM departments WHERE id = ?', [primaryDeptId]);
      if (depts.length > 0) {
        cleanDepartment = depts[0].name;
      }
    }
    console.log('🏢 Department cleaned:', cleanDepartment);

    // Check if agent already exists by name or email (tenant-filtered)
    const tenantId = req.tenantId || 1;
    const [existingAgents] = await pool.execute(
      'SELECT id FROM agents WHERE (name = ? OR email = ?) AND tenant_id = ?',
      [name, email, tenantId]
    );

    if (existingAgents.length > 0) {
      console.log('⚠️ Agent already exists:', existingAgents);
      return res.status(400).json({
        success: false,
        message: 'Agent with this name or email already exists'
      });
    }

    // Generate password setup token (expires in 7 days)
    const setupToken = generateSecureToken();
    const setupTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create agent - pending password setup (is_active=false until they set password)
    const [agentResult] = await pool.execute(
      `INSERT INTO agents (tenant_id, name, email, password_hash, role, level, department, primary_department_id, manager_id, is_active, password_setup_token, password_setup_token_expires) 
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
      [tenantId, name, email, normalizedRole, levelForDb, cleanDepartment, primaryDeptId, managerId, setupToken, setupTokenExpires]
    );

    console.log('✅ Agent created with ID:', agentResult.insertId);

    // Save manager department permissions if applicable
    if (normalizedRole === 'support_manager' && additional_permissions) {
      try {
        await saveManagerDepartmentPermissions(agentResult.insertId, additional_permissions);
      } catch (permErr) {
        console.warn('⚠️ Could not save manager department permissions:', permErr.message);
      }
    }

    // Get created agent
    const [newAgents] = await pool.execute(
      'SELECT id, name, email, role, level, department, primary_department_id, manager_id, is_active, created_at FROM agents WHERE id = ?',
      [agentResult.insertId]
    );

    const newAgent = newAgents[0];

    let skillsSaved = true;
    let skillsError = null;
    try {
      await upsertAgentSkills({ tenantId, agentId: newAgent.id, skills });
    } catch (skillErr) {
      skillsSaved = false;
      skillsError = skillErr?.message || String(skillErr);
      console.warn('⚠️ Could not store agent skills (agent still created):', skillsError);
    }

    // Build setup URL (frontend route)
    const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const setupLink = `${baseUrl}/staff/set-password?token=${setupToken}`;

    // Send setup email to staff member
    const emailResult = await emailService.sendStaffSetupEmail(email, name, setupLink);
    if (!emailResult.success) {
      console.warn('⚠️ Failed to send setup email:', emailResult.error);
    }

    // Return success - no credentials; setup_link included as fallback if admin needs to share manually
    res.status(201).json({
      success: true,
      message: skillsSaved
        ? 'Staff member created. A setup link has been sent to their email.'
        : 'Staff member created, but skills could not be saved. Please edit the agent to add skills.',
      data: {
        agent: newAgent,
        setup_link: setupLink,
        setup_token_expires: setupTokenExpires,
        email_sent: emailResult.success,
        skills_saved: skillsSaved,
        skills_error: skillsError
      }
    });

    console.log('🎉 Agent registration completed - setup link generated');

  } catch (error) {
    console.error('❌ Error registering agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register agent: ' + error.message
    });
  }
});

// POST /api/agents/login - Agent login
router.post('/login', validateAgentLogin, async (req, res) => {
  try {
    await ensureAgentAuthSchema();
    await ensureAgentAvailabilitySchema();
    await ensureAgentRoleNormalization();
    console.log('🔍 Agent login request:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, password } = req.body;
    console.log('📝 Login attempt for:', { name, passwordLength: password.length });

    // Find agent by name or email (tenant-filtered)
    const tenantId = req.tenantId || 1;
    const [agents] = await pool.execute(
      'SELECT * FROM agents WHERE (name = ? OR email = ?) AND tenant_id = ?',
      [name, name, tenantId]
    );

    console.log('🔍 Found agents:', agents.length);

    if (agents.length === 0) {
      console.log('❌ No agent found with name/email:', name);
      return res.status(401).json({
        success: false,
        message: 'Invalid name/email or password'
      });
    }

    const agent = agents[0];
    console.log('👤 Agent found:', { id: agent.id, name: agent.name, email: agent.email, is_active: agent.is_active });

    // Check if agent is active
    if (!agent.is_active) {
      console.log('❌ Agent is not active:', agent.name);
      return res.status(401).json({
        success: false,
        message: 'Agent account is not active'
      });
    }

    // Check password
    const isValidPassword = await comparePassword(password, agent.password_hash);
    console.log('🔐 Password validation:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('❌ Invalid password for agent:', agent.name);
      return res.status(401).json({
        success: false,
        message: 'Invalid name/email or password'
      });
    }

    // Update last login (tenant-filtered)
    await pool.execute(
      'UPDATE agents SET last_login = NOW() WHERE id = ? AND tenant_id = ?',
      [agent.id, tenantId]
    );

    // Generate session token
    const sessionToken = jwt.sign(
      { agentId: agent.id, name: agent.name },
      process.env.JWT_SECRET || 'your_jwt_secret_key_here',
      { expiresIn: '24h' }
    );

    // Return agent data (without password)
    const agentData = {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role || 'support_agent',
      department: agent.department,
      manager_id: agent.manager_id,
      is_active: agent.is_active,
      last_login: agent.last_login,
      availability_status: agent.availability_status || 'available'
    };

    console.log('✅ Login successful for agent:', agent.name);
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        agent: agentData,
        token: sessionToken
      }
    });
  } catch (error) {
    console.error('❌ Agent login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  }
});

// POST /api/agents/logout - Agent logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Agent logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// GET /api/agents/profile - Get agent profile
router.get('/profile', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureAgentAvailabilitySchema();
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const agent = await findCurrentAgentRecord({
      tenantId,
      agentId: req.user?.agentId,
      userId: req.user?.id,
      email: req.user?.email
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    console.error('Get agent profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get agent profile'
    });
  }
});

// PUT /api/agents/profile/availability - Agent updates own availability status
router.put(
  '/profile/availability',
  authenticateToken,
  verifyTenantAccess,
  body('availabilityStatus')
    .isIn(['available', 'unavailable', 'on_leave'])
    .withMessage('availabilityStatus must be one of: available, unavailable, on_leave'),
  async (req, res) => {
    try {
      await ensureAgentAvailabilitySchema();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const tenantId = req.tenantId || 1;
      const agentId = req.user?.agentId || req.user?.id;
      const userRole = String(req.user?.role || '').toLowerCase();
      const { availabilityStatus } = req.body;

      if (!agentId) {
        return res.status(401).json({ success: false, message: 'Invalid user context' });
      }

      if (!['support_agent', 'agent'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Only support agents can update availability status'
        });
      }

      const resolvedAgent = await findCurrentAgentRecord({
        tenantId,
        agentId: req.user?.agentId,
        userId: req.user?.id,
        email: req.user?.email
      });
      if (!resolvedAgent) {
        return res.status(404).json({ success: false, message: 'Agent not found' });
      }
      const dbRole = String(resolvedAgent.role || '').toLowerCase();
      if (!['support_agent', 'agent'].includes(dbRole)) {
        return res.status(403).json({
          success: false,
          message: 'Only support agents can update availability status'
        });
      }

      let [updateResult] = await pool.execute(
        'UPDATE agents SET availability_status = ? WHERE id = ? AND tenant_id = ?',
        [availabilityStatus, resolvedAgent.id, tenantId]
      );
      if (!updateResult.affectedRows) {
        [updateResult] = await pool.execute(
          'UPDATE agents SET availability_status = ? WHERE id = ? AND tenant_id IS NULL',
          [availabilityStatus, resolvedAgent.id]
        );
      }
      if (!updateResult.affectedRows) {
        [updateResult] = await pool.execute(
          'UPDATE agents SET availability_status = ? WHERE id = ?',
          [availabilityStatus, resolvedAgent.id]
        );
      }
      if (!updateResult.affectedRows) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found or update not applied'
        });
      }

      return res.json({
        success: true,
        message: 'Availability status updated successfully',
        data: {
          id: resolvedAgent.id,
          availability_status: availabilityStatus
        }
      });
    } catch (error) {
      console.error('Update availability status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update availability status'
      });
    }
  }
);

// GET /api/agents/team - Get agents under current manager (for reassign dropdown)
// Only support_agent role, only those whose manager_id = current manager
router.get('/team', authenticateToken, verifyTenantAccess, authorizeRole(['support_manager', 'manager', 'ceo']), async (req, res) => {
  try {
    await ensureAgentLevelSchema();
    await ensureAgentAuthSchema();
    await ensureAgentAvailabilitySchema();
    await ensureAgentRoleNormalization();
    const tenantId = req.tenantId || 1;
    const managerId = req.user?.id || req.user?.agentId;
    const isCEO = req.user?.role === 'ceo';

    let query = `
      SELECT id, name, email, role, department, manager_id, is_active, created_at,
             availability_status
      FROM agents
      WHERE is_active = TRUE
    `;
    const params = [];

    try {
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME = 'tenant_id'`
      );
      if (cols.length > 0) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }
    } catch (_) { /* tenant_id may not exist */ }

    if (isCEO) {
      query += ` AND (LOWER(COALESCE(role,'')) IN ('support_agent', 'agent'))`;
    } else {
      query += ` AND (LOWER(COALESCE(role,'')) IN ('support_agent', 'agent')) AND manager_id = ?`;
      params.push(managerId);
    }

    query += ' ORDER BY name ASC';
    const [agents] = await pool.execute(query, params);
    console.log('[agents/team] managerId=%s tenantId=%s isCEO=%s found=%d', managerId, tenantId, isCEO, agents.length);

    res.json({ success: true, data: agents });
  } catch (error) {
    console.error('Get team agents error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch team agents' });
  }
});

// GET /api/agents/by-level/:level - Get agents at a specific level (for manual escalation assignment)
router.get('/by-level/:level', authenticateToken, verifyTenantAccess, authorizeRole(['support_manager', 'manager', 'ceo', 'admin', 'support_agent', 'agent']), async (req, res) => {
  try {
    await ensureAgentLevelSchema();
    await ensureAgentRoleNormalization();
    const tenantId = req.tenantId || 1;
    const level = String(req.params.level).toUpperCase();
    const userRole = String(req.user?.role || '').toLowerCase();
    const userId = req.user?.id || req.user?.agentId;
    console.log(`[agents/by-level] level=${level} tenantId=${tenantId} userRole=${userRole} userId=${userId}`);

    // Look up the logged-in user's primary_department_id for department filtering
    let managerDeptId = null;
    if (userId && !['ceo', 'admin'].includes(userRole)) {
      const [userRows] = await pool.execute(
        'SELECT primary_department_id FROM agents WHERE id = ? AND tenant_id = ?',
        [userId, tenantId]
      );
      if (userRows.length > 0) {
        managerDeptId = userRows[0].primary_department_id;
      }
    }
    console.log(`[agents/by-level] managerDeptId=${managerDeptId}`);

    let query = `
      SELECT id, name, email, role, level, availability_status
      FROM agents
      WHERE is_active = TRUE
        AND (tenant_id = ? OR tenant_id IS NULL)
    `;
    const params = [tenantId];

    if (level === 'MANAGER') {
      query += ` AND LOWER(COALESCE(role, '')) IN ('support_manager', 'manager', 'ceo', 'admin')`;
    } else {
      query += ` AND LOWER(COALESCE(role, '')) IN ('support_agent', 'agent') AND UPPER(TRIM(level)) = ?`;
      params.push(level);
    }

    // Restrict non-CEO managers to their own department's agents
    if (managerDeptId) {
      query += ` AND primary_department_id = ?`;
      params.push(managerDeptId);
    }

    query += ' ORDER BY name ASC';
    const [agents] = await pool.execute(query, params);
    console.log(`[agents/by-level] level=${level} tenantId=${tenantId} role=${userRole} found=${agents.length} agents`);
    res.json({ success: true, data: agents });
  } catch (error) {
    console.error('Get agents by level error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch agents by level' });
  }
});

// POST /api/agents/:id/resend-setup-link - Admin resend password setup link
router.post('/:id/resend-setup-link', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const agentId = parseInt(req.params.id);
    if (isNaN(agentId)) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID' });
    }

    const [agents] = await pool.execute(
      'SELECT id, name, email, password_hash, password_setup_token FROM agents WHERE id = ? AND tenant_id = ?',
      [agentId, tenantId]
    );
    if (!agents.length) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    const agent = agents[0];

    if (agent.password_hash) {
      return res.status(400).json({ success: false, message: 'Agent has already set their password' });
    }

    const setupToken = generateSecureToken();
    const setupTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.execute(
      'UPDATE agents SET password_setup_token = ?, password_setup_token_expires = ? WHERE id = ? AND tenant_id = ?',
      [setupToken, setupTokenExpires, agentId, tenantId]
    );

    const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const setupLink = `${baseUrl}/staff/set-password?token=${setupToken}`;

    const emailResult = await emailService.sendStaffSetupEmail(agent.email, agent.name, setupLink);
    if (!emailResult.success) {
      console.warn('⚠️ Failed to send resend setup email:', emailResult.error);
    }

    res.json({
      success: true,
      message: emailResult.success ? 'Setup link sent to staff email.' : 'Setup link generated. Email could not be sent—share the link manually.',
      data: { setup_link: setupLink, expires: setupTokenExpires, email_sent: emailResult.success }
    });
  } catch (error) {
    console.error('Resend setup link error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate setup link' });
  }
});

// GET /api/agents - Get all agents
router.get('/', setTenantContext, async (req, res) => {
  try {
    await ensureAgentMetricsSchema();
    await ensureAgentAuthSchema();
    await ensureAgentAvailabilitySchema();
    await ensureAgentLevelSchema();
    await ensureAgentSkillsSchema();
    await ensureAgentRoleNormalization();
    const tenantId = req.tenantId || 1;
    try {
      // Reset persisted metrics to avoid stale values for agents with no assigned tickets
      await pool.execute(
        `UPDATE agents
         SET active_tickets = 0,
             escalation_count = 0,
             avg_response_minutes = 0,
             avg_resolution_minutes = 0
         WHERE tenant_id = ?`,
        [tenantId]
      );

      // Recalculate and persist metrics from existing ticket data
      const [metricRows] = await pool.execute(
        `SELECT
           assigned_to AS agent_id,
           SUM(CASE WHEN status IN ('new', 'in_progress', 'resolved', 'escalated') THEN 1 ELSE 0 END) AS active_tickets,
           SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalation_count,
           AVG(
             CASE
               WHEN first_response_at IS NOT NULL
                    AND created_at IS NOT NULL
                    AND TIMESTAMPDIFF(MINUTE, created_at, first_response_at) >= 0
               THEN TIMESTAMPDIFF(MINUTE, created_at, first_response_at)
             END
           ) AS avg_response_minutes,
           AVG(
             CASE
               WHEN status IN ('resolved', 'closed')
                    AND created_at IS NOT NULL
              THEN GREATEST(TIMESTAMPDIFF(MINUTE, created_at, COALESCE(resolved_at, updated_at)), 0)
             END
           ) AS avg_resolution_minutes
         FROM tickets
         WHERE tenant_id = ? AND assigned_to IS NOT NULL
         GROUP BY assigned_to`,
        [tenantId]
      );

      for (const row of metricRows || []) {
        await pool.execute(
          `UPDATE agents
           SET active_tickets = ?,
               escalation_count = ?,
               avg_response_minutes = ?,
               avg_resolution_minutes = ?
           WHERE id = ? AND tenant_id = ?`,
          [
            Number(row.active_tickets || 0),
            Number(row.escalation_count || 0),
            Number(row.avg_response_minutes || 0),
            Number(row.avg_resolution_minutes || 0),
            Number(row.agent_id),
            tenantId
          ]
        );
      }
    } catch (metricErr) {
      console.warn('⚠️ Could not persist agent metrics snapshot:', metricErr.message);
    }
    let agents;
    try {
        const [rows] = await pool.execute(
        `SELECT a.id, a.name, a.email, a.role, a.level, a.department, a.primary_department_id, a.manager_id, a.is_active, a.created_at, a.last_login,
                a.active_tickets, a.escalation_count, a.avg_response_minutes, a.avg_resolution_minutes,
                a.availability_status,
                (a.password_hash IS NULL AND a.password_setup_token IS NOT NULL) as requires_password_setup,
                d.name as department_name
         FROM agents a
         LEFT JOIN departments d ON a.primary_department_id = d.id AND d.tenant_id = a.tenant_id
         WHERE a.tenant_id = ? AND LOWER(a.role) != 'ceo'
         ORDER BY a.id DESC`,
        [tenantId]
      );
      agents = rows;
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        await ensureAgentLevelSchema();
        const [rows] = await pool.execute(
          `SELECT a.id, a.name, a.email, a.role, a.level, a.department, a.primary_department_id, a.manager_id, a.is_active, a.created_at, a.last_login,
                    a.active_tickets, a.escalation_count, a.avg_response_minutes, a.avg_resolution_minutes,
                  a.availability_status,
                  (a.password_hash IS NULL AND a.password_setup_token IS NOT NULL) as requires_password_setup,
                  d.name as department_name
           FROM agents a
           LEFT JOIN departments d ON a.primary_department_id = d.id AND d.tenant_id = a.tenant_id
           WHERE a.tenant_id = ? AND LOWER(a.role) != 'ceo'
           ORDER BY a.id DESC`,
          [tenantId]
        );
        agents = rows;
      } else throw err;
    }

    // Attach skills (manager/business dashboard use only; safe to include here since this endpoint is already staff-only usage)
    const agentIds = (agents || []).map((a) => Number(a.id)).filter(Boolean);
    let skillMap = new Map();
    try {
      if (agentIds.length) {
        const placeholders = agentIds.map(() => '?').join(', ');
        const [skillRows] = await pool.execute(
          `SELECT agent_id, domain, sub_skill, proficiency
           FROM agent_skills
           WHERE tenant_id = ? AND agent_id IN (${placeholders})
           ORDER BY agent_id ASC, domain ASC, sub_skill ASC`,
          [tenantId, ...agentIds]
        );
        skillMap = new Map();
        for (const r of skillRows || []) {
          const aid = Number(r.agent_id);
          if (!skillMap.has(aid)) skillMap.set(aid, []);
          skillMap.get(aid).push({
            domain: r.domain,
            sub_skill: r.sub_skill,
            proficiency: r.proficiency
          });
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not attach agent skills list:', e?.message || e);
    }

    res.json({
      success: true,
      data: (agents || []).map((a) => ({
        ...a,
        skills: skillMap.get(Number(a.id)) || []
      }))
    });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get agents'
    });
  }
});

// GET /api/agents/:id - Get single agent with skills
router.get('/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureAgentLevelSchema();
    await ensureAgentSkillsSchema();
    const tenantId = req.tenantId;
    const agentId = parseInt(req.params.id);

    const [agents] = await pool.execute(
      `SELECT a.id, a.name, a.email, a.role, a.level, a.department, a.primary_department_id, a.manager_id, a.is_active, a.created_at, a.last_login,
              a.active_tickets, a.escalation_count, a.avg_response_minutes, a.avg_resolution_minutes,
              a.availability_status,
              (a.password_hash IS NULL AND a.password_setup_token IS NOT NULL) as requires_password_setup,
              d.name as department_name
       FROM agents a
       LEFT JOIN departments d ON a.primary_department_id = d.id AND d.tenant_id = a.tenant_id
       WHERE a.id = ? AND a.tenant_id = ?`,
      [agentId, tenantId]
    );

    if (agents.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const agent = agents[0];
    const [skillRows] = await pool.execute(
      `SELECT domain, sub_skill, proficiency FROM agent_skills WHERE tenant_id = ? AND agent_id = ?`,
      [tenantId, agentId]
    );

    res.json({
      success: true,
      data: {
        ...agent,
        skills: skillRows || []
      }
    });
  } catch (error) {
    console.error('Get single agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to get agent' });
  }
});

// GET /api/agents/ticket-counts - Get ticket counts for each agent
router.get('/ticket-counts', setTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    console.log('🔍 Fetching agent ticket counts');
    
    const [ticketCounts] = await pool.execute(`
      SELECT 
        a.id as agent_id,
        a.name as agent_name,
        COUNT(t.id) as ticket_count
      FROM agents a
      LEFT JOIN tickets t ON a.id = t.assigned_to AND t.tenant_id = a.tenant_id
      WHERE a.is_active = TRUE AND a.tenant_id = ?
      GROUP BY a.id, a.name
      ORDER BY ticket_count DESC, a.name ASC
    `, [tenantId]);
    
    console.log('✅ Found ticket counts for', ticketCounts.length, 'agents');
    
    res.json({
      success: true,
      data: ticketCounts
    });
    
  } catch (error) {
    console.error('❌ Error fetching agent ticket counts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent ticket counts: ' + error.message
    });
  }
});

// DELETE /api/agents/:id - Delete agent and reassign tickets
router.delete('/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const agentId = parseInt(req.params.id);
    console.log('🗑️ Agent deletion request for ID:', agentId);

    if (isNaN(agentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agent ID'
      });
    }

    // First, get agent details to check if they have assigned tickets (tenant-filtered)
    const [agents] = await pool.execute(
      'SELECT * FROM agents WHERE id = ? AND tenant_id = ?',
      [agentId, tenantId]
    );

    if (agents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    const agent = agents[0];
    console.log('🔍 Found agent:', agent.name, 'Role:', agent.role);

    // Check if agent has assigned tickets (tenant-filtered)
    const [assignedTickets] = await pool.execute(
      'SELECT COUNT(*) as ticketCount FROM tickets WHERE assigned_to = ? AND tenant_id = ?',
      [agentId, tenantId]
    );

    const ticketCount = assignedTickets[0].ticketCount;
    console.log('📋 Agent has', ticketCount, 'assigned tickets');

    // If agent has tickets, reassign them to another available agent
    if (ticketCount > 0) {
      // Find another available agent (preferably same role, tenant-filtered)
      const [availableAgents] = await pool.execute(
        'SELECT id, name, role FROM agents WHERE id != ? AND is_active = TRUE AND tenant_id = ? ORDER BY role = ? DESC, id ASC LIMIT 1',
        [agentId, tenantId, agent.role]
      );

      if (availableAgents.length > 0) {
        const newAgent = availableAgents[0];
        console.log('🔄 Reassigning tickets to:', newAgent.name, 'Role:', newAgent.role);

        // Reassign all tickets to the new agent (tenant-filtered)
        await pool.execute(
          'UPDATE tickets SET assigned_to = ? WHERE assigned_to = ? AND tenant_id = ?',
          [newAgent.id, agentId, tenantId]
        );

        console.log('✅ Reassigned', ticketCount, 'tickets to', newAgent.name);
      } else {
        // If no other agents available, assign tickets to system (unassigned, tenant-filtered)
        await pool.execute(
          'UPDATE tickets SET assigned_to = NULL WHERE assigned_to = ? AND tenant_id = ?',
          [agentId, tenantId]
        );
        console.log('⚠️ No other agents available, tickets set to unassigned');
      }
    }

    // Delete agent from agents table (tenant-filtered)
    await pool.execute(
      'DELETE FROM agents WHERE id = ? AND tenant_id = ?',
      [agentId, tenantId]
    );

    // Note: Agents are only stored in agents table, not users table

    console.log('✅ Agent deleted successfully:', agent.name);

    res.json({
      success: true,
      message: `Agent ${agent.name} deleted successfully. ${ticketCount > 0 ? `${ticketCount} tickets were reassigned.` : ''}`,
      data: {
        deletedAgent: {
          id: agent.id,
          name: agent.name,
          role: agent.role
        },
        ticketsReassigned: ticketCount
      }
    });

  } catch (error) {
    console.error('❌ Error deleting agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agent: ' + error.message
    });
  }
});

// PUT /api/agents/:id - Update agent
router.put('/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureAgentLevelSchema();
    await ensureAgentSkillsSchema();
    await ensureAgentRoleNormalization();
    const tenantId = req.tenantId;
    const agentId = parseInt(req.params.id);
    const { name, email, role, level, is_active, skills, primary_department_id, manager_id, additional_permissions, department } = req.body;

    console.log('🔍 Updating agent:', { agentId, name, email, role, is_active, primary_department_id, manager_id });

    // Check if agent exists (tenant-filtered)
    const [agents] = await pool.execute(
      'SELECT id, name, role, primary_department_id, manager_id FROM agents WHERE id = ? AND tenant_id = ?',
      [agentId, tenantId]
    );

    if (agents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    const existingRole = String(agents[0].role || '').toLowerCase();
    let resolvedRole = existingRole;

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }

    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }

    if (role !== undefined) {
      const roleAliases = { agent: 'support_agent', manager: 'support_manager' };
      const normalizedRole = roleAliases[String(role).toLowerCase()] || String(role).toLowerCase();
      if (!['support_agent', 'support_manager', 'ceo'].includes(normalizedRole)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be support_agent, support_manager, or ceo'
        });
      }
      updateFields.push('role = ?');
      updateValues.push(normalizedRole);
      resolvedRole = normalizedRole;
      if (['support_manager', 'ceo'].includes(normalizedRole)) {
        updateFields.push('level = NULL');
      } else if (
        normalizedRole === 'support_agent' &&
        ['support_manager', 'ceo'].includes(existingRole) &&
        level === undefined
      ) {
        updateFields.push('level = ?');
        updateValues.push('L1');
      }
    }

    if (level !== undefined) {
      const actorRole = String(req.user?.role || '').toLowerCase();
      if (!AGENT_MANAGEMENT_ACTOR_ROLES.includes(actorRole)) {
        return res.status(403).json({
          success: false,
          message: 'Only business team or admin/manager can update support level'
        });
      }
      if (level === null || level === '') {
        if (['support_manager', 'ceo'].includes(resolvedRole)) {
          updateFields.push('level = NULL');
        } else {
          updateFields.push('level = ?');
          updateValues.push('L1');
        }
      } else if (['support_manager', 'ceo'].includes(resolvedRole)) {
        return res.status(400).json({
          success: false,
          message: 'Support level is not stored for Manager or CEO'
        });
      } else {
        const normalizedLevel = String(level).toUpperCase();
        if (!['L1', 'L2', 'L3'].includes(normalizedLevel)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid support level. Must be L1, L2, or L3'
          });
        }
        updateFields.push('level = ?');
        updateValues.push(normalizedLevel);
      }
    }

    const finalManagerId = manager_id !== undefined
      ? (manager_id ? parseInt(manager_id) : null)
      : agents[0].manager_id;

    let finalPrimaryDeptId = primary_department_id !== undefined
      ? (primary_department_id ? parseInt(primary_department_id) : null)
      : agents[0].primary_department_id;

    // FORCE ALIGNMENT: If the agent reports to a manager, overwrite primary department to strictly match manager's!
    if (resolvedRole === 'support_agent' && finalManagerId) {
      const [mgrRows] = await pool.execute('SELECT primary_department_id FROM agents WHERE id = ?', [finalManagerId]);
      if (mgrRows.length > 0 && mgrRows[0].primary_department_id) {
        finalPrimaryDeptId = mgrRows[0].primary_department_id;
      }
    }

    if (primary_department_id !== undefined || finalPrimaryDeptId !== agents[0].primary_department_id) {
      updateFields.push('primary_department_id = ?');
      updateValues.push(finalPrimaryDeptId);
      
      let cleanDepartment = null;
      if (finalPrimaryDeptId) {
        const [depts] = await pool.execute('SELECT name FROM departments WHERE id = ?', [finalPrimaryDeptId]);
        if (depts.length > 0) {
          cleanDepartment = depts[0].name;
        }
      }
      updateFields.push('department = ?');
      updateValues.push(cleanDepartment);
    } else if (department !== undefined) {
      updateFields.push('department = ?');
      updateValues.push(department && String(department).trim() ? String(department).trim() : null);
    }

    if (manager_id !== undefined) {
      updateFields.push('manager_id = ?');
      updateValues.push(finalManagerId);
    }

    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateValues.push(agentId, tenantId);

    await pool.execute(
      `UPDATE agents SET ${updateFields.join(', ')} WHERE id = ? AND tenant_id = ?`,
      updateValues
    );

    if (additional_permissions !== undefined && ['support_manager', 'manager'].includes(resolvedRole)) {
      try {
        await saveManagerDepartmentPermissions(agentId, additional_permissions);
      } catch (permErr) {
        console.warn('⚠️ Could not update manager department permissions:', permErr.message);
      }
    }

    if (skills !== undefined) {
      try {
        console.log('💾 Saving skills for agent:', agentId, 'Skills:', skills);
        await upsertAgentSkills({ tenantId, agentId, skills });
      } catch (skillErr) {
        console.warn('⚠️ Could not update agent skills (other updates applied):', skillErr?.message || skillErr);
      }
    }

    console.log('✅ Agent updated successfully:', agentId);

    res.json({
      success: true,
      message: 'Agent updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agent: ' + error.message
    });
  }
});

module.exports = router; 
