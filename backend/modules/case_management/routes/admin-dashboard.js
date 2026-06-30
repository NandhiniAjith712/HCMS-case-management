/**
 * Admin Dashboard API Routes
 * Provides statistics and recent activity for the admin dashboard
 * Endpoints:
 * - GET /api/admin/dashboard/stats - Get dashboard statistics
 * - GET /api/admin/dashboard/recent-activity - Get recent activity
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

// GET /api/admin/dashboard/stats - Get dashboard statistics
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const safeCount = async (sql, params) => {
      try { const [rows] = await connection.execute(sql, params); return rows; } catch (e) { return []; }
    };

    // Get user counts by role
    const userCounts = await safeCount(
      `SELECT role, COUNT(*) as count FROM users WHERE (tenant_id = ? OR tenant_id IS NULL) GROUP BY role`,
      [tenantId]
    );

    // Get department count
    const deptRows = await safeCount(
      `SELECT COUNT(*) as count FROM departments WHERE (tenant_id = ? OR tenant_id IS NULL)`,
      [tenantId]
    );

    // Get routing rule count
    const ruleRows = await safeCount(
      `SELECT COUNT(*) as count FROM routing_rules WHERE (tenant_id = ? OR tenant_id IS NULL)`,
      [tenantId]
    );

    // Get case counts by status (using cases table, not tickets)
    const caseStatusRows = await safeCount(
      `SELECT status, COUNT(*) as count FROM cases WHERE (tenant_id = ? OR tenant_id IS NULL) GROUP BY status`,
      [tenantId]
    );

    // Get case counts by priority
    const casePriorityRows = await safeCount(
      `SELECT priority, COUNT(*) as count FROM cases WHERE (tenant_id = ? OR tenant_id IS NULL) GROUP BY priority`,
      [tenantId]
    );

    // Get escalation count from cases
    const escalationRows = await safeCount(
      `SELECT COUNT(*) as count FROM cases WHERE status = 'escalated'`,
      []
    );

    connection.release();

    res.json({
      users: userCounts.reduce((acc, item) => ({ ...acc, [item.role]: item.count }), {}),
      departments: deptRows[0]?.count || 0,
      routing_rules: ruleRows[0]?.count || 0,
      tickets_by_status: caseStatusRows.reduce((acc, item) => ({ ...acc, [item.status]: item.count }), {}),
      tickets_by_priority: casePriorityRows.reduce((acc, item) => ({ ...acc, [item.priority]: item.count }), {}),
      pending_escalations: escalationRows[0]?.count || 0,
      active_agents: 0
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// GET /api/admin/dashboard/recent-activity - Get recent activity
router.get('/recent-activity', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    const limitValue = Math.max(1, parseInt(req.query.limit || 10, 10) || 10);
    
    let activities = [];
    try {
      [activities] = await connection.execute(
        `SELECT * FROM audit_logs WHERE (tenant_id = ? OR tenant_id IS NULL) ORDER BY created_at DESC LIMIT ${limitValue}`,
        [tenantId]
      );
    } catch (e) {
      // audit_logs table may not exist yet
    }

    connection.release();

    res.json(activities);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

module.exports = router;
