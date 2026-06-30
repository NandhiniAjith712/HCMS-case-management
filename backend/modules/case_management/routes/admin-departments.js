/**
 * Admin Departments API Routes
 * Handles CRUD operations for departments and their subcategories
 * Endpoints:
 * - GET    /api/admin/departments - List all departments with pagination, search, filters
 * - POST   /api/admin/departments - Create new department
 * - GET    /api/admin/departments/:id - Get department details with subcategories
 * - PUT    /api/admin/departments/:id - Update department
 * - DELETE /api/admin/departments/:id - Delete department
 * - POST   /api/admin/departments/:id/subcategories - Add subcategory
 * - PUT    /api/admin/departments/:id/subcategories/:subId - Update subcategory
 * - DELETE /api/admin/departments/:id/subcategories/:subId - Delete subcategory
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');
const multer = require('multer');
const path = require('path');
const { verifyToken } = require('../../auth/services/auth.service');

const ADMIN_ROLES = ['system_admin', 'support_manager', 'hr_executive'];

// Middleware to verify admin role using proper JWT verification
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyToken(token);
    if (!ADMIN_ROLES.includes(decoded.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Normalize req.user fields used by audit logs and route logic
    req.user = {
      id: decoded.userId || decoded.id,
      userId: decoded.userId || decoded.id,
      role: decoded.role,
      tenant_id: decoded.tenant_id || decoded.tenantId || 1,
      tenantId: decoded.tenant_id || decoded.tenantId || 1,
      name: decoded.name || decoded.email || decoded.role
    };
    next();
  } catch (error) {
    console.error('[admin-departments] Admin auth failed:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// GET /api/admin/departments - List departments
router.get('/', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const { search, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, 
        (SELECT COUNT(*) FROM department_subcategories WHERE department_id = d.id AND is_active = 1) as subcategory_count,
        (SELECT COUNT(*) FROM cases WHERE department = d.name) as ticket_count,
        u.name as head_name, u.email as head_email
      FROM departments d
      LEFT JOIN users u ON d.head_id = u.id
      WHERE (d.tenant_id = ? OR d.tenant_id IS NULL)
    `;
    const params = [tenantId];
    
    if (search) {
      query += ` AND (d.name LIKE ? OR d.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
      query += ` AND d.status = ?`;
      params.push(status);
    }
    
    query += ` ORDER BY d.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const [departments] = await connection.execute(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM departments WHERE (tenant_id = ? OR tenant_id IS NULL)`;
    const countParams = [tenantId];
    if (search) {
      countQuery += ` AND (name LIKE ? OR description LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      data: departments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments', details: error.message });
  }
});

// POST /api/admin/departments - Create department
router.post('/', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { name, description, head_id, head_title, status = 'active' } = req.body;
    
    if (!name) {
      connection.release();
      return res.status(400).json({ error: 'Department name is required' });
    }
    
    const [result] = await connection.execute(
      `INSERT INTO departments (tenant_id, name, description, head_id, head_title, status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, name, description, head_id || null, head_title || null, status, req.user.id]
    );
    
    // Log audit (non-fatal)
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id, req.user.name, req.user.role, 'CREATE', 'department', result.insertId, 
         JSON.stringify({ name, description, head_id, head_title })]
      );
    } catch (auditErr) {
      console.warn('[admin-departments] Audit log skipped for department create:', auditErr.message);
    }
    
    connection.release();
    
    res.status(201).json({ id: result.insertId, message: 'Department created successfully' });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error creating department:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Department with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create department', details: error.message });
  }
});

// GET /api/admin/departments/:id - Get department details
router.get('/:id', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [departments] = await connection.execute(
      `SELECT d.*, u.name as head_name, u.email as head_email 
       FROM departments d 
       LEFT JOIN users u ON d.head_id = u.id 
       WHERE d.id = ? AND (d.tenant_id = ? OR d.tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (departments.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Department not found' });
    }
    
    const [subcategories] = await connection.execute(
      `SELECT * FROM department_subcategories WHERE department_id = ? ORDER BY display_order`,
      [req.params.id]
    );
    
    connection.release();
    
    res.json({ ...departments[0], subcategories });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error fetching department:', error);
    res.status(500).json({ error: 'Failed to fetch department', details: error.message });
  }
});

// PUT /api/admin/departments/:id - Update department
router.put('/:id', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { name, description, head_id, head_title, status } = req.body;
    
    const [departments] = await connection.execute(
      `SELECT id FROM departments WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (departments.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Department not found' });
    }
    
    await connection.execute(
      `UPDATE departments SET name = ?, description = ?, head_id = ?, head_title = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [name, description, head_id || null, head_title || null, status, req.params.id, tenantId]
    );
    
    // Log audit (non-fatal)
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'department', req.params.id, 
         JSON.stringify({ name, description, head_id, head_title, status })]
      );
    } catch (auditErr) {
      console.warn('[admin-departments] Audit log skipped for department update:', auditErr.message);
    }
    
    connection.release();
    
    res.json({ message: 'Department updated successfully' });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error updating department:', error);
    res.status(500).json({ error: 'Failed to update department', details: error.message });
  }
});

// DELETE /api/admin/departments/:id - Delete department
router.delete('/:id', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [departments] = await connection.execute(
      `SELECT id FROM departments WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (departments.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Department not found' });
    }
    
    await connection.execute(
      `DELETE FROM departments WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    // Log audit (non-fatal)
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id, req.user.name, req.user.role, 'DELETE', 'department', req.params.id, null]
      );
    } catch (auditErr) {
      console.warn('[admin-departments] Audit log skipped for department delete:', auditErr.message);
    }
    
    connection.release();
    
    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error deleting department:', error);
    res.status(500).json({ error: 'Failed to delete department', details: error.message });
  }
});

// POST /api/admin/departments/:id/subcategories - Add subcategory
router.post('/:id/subcategories', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { name, description, display_order } = req.body;
    
    if (!name) {
      connection.release();
      return res.status(400).json({ error: 'Subcategory name is required' });
    }
    
    const [result] = await connection.execute(
      `INSERT INTO department_subcategories (tenant_id, department_id, name, description, display_order) 
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, req.params.id, name, description || null, display_order || 0]
    );
    
    // Log audit (non-fatal)
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id, req.user.name, req.user.role, 'CREATE', 'subcategory', result.insertId, 
         JSON.stringify({ department_id: req.params.id, name, description })]
      );
    } catch (auditErr) {
      console.warn('[admin-departments] Audit log skipped for subcategory create:', auditErr.message);
    }
    
    connection.release();
    
    res.status(201).json({ id: result.insertId, message: 'Subcategory added successfully' });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error adding subcategory:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Subcategory with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to add subcategory', details: error.message });
  }
});

// PUT /api/admin/departments/:id/subcategories/:subId - Update subcategory
router.put('/:id/subcategories/:subId', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { name, description, display_order, is_active } = req.body;
    
    const [subcategories] = await connection.execute(
      `SELECT id FROM department_subcategories WHERE id = ? AND department_id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.subId, req.params.id, tenantId]
    );
    
    if (subcategories.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    await connection.execute(
      `UPDATE department_subcategories SET name = ?, description = ?, display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND department_id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [name, description, display_order, is_active, req.params.subId, req.params.id, tenantId]
    );
    
    // Log audit (non-fatal)
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'subcategory', req.params.subId, 
         JSON.stringify({ name, description, display_order, is_active })]
      );
    } catch (auditErr) {
      console.warn('[admin-departments] Audit log skipped for subcategory update:', auditErr.message);
    }
    
    connection.release();
    
    res.json({ message: 'Subcategory updated successfully' });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error updating subcategory:', error);
    res.status(500).json({ error: 'Failed to update subcategory', details: error.message });
  }
});

// DELETE /api/admin/departments/:id/subcategories/:subId - Delete subcategory
router.delete('/:id/subcategories/:subId', requireAdmin, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [subcategories] = await connection.execute(
      `SELECT id FROM department_subcategories WHERE id = ? AND department_id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.subId, req.params.id, tenantId]
    );
    
    if (subcategories.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    await connection.execute(
      `DELETE FROM department_subcategories WHERE id = ? AND department_id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.subId, req.params.id, tenantId]
    );
    
    // Log audit (non-fatal)
    try {
      await connection.execute(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, req.user.id, req.user.name, req.user.role, 'DELETE', 'subcategory', req.params.subId, null]
      );
    } catch (auditErr) {
      console.warn('[admin-departments] Audit log skipped for subcategory delete:', auditErr.message);
    }
    
    connection.release();
    
    res.json({ message: 'Subcategory deleted successfully' });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error deleting subcategory:', error);
    res.status(500).json({ error: 'Failed to delete subcategory', details: error.message });
  }
});

module.exports = router;
