/**
 * Admin Roles API Routes
 * Handles dynamic role management
 * Endpoints:
 * - GET  /api/admin/roles - List roles for the current tenant
 * - POST /api/admin/roles - Create a new role (system_admin only)
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
    if (decoded.role !== 'system_admin' && decoded.role !== 'support_manager' && decoded.role !== 'hr_executive') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to restrict to system admin only
const requireSystemAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (decoded.role !== 'system_admin') {
      return res.status(403).json({ error: 'Only System Administrators can create roles' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /api/admin/roles - List active roles for the tenant
router.get('/', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const { includeInactive } = req.query;
    let query = `SELECT id, tenant_id, name, description, is_active, created_at, updated_at FROM roles WHERE tenant_id = ?`;
    const params = [tenantId];
    if (!includeInactive || includeInactive === 'false') {
      query += ` AND is_active = TRUE`;
    }
    query += ` ORDER BY name ASC`;
    const [roles] = await connection.execute(query, params);
    connection.release();
    res.json({ success: true, data: roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

// POST /api/admin/roles - Create a new role (system_admin only)
router.post('/', requireSystemAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const tenantId = req.user.tenant_id || 1;
    const { name, description, is_active = true } = req.body;
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Role name is required' });
    }

    if (trimmedName.length > 50) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Role name must be 50 characters or less' });
    }

    // Check uniqueness per tenant (case-insensitive)
    const [existing] = await connection.execute(
      `SELECT id FROM roles WHERE tenant_id = ? AND LOWER(name) = LOWER(?)`,
      [tenantId, trimmedName]
    );
    if (existing.length > 0) {
      connection.release();
      return res.status(409).json({ success: false, error: 'A role with this name already exists' });
    }

    const [result] = await connection.execute(
      `INSERT INTO roles (tenant_id, name, description, is_active) VALUES (?, ?, ?, ?)`,
      [tenantId, trimmedName, description || null, is_active === false ? false : true]
    );

    connection.release();
    res.status(201).json({
      success: true,
      data: { id: result.insertId, tenant_id: tenantId, name: trimmedName, description, is_active: is_active === false ? false : true }
    });
  } catch (error) {
    connection.release();
    console.error('Error creating role:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'A role with this name already exists' });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to create role' });
  }
});

module.exports = router;
