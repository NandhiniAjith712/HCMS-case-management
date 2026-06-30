/**
 * Admin Routing Rules API Routes
 * Handles CRUD operations for ticket statuses, priority levels, and routing rules
 * Endpoints:
 * - GET    /api/admin/routing/statuses - List all ticket statuses
 * - POST   /api/admin/routing/statuses - Create new status
 * - PUT    /api/admin/routing/statuses/:id - Update status
 * - DELETE /api/admin/routing/statuses/:id - Delete status
 * - GET    /api/admin/routing/priorities - List all priority levels
 * - POST   /api/admin/routing/priorities - Create new priority
 * - PUT    /api/admin/routing/priorities/:id - Update priority
 * - DELETE /api/admin/routing/priorities/:id - Delete priority
 * - GET    /api/admin/routing/rules - List all routing rules
 * - POST   /api/admin/routing/rules - Create new routing rule
 * - PUT    /api/admin/routing/rules/:id - Update routing rule
 * - DELETE /api/admin/routing/rules/:id - Delete routing rule
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');

// Middleware to verify admin role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (decoded.role !== 'system_admin' && decoded.role !== 'support_manager') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== STATUSES ====================

// GET /api/admin/routing/statuses - List statuses
router.get('/statuses', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [statuses] = await connection.execute(
      `SELECT * FROM ticket_statuses WHERE tenant_id = ? ORDER BY display_order, label`,
      [tenantId]
    );
    
    connection.release();
    
    res.json(statuses);
  } catch (error) {
    console.error('Error fetching statuses:', error);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
});

// POST /api/admin/routing/statuses - Create status
router.post('/statuses', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { label, color, description, display_order, is_active = true } = req.body;
    
    if (!label) {
      connection.release();
      return res.status(400).json({ error: 'Status label is required' });
    }
    
    const [result] = await connection.execute(
      `INSERT INTO ticket_statuses (tenant_id, label, color, description, display_order, is_active) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, label, color || '#6366F1', description, display_order || 0, is_active ? 1 : 0]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'CREATE', 'ticket_status', result.insertId, 
       JSON.stringify({ label, color, description })]
    );
    
    connection.release();
    
    res.status(201).json({ id: result.insertId, message: 'Status created successfully' });
  } catch (error) {
    console.error('Error creating status:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Status with this label already exists' });
    }
    res.status(500).json({ error: 'Failed to create status' });
  }
});

// PUT /api/admin/routing/statuses/:id - Update status
router.put('/statuses/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { label, color, description, display_order, is_active } = req.body;
    
    const [statuses] = await connection.execute(
      `SELECT id FROM ticket_statuses WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    if (statuses.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Status not found' });
    }
    
    await connection.execute(
      `UPDATE ticket_statuses SET label = ?, color = ?, description = ?, display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND tenant_id = ?`,
      [label, color, description, display_order, is_active ? 1 : 0, req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'ticket_status', req.params.id, 
       JSON.stringify({ label, color, description, is_active })]
    );
    
    connection.release();
    
    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/admin/routing/statuses/:id - Delete status
router.delete('/statuses/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [statuses] = await connection.execute(
      `SELECT id FROM ticket_statuses WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    if (statuses.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Status not found' });
    }
    
    await connection.execute(
      `DELETE FROM ticket_statuses WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'DELETE', 'ticket_status', req.params.id, null]
    );
    
    connection.release();
    
    res.json({ message: 'Status deleted successfully' });
  } catch (error) {
    console.error('Error deleting status:', error);
    res.status(500).json({ error: 'Failed to delete status' });
  }
});

// ==================== PRIORITIES ====================

// GET /api/admin/routing/priorities - List priorities
router.get('/priorities', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [priorities] = await connection.execute(
      `SELECT * FROM priority_levels WHERE tenant_id = ? ORDER BY sla_value, label`,
      [tenantId]
    );
    
    connection.release();
    
    res.json(priorities);
  } catch (error) {
    console.error('Error fetching priorities:', error);
    res.status(500).json({ error: 'Failed to fetch priorities' });
  }
});

// POST /api/admin/routing/priorities - Create priority
router.post('/priorities', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { label, color, sla_value, sla_unit = 'days', is_active = true } = req.body;
    
    if (!label || !sla_value) {
      connection.release();
      return res.status(400).json({ error: 'Priority label and SLA value are required' });
    }
    
    const [result] = await connection.execute(
      `INSERT INTO priority_levels (tenant_id, label, color, sla_value, sla_unit, is_active) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, label, color || '#94A3B8', sla_value, sla_unit, is_active ? 1 : 0]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'CREATE', 'priority_level', result.insertId, 
       JSON.stringify({ label, color, sla_value, sla_unit })]
    );
    
    connection.release();
    
    res.status(201).json({ id: result.insertId, message: 'Priority created successfully' });
  } catch (error) {
    console.error('Error creating priority:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Priority with this label already exists' });
    }
    res.status(500).json({ error: 'Failed to create priority' });
  }
});

// PUT /api/admin/routing/priorities/:id - Update priority
router.put('/priorities/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { label, color, sla_value, sla_unit, is_active } = req.body;
    
    const [priorities] = await connection.execute(
      `SELECT id FROM priority_levels WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    if (priorities.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    await connection.execute(
      `UPDATE priority_levels SET label = ?, color = ?, sla_value = ?, sla_unit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND tenant_id = ?`,
      [label, color, sla_value, sla_unit, is_active ? 1 : 0, req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'priority_level', req.params.id, 
       JSON.stringify({ label, color, sla_value, sla_unit, is_active })]
    );
    
    connection.release();
    
    res.json({ message: 'Priority updated successfully' });
  } catch (error) {
    console.error('Error updating priority:', error);
    res.status(500).json({ error: 'Failed to update priority' });
  }
});

// DELETE /api/admin/routing/priorities/:id - Delete priority
router.delete('/priorities/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [priorities] = await connection.execute(
      `SELECT id FROM priority_levels WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    if (priorities.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Priority not found' });
    }
    
    await connection.execute(
      `DELETE FROM priority_levels WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'DELETE', 'priority_level', req.params.id, null]
    );
    
    connection.release();
    
    res.json({ message: 'Priority deleted successfully' });
  } catch (error) {
    console.error('Error deleting priority:', error);
    res.status(500).json({ error: 'Failed to delete priority' });
  }
});

// ==================== ROUTING RULES ====================

// GET /api/admin/routing/rules - List routing rules
router.get('/rules', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const { department, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT r.*, d.name as department_name, p.label as priority_label, p.color as priority_color
      FROM routing_rules r
      LEFT JOIN departments d ON r.department_id = d.id
      LEFT JOIN priority_levels p ON r.default_priority_id = p.id
      WHERE r.tenant_id = ?
    `;
    const params = [tenantId];
    
    if (department) {
      query += ` AND r.department_id = ?`;
      params.push(department);
    }
    
    if (status) {
      query += ` AND r.status = ?`;
      params.push(status);
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const [rules] = await connection.execute(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM routing_rules WHERE tenant_id = ?`;
    const countParams = [tenantId];
    if (department) {
      countQuery += ` AND department_id = ?`;
      countParams.push(department);
    }
    if (status) {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      data: rules,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching routing rules:', error);
    res.status(500).json({ error: 'Failed to fetch routing rules' });
  }
});

// POST /api/admin/routing/rules - Create routing rule
router.post('/rules', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { department_id, initial_owner_role, escalation_owner_role, default_priority_id, sla_value, sla_unit = 'days', status = 'active' } = req.body;
    
    if (!department_id || !initial_owner_role || !escalation_owner_role || !sla_value) {
      connection.release();
      return res.status(400).json({ error: 'Department, initial owner, escalation owner, and SLA value are required' });
    }
    
    const [result] = await connection.execute(
      `INSERT INTO routing_rules (tenant_id, department_id, initial_owner_role, escalation_owner_role, default_priority_id, sla_value, sla_unit, status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, department_id, initial_owner_role, escalation_owner_role, default_priority_id || null, sla_value, sla_unit, status, req.user.id]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'CREATE', 'routing_rule', result.insertId, 
       JSON.stringify({ department_id, initial_owner_role, escalation_owner_role, sla_value, sla_unit })]
    );
    
    connection.release();
    
    res.status(201).json({ id: result.insertId, message: 'Routing rule created successfully' });
  } catch (error) {
    console.error('Error creating routing rule:', error);
    res.status(500).json({ error: 'Failed to create routing rule' });
  }
});

// PUT /api/admin/routing/rules/:id - Update routing rule
router.put('/rules/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { department_id, initial_owner_role, escalation_owner_role, default_priority_id, sla_value, sla_unit, status } = req.body;
    
    const [rules] = await connection.execute(
      `SELECT id FROM routing_rules WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    if (rules.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    
    await connection.execute(
      `UPDATE routing_rules SET department_id = ?, initial_owner_role = ?, escalation_owner_role = ?, default_priority_id = ?, sla_value = ?, sla_unit = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND tenant_id = ?`,
      [department_id, initial_owner_role, escalation_owner_role, default_priority_id || null, sla_value, sla_unit, status, req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'routing_rule', req.params.id, 
       JSON.stringify({ department_id, initial_owner_role, escalation_owner_role, sla_value, sla_unit, status })]
    );
    
    connection.release();
    
    res.json({ message: 'Routing rule updated successfully' });
  } catch (error) {
    console.error('Error updating routing rule:', error);
    res.status(500).json({ error: 'Failed to update routing rule' });
  }
});

// DELETE /api/admin/routing/rules/:id - Delete routing rule
router.delete('/rules/:id', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [rules] = await connection.execute(
      `SELECT id FROM routing_rules WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    if (rules.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    
    await connection.execute(
      `DELETE FROM routing_rules WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'DELETE', 'routing_rule', req.params.id, null]
    );
    
    connection.release();
    
    res.json({ message: 'Routing rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting routing rule:', error);
    res.status(500).json({ error: 'Failed to delete routing rule' });
  }
});

module.exports = router;
