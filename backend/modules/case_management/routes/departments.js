const express = require('express');
const { pool } = require('../../shared/database/database');
const { authenticateToken } = require('../../shared/middleware/auth');
const { verifyTenantAccess } = require('../../shared/middleware/tenant');

const router = express.Router();

// GET /api/departments - Get all active departments for current tenant
router.get('/', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [departments] = await pool.execute(
      'SELECT id, name, status FROM departments WHERE (tenant_id = ? OR tenant_id IS NULL) AND status = "active" ORDER BY name ASC',
      [tenantId]
    );
    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments'
    });
  }
});

// GET /api/departments/managers - List all active support managers for current tenant
router.get('/managers', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [managers] = await pool.execute(
      'SELECT id, name, email, role, department, primary_department_id FROM agents WHERE role IN ("support_manager", "manager") AND tenant_id = ? AND is_active = TRUE ORDER BY name ASC',
      [tenantId]
    );
    res.json({
      success: true,
      data: managers
    });
  } catch (error) {
    console.error('Error fetching support managers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support managers'
    });
  }
});

// GET /api/departments/manager-permissions/:managerId - Get configured permissions for a manager
router.get('/manager-permissions/:managerId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { managerId } = req.params;
    const [permissions] = await pool.execute(
      `SELECT 
        d.id as department_id,
        d.name as department_name,
        COALESCE(mdp.can_view, 0) as can_view,
        COALESCE(mdp.can_update, 0) as can_update,
        COALESCE(mdp.can_assign, 0) as can_assign,
        COALESCE(mdp.can_close, 0) as can_close,
        COALESCE(mdp.can_view_reports, 0) as can_view_reports,
        COALESCE(mdp.can_manage_escalations, 0) as can_manage_escalations
      FROM departments d
      LEFT JOIN manager_department_permissions mdp 
        ON d.id = mdp.department_id AND mdp.manager_id = ?
      WHERE d.status = "active"
      ORDER BY d.name ASC`,
      [managerId]
    );

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching manager department permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manager department permissions'
    });
  }
});

// GET /api/departments/:id - Get department details including subcategories
router.get('/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const [departments] = await pool.execute(
      'SELECT id, name, description, status, head_id, head_title FROM departments WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL) AND status = "active"',
      [id, tenantId]
    );

    if (departments.length === 0) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    const [subcategories] = await pool.execute(
      'SELECT id, name, description, display_order FROM department_subcategories WHERE department_id = ? AND is_active = 1 ORDER BY display_order, name',
      [id]
    );

    res.json({
      success: true,
      data: { ...departments[0], subcategories }
    });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch department' });
  }
});

module.exports = router;
