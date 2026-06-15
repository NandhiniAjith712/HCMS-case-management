const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { verifyTenantAccess } = require('../middleware/tenant');

// Guard: only product_spoc role allowed
async function requireProductSpoc(req, res, next) {
  if (String(req.user?.role || '').toLowerCase() !== 'product_spoc') {
    return res.status(403).json({ success: false, message: 'Access denied. Product SPOC role required.' });
  }
  const productId = Number(req.user.product_scope_id || 0);
  if (!productId) {
    return res.status(400).json({ success: false, message: 'Product SPOC is not mapped to a product.' });
  }

  req.spocProductId = productId;
  next();
}

// Helper to build tenant-level visibility filter for product SPOC
function getSpocTicketFilter(tenantId, spocProductId, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const sql = `${prefix}tenant_id = ? AND ${prefix}product_id = ?`;
  const params = [tenantId, spocProductId];
  return { sql, params };
}


// GET /api/product-spoc/me
// Returns the authenticated product_spoc's profile + org + product info
router.get('/me', authenticateToken, verifyTenantAccess, requireProductSpoc, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const { spocProductId } = req;

    const [tenants] = await pool.execute(
      'SELECT id, name, subdomain FROM tenants WHERE id = ? LIMIT 1',
      [tenantId]
    );
    const [prods] = await pool.execute(
      'SELECT id, name, slug, description FROM products WHERE id = ? AND tenant_id = ? LIMIT 1',
      [spocProductId, tenantId]
    );

    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          product_scope_id: spocProductId
        },
        organization: tenants[0] || null,
        product: prods[0] || null
      }
    });
  } catch (err) {
    console.error('product-spoc /me error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/product-spoc/dashboard
// Returns KPI stats, recent tickets, SLA overview, escalation counts
router.get('/dashboard', authenticateToken, verifyTenantAccess, requireProductSpoc, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const { spocProductId } = req;

    const baseFilter = getSpocTicketFilter(tenantId, spocProductId);
    const baseFilterT = getSpocTicketFilter(tenantId, spocProductId, 't');

    // KPI counts
    const [kpi] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status NOT IN ('closed','resolved') THEN 1 END) AS open_count,
         COUNT(CASE WHEN status = 'new' THEN 1 END) AS new_count,
         COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress_count,
         COUNT(CASE WHEN status IN ('escalated') OR COALESCE(is_escalated,0) = 1 THEN 1 END) AS escalated_count,
         COUNT(CASE WHEN status = 'closed' THEN 1 END) AS closed_count,
         COUNT(CASE WHEN status = 'resolved' THEN 1 END) AS resolved_count,
         COUNT(CASE WHEN priority = 'critical' AND status NOT IN ('closed','resolved') THEN 1 END) AS critical_open,
         COUNT(CASE WHEN COALESCE(sla_first_response_met,1) = 0 AND status NOT IN ('closed','resolved') THEN 1 END) AS sla_breaches
       FROM tickets
       WHERE ${baseFilter.sql}`,
      baseFilter.params
    );

    // Recent 10 tickets
    const [recentTickets] = await pool.execute(
      `SELECT id, issue_title, status, priority, email, name,
              created_at, updated_at,
              COALESCE(is_escalated, 0) AS is_escalated,
              COALESCE(escalation_level, 0) AS escalation_level,
              COALESCE(sla_first_response_met, 1) AS sla_first_response_met,
              first_response_at, resolved_at, closed_at
       FROM tickets
       WHERE ${baseFilter.sql}
       ORDER BY created_at DESC LIMIT 10`,
      baseFilter.params
    );

    // Users who raised tickets under this product (with only_full_group_by safe query)
    const [users] = await pool.execute(
      `SELECT MAX(t.name) AS name, LOWER(TRIM(t.email)) AS email,
              COUNT(t.id) AS ticket_count,
              MAX(t.created_at) AS last_ticket_at
       FROM tickets t
       WHERE ${baseFilterT.sql}
       GROUP BY LOWER(TRIM(t.email))
       ORDER BY last_ticket_at DESC LIMIT 20`,
      baseFilterT.params
    );

    // SLA breach tickets (open + breached)
    const [slaBreaches] = await pool.execute(
      `SELECT id, issue_title, priority, status, email, name, created_at
       FROM tickets
       WHERE ${baseFilter.sql}
         AND COALESCE(sla_first_response_met, 1) = 0
         AND status NOT IN ('closed','resolved')
       ORDER BY created_at ASC LIMIT 10`,
      baseFilter.params
    );

    // Escalated tickets
    const [escalatedTickets] = await pool.execute(
      `SELECT id, issue_title, priority, status, email, name, created_at,
              COALESCE(escalation_level, 0) AS escalation_level
       FROM tickets
       WHERE ${baseFilter.sql}
         AND (status = 'escalated' OR COALESCE(is_escalated, 0) = 1)
         AND status NOT IN ('closed','resolved')
       ORDER BY created_at DESC LIMIT 10`,
      baseFilter.params
    );

    res.json({
      success: true,
      data: {
        kpi: kpi[0] || {},
        recentTickets,
        slaBreaches,
        escalatedTickets,
        users
      }
    });
  } catch (err) {
    console.error('product-spoc /dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/product-spoc/tickets
// Paginated, filterable ticket list scoped to org + product
router.get('/tickets', authenticateToken, verifyTenantAccess, requireProductSpoc, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const { spocProductId } = req;
    const { status, priority, search, page = 1, limit = 20 } = req.query;

    const baseFilter = getSpocTicketFilter(tenantId, spocProductId, 't');
    let where = `WHERE ${baseFilter.sql}`;
    const params = [...baseFilter.params];

    if (status && status !== 'all') { where += ' AND t.status = ?'; params.push(status); }
    if (priority && priority !== 'all') { where += ' AND t.priority = ?'; params.push(priority); }
    if (search && search.trim()) {
      where += ' AND (t.issue_title LIKE ? OR t.email LIKE ? OR t.name LIKE ? OR CAST(t.id AS CHAR) LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    const offset = (Number(page) - 1) * Number(limit);

    const [tickets] = await pool.query(
      `SELECT t.id, t.issue_title, t.description, t.status, t.priority,
              t.email, t.name, t.created_at, t.updated_at,
              t.first_response_at, t.resolved_at, t.closed_at,
              COALESCE(t.is_escalated, 0) AS is_escalated,
              COALESCE(t.escalation_level, 0) AS escalation_level,
              COALESCE(t.sla_first_response_met, 1) AS sla_first_response_met,
              t.sla_response_time_minutes, t.sla_resolution_time_minutes,
              COALESCE(t.reopen_count, 0) AS reopen_count
       FROM tickets t
       ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    const [countRow] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tickets t ${where}`,
      params
    );

    res.json({
      success: true,
      data: tickets,
      pagination: {
        total: countRow[0]?.total || 0,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil((countRow[0]?.total || 0) / Number(limit))
      }
    });
  } catch (err) {
    console.error('product-spoc /tickets error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/product-spoc/analytics
// Time-series and breakdown analytics scoped to org + product
router.get('/analytics', authenticateToken, verifyTenantAccess, requireProductSpoc, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const { spocProductId } = req;
    const { days = 30 } = req.query;
    const daysNum = Math.min(Number(days) || 30, 365);

    const baseFilter = getSpocTicketFilter(tenantId, spocProductId);

    // Daily ticket volume (last N days)
    const [dailyVolume] = await pool.execute(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM tickets
       WHERE ${baseFilter.sql}
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [...baseFilter.params, daysNum]
    );

    // Status breakdown
    const [statusBreakdown] = await pool.execute(
      `SELECT status, COUNT(*) AS count
       FROM tickets
       WHERE ${baseFilter.sql}
       GROUP BY status`,
      baseFilter.params
    );

    // Priority breakdown
    const [priorityBreakdown] = await pool.execute(
      `SELECT priority, COUNT(*) AS count
       FROM tickets
       WHERE ${baseFilter.sql}
       GROUP BY priority`,
      baseFilter.params
    );

    // Avg resolution time (closed tickets)
    const [avgResolution] = await pool.execute(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, closed_at)) AS avg_hours
       FROM tickets
       WHERE ${baseFilter.sql}
         AND status = 'closed' AND closed_at IS NOT NULL`,
      baseFilter.params
    );

    res.json({
      success: true,
      data: {
        dailyVolume,
        statusBreakdown,
        priorityBreakdown,
        avgResolutionHours: avgResolution[0]?.avg_hours
          ? Math.round(Number(avgResolution[0].avg_hours) * 10) / 10
          : null
      }
    });
  } catch (err) {
    console.error('product-spoc /analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/product-spoc/notifications
// Scoped notifications for this product_spoc (re-use notifications route logic here for convenience)
// The main notifications router already handles product_spoc scoping, so this just confirms auth
router.get('/notifications', authenticateToken, verifyTenantAccess, requireProductSpoc, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const { spocProductId } = req;
    const uid = Number(req.user.id || 0);

    const baseFilter = getSpocTicketFilter(tenantId, spocProductId, 't');

    const [notifications] = await pool.execute(
      `SELECT n.id, n.type, n.title, n.description, n.ticket_id, n.is_read, n.created_at
       FROM notifications n
       LEFT JOIN tickets t ON n.ticket_id = t.id
       WHERE n.tenant_id = ?
         AND (
           n.recipient_user_id = ?
           OR (${baseFilter.sql} AND n.recipient_role = 'USER')
         )
       ORDER BY n.created_at DESC LIMIT 30`,
      [tenantId, uid, ...baseFilter.params]
    );

    res.json({ success: true, data: notifications });
  } catch (err) {
    console.error('product-spoc /notifications error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
