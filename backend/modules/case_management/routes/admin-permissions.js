/**
 * Admin Permissions API Routes
 * Handles CRUD operations for role-based permissions
 * Endpoints:
 * - GET    /api/admin/permissions - Get all permissions for all roles
 * - GET    /api/admin/permissions/:role - Get permissions for a specific role
 * - PUT    /api/admin/permissions/:role - Update permissions for a role
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

// GET /api/admin/permissions - Get all permissions for all roles
router.get('/', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [permissions] = await connection.execute(
      `SELECT * FROM role_permissions WHERE tenant_id = ? ORDER BY role, permission_key`,
      [tenantId]
    );
    
    // Group by role
    const grouped = {};
    permissions.forEach(p => {
      if (!grouped[p.role]) {
        grouped[p.role] = {};
      }
      grouped[p.role][p.permission_key] = p.is_allowed === 1;
    });
    
    connection.release();
    
    res.json(grouped);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// GET /api/admin/permissions/:role - Get permissions for a specific role
router.get('/:role', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const role = req.params.role;
    
    const validRoles = ['employee', 'hr_executive', 'department_head', 'system_admin'];
    if (!validRoles.includes(role)) {
      connection.release();
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const [permissions] = await connection.execute(
      `SELECT * FROM role_permissions WHERE tenant_id = ? AND role = ? ORDER BY permission_key`,
      [tenantId, role]
    );
    
    const permissionsMap = {};
    permissions.forEach(p => {
      permissionsMap[p.permission_key] = p.is_allowed === 1;
    });
    
    connection.release();
    
    res.json(permissionsMap);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// PUT /api/admin/permissions/:role - Update permissions for a role
router.put('/:role', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const role = req.params.role;
    const { permissions } = req.body;
    
    const validRoles = ['employee', 'hr_executive', 'department_head', 'system_admin'];
    if (!validRoles.includes(role)) {
      connection.release();
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    if (!permissions || typeof permissions !== 'object') {
      connection.release();
      return res.status(400).json({ error: 'Permissions object is required' });
    }
    
    await connection.beginTransaction();
    
    // Update each permission
    for (const [permissionKey, isAllowed] of Object.entries(permissions)) {
      await connection.execute(
        `UPDATE role_permissions SET is_allowed = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE tenant_id = ? AND role = ? AND permission_key = ?`,
        [isAllowed ? 1 : 0, req.user.id, tenantId, role, permissionKey]
      );
    }
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'role_permissions', null, 
       JSON.stringify({ role, permissions })]
    );
    
    await connection.commit();
    connection.release();
    
    res.json({ message: 'Permissions updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating permissions:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

module.exports = router;
