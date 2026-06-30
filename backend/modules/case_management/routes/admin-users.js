/**
 * Admin Users API Routes
 * Handles CRUD operations for user management
 * Endpoints:
 * - GET    /api/admin/users - List all users with pagination, search, filters
 * - POST   /api/admin/users - Create new user
 * - GET    /api/admin/users/:id - Get user details
 * - PUT    /api/admin/users/:id - Update user
 * - DELETE /api/admin/users/:id - Delete user
 * - POST   /api/admin/users/:id/reset-password - Reset user password
 * - POST   /api/admin/users/:id/lock - Lock user account
 * - POST   /api/admin/users/:id/unlock - Unlock user account
 * - POST   /api/admin/users/:id/deactivate - Deactivate user
 * - POST   /api/admin/users/:id/activate - Activate user
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');
const bcrypt = require('bcrypt');

// Middleware to verify admin role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (decoded.role !== 'system_admin' && decoded.role !== 'support_manager' && decoded.role !== 'hr_executive') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /api/admin/users - List users
router.get('/', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const { search, role, department, status, page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT u.*, d.name as department_name, 
        (SELECT COUNT(*) FROM cases WHERE created_by = u.id AND status IN ('new','in_progress','escalated','waiting')) as active_tickets_count,
        (SELECT COUNT(*) FROM cases WHERE created_by = u.id) as ticket_count,
        COALESCE(u.can_handle_confidential_cases, 0) as can_handle_confidential_cases
      FROM users u
      LEFT JOIN departments d ON u.department = d.name
      WHERE (u.tenant_id = ? OR u.tenant_id IS NULL)
    `;
    const params = [tenantId];
    
    if (search) {
      query += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (role) {
      query += ` AND u.role = ?`;
      params.push(role);
    }
    
    if (department) {
      query += ` AND u.department = ?`;
      params.push(department);
    }
    
    if (status === 'active') {
      query += ` AND (u.account_status = 'active' OR (u.account_status IS NULL AND COALESCE(u.is_active, 1) = 1))`;
    } else if (status === 'inactive') {
      query += ` AND (u.account_status = 'inactive' OR u.is_active = 0)`;
    }
    
    query += ` ORDER BY u.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const [users] = await connection.execute(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM users WHERE (tenant_id = ? OR tenant_id IS NULL)`;
    const countParams = [tenantId];
    if (search) {
      countQuery += ` AND (name LIKE ? OR email LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      countQuery += ` AND role = ?`;
      countParams.push(role);
    }
    if (department) {
      countQuery += ` AND department = ?`;
      countParams.push(department);
    }
    if (status === 'active') {
      countQuery += ` AND (account_status = 'active' OR (account_status IS NULL AND COALESCE(is_active, 1) = 1))`;
    } else if (status === 'inactive') {
      countQuery += ` AND (account_status = 'inactive' OR is_active = 0)`;
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users - Create user
router.post('/', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { name, email, role, department, phone, password, can_handle_confidential_cases } = req.body;
    
    if (!name || !email || !role) {
      connection.release();
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }
    
    // Validate can_handle_confidential_cases - only allowed for hr_executive and department_head
    let canHandleConfidential = 0;
    if (can_handle_confidential_cases && (role === 'hr_executive' || role === 'department_head')) {
      canHandleConfidential = 1;
    }
    
    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    
    const [result] = await connection.execute(
      `INSERT INTO users (tenant_id, name, email, password, role, department, phone, is_active, can_handle_confidential_cases) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [tenantId, name, email, passwordHash, role, department || null, phone || null, canHandleConfidential]
    );
    
    // Ensure employee_id is set (fallback if trigger didn't run)
    try {
      const [newUser] = await connection.execute(`SELECT employee_id FROM users WHERE id = ?`, [result.insertId]);
      if (!newUser[0]?.employee_id) {
        const [existing] = await connection.execute(`SELECT employee_id FROM users WHERE employee_id IS NOT NULL ORDER BY id DESC LIMIT 1`);
        let nextNum = 1;
        if (existing.length > 0 && existing[0].employee_id) {
          const match = existing[0].employee_id.match(/(\d+)$/);
          nextNum = match ? parseInt(match[1]) + 1 : 1;
        }
        const employeeId = `EMP-${String(nextNum).padStart(3, '0')}`;
        await connection.execute(`UPDATE users SET employee_id = ? WHERE id = ?`, [employeeId, result.insertId]);
      }
    } catch (e) {
      console.log('employee_id fallback skipped:', e.message);
    }
    
    // Log audit
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id, req.user.name, req.user.role, 'CREATE', 'user', result.insertId, 
         JSON.stringify({ name, email, role, department })]
      );
    } catch (e) {
      console.log('Audit log insert skipped:', e.message);
    }
    
    connection.release();
    
    res.status(201).json({ id: result.insertId, message: 'User created successfully' });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// GET /api/admin/users/:id - Get user details
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [users] = await connection.execute(
      `SELECT u.*, d.name as department_name, d.id as department_id,
        u.last_login as last_active_at,
        u.last_login as last_login_at,
        'Web' as last_login_device,
        CASE WHEN u.account_status = 'active' OR (u.account_status IS NULL AND COALESCE(u.is_active, 1) = 1) THEN 'active' ELSE 'inactive' END as status,
        0 as failed_login_attempts,
        (SELECT COUNT(*) FROM cases WHERE created_by = u.id) as ticket_count,
        (SELECT COUNT(*) FROM cases WHERE created_by = u.id AND status = 'new') as open_tickets,
        (SELECT COUNT(*) FROM cases WHERE created_by = u.id AND status = 'closed') as closed_tickets,
        COALESCE(u.can_handle_confidential_cases, 0) as can_handle_confidential_cases
      FROM users u
      LEFT JOIN departments d ON u.department = d.name
      WHERE u.id = ? AND (u.tenant_id = ? OR u.tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );

    console.log('User detail query result:', users[0]);

    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }

    connection.release();

    res.json({ data: users[0] });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { name, email, role, department, phone, is_active, can_handle_confidential_cases } = req.body;
    
    const [users] = await connection.execute(
      `SELECT id FROM users WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Validate can_handle_confidential_cases - only allowed for hr_executive and department_head
    let canHandleConfidential = 0;
    if (can_handle_confidential_cases && (role === 'hr_executive' || role === 'department_head')) {
      canHandleConfidential = 1;
    }
    
    await connection.execute(
      `UPDATE users SET name = ?, email = ?, role = ?, department = ?, phone = ?, can_handle_confidential_cases = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [name, email, role, department || null, phone || null, canHandleConfidential, req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'user', req.params.id, 
       JSON.stringify({ name, email, role, department })]
    );
    
    connection.release();
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    console.error('Error details:', { message: error.message, code: error.code, sql: error.sql });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [users] = await connection.execute(
      `SELECT id FROM users WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }
    
    await connection.execute(
      `DELETE FROM users WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'DELETE', 'user', req.params.id, null]
    );
    
    connection.release();
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { new_password } = req.body;
    
    if (!new_password) {
      connection.release();
      return res.status(400).json({ error: 'New password is required' });
    }
    
    const [users] = await connection.execute(
      `SELECT id FROM users WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }
    
    const passwordHash = await bcrypt.hash(new_password, 10);
    
    await connection.execute(
      `UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [passwordHash, req.params.id, tenantId]
    );

    // Log audit (non-fatal)
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id || null, req.user.name || null, req.user.role || null, 'PASSWORD_RESET', 'user', req.params.id, null]
      );
    } catch (auditErr) {
      console.log('Audit log insert skipped:', auditErr.message);
    }

    connection.release();
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    console.error('Error details:', { message: error.message, code: error.code, sql: error.sql });
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

// POST /api/admin/users/:id/lock - Lock user account
router.post('/:id/lock', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [users] = await connection.execute(
      `SELECT id FROM users WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }
    
    await connection.execute(
      `UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'LOCK', 'user', req.params.id, null]
    );
    
    connection.release();
    
    res.json({ message: 'User locked successfully' });
  } catch (error) {
    console.error('Error locking user:', error);
    res.status(500).json({ error: 'Failed to lock user' });
  }
});

// POST /api/admin/users/:id/unlock - Unlock user account
router.post('/:id/unlock', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [users] = await connection.execute(
      `SELECT id FROM users WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'User not found' });
    }
    
    await connection.execute(
      `UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'UNLOCK', 'user', req.params.id, null]
    );
    
    connection.release();
    
    res.json({ message: 'User unlocked successfully' });
  } catch (error) {
    console.error('Error unlocking user:', error);
    res.status(500).json({ error: 'Failed to unlock user' });
  }
});

module.exports = router;
