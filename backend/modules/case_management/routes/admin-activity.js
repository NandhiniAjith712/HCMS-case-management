/**
 * Admin Activity API Routes
 * Handles retrieval of audit logs for AdminActivity screen
 * Endpoints:
 * - GET /api/admin/activity - List all audit logs with pagination, search, filters
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

// GET /api/admin/activity - List audit logs
router.get('/', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const { search, action, entity_type, user_id, start_date, end_date, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT a.* 
      FROM audit_logs a 
      WHERE a.tenant_id = ?
    `;
    const params = [tenantId];
    
    if (search) {
      query += ` AND (a.user_name LIKE ? OR a.action LIKE ? OR a.entity_type LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (action) {
      query += ` AND a.action = ?`;
      params.push(action);
    }
    
    if (entity_type) {
      query += ` AND a.entity_type = ?`;
      params.push(entity_type);
    }
    
    if (user_id) {
      query += ` AND a.user_id = ?`;
      params.push(user_id);
    }
    
    if (start_date) {
      query += ` AND a.created_at >= ?`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND a.created_at <= ?`;
      params.push(end_date);
    }
    
    query += ` ORDER BY a.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const [logs] = await connection.execute(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM audit_logs WHERE tenant_id = ?`;
    const countParams = [tenantId];
    if (search) {
      countQuery += ` AND (user_name LIKE ? OR action LIKE ? OR entity_type LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (action) {
      countQuery += ` AND action = ?`;
      countParams.push(action);
    }
    if (entity_type) {
      countQuery += ` AND entity_type = ?`;
      countParams.push(entity_type);
    }
    if (user_id) {
      countQuery += ` AND user_id = ?`;
      countParams.push(user_id);
    }
    if (start_date) {
      countQuery += ` AND created_at >= ?`;
      countParams.push(start_date);
    }
    if (end_date) {
      countQuery += ` AND created_at <= ?`;
      countParams.push(end_date);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/admin/activity/stats - Get activity statistics
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    // Get counts by action type
    const [actionCounts] = await connection.execute(
      `SELECT action, COUNT(*) as count FROM audit_logs WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY action ORDER BY count DESC`,
      [tenantId]
    );
    
    // Get counts by entity type
    const [entityCounts] = await connection.execute(
      `SELECT entity_type, COUNT(*) as count FROM audit_logs WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY entity_type ORDER BY count DESC`,
      [tenantId]
    );
    
    // Get recent activity count
    const [recentCount] = await connection.execute(
      `SELECT COUNT(*) as count FROM audit_logs WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [tenantId]
    );
    
    // Get top users
    const [topUsers] = await connection.execute(
      `SELECT user_name, user_role, COUNT(*) as count FROM audit_logs WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY user_name, user_role ORDER BY count DESC LIMIT 10`,
      [tenantId]
    );
    
    connection.release();
    
    res.json({
      action_counts: actionCounts,
      entity_counts: entityCounts,
      recent_activity_count: recentCount[0].count,
      top_users: topUsers
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

module.exports = router;
