const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { verifyTenantAccess } = require('../middleware/tenant');
const { mapRowToApi } = require('../services/appNotificationService');

function normalizeRole(role) {
  return String(role || '').toLowerCase();
}

/**
 * WHERE clause + params for notifications visible to req.user (matches appNotificationService targeting).
 */
function inboxFilter(user, tenantId) {
  const tid = Number(tenantId) || 1;
  const r = normalizeRole(user.role);

  if (r === 'ceo') {
    return {
      joins: '',
      where: `n.tenant_id = ? AND n.recipient_role = 'CEO'`,
      params: [tid],
      countParams: [tid]
    };
  }

  if (r === 'admin') {
    return {
      joins: '',
      where: `n.tenant_id = ?
        AND NOT (n.type = 'COMMENT_ADDED' AND n.recipient_role IN ('AGENT', 'MANAGER'))`,
      params: [tid],
      countParams: [tid]
    };
  }

  if (['support_manager', 'manager'].includes(r)) {
    const sid = Number(user.id || user.agentId || 0);
    return {
      joins: '',
      where: `n.tenant_id = ?
        AND (
          (n.recipient_staff_id = ? AND n.recipient_role = 'MANAGER')
          OR (n.recipient_role = 'AGENT' AND EXISTS (
            SELECT 1 FROM agents a2
            WHERE a2.id = n.recipient_staff_id AND a2.manager_id = ?
              AND (a2.tenant_id = ? OR a2.tenant_id IS NULL)
          ))
        )`,
      params: [tid, sid, sid, tid],
      countParams: [tid, sid, sid, tid]
    };
  }

  if (['support_agent', 'agent'].includes(r)) {
    const sid = Number(user.id || user.agentId || 0);
    return {
      joins: '',
      where: 'n.tenant_id = ? AND n.recipient_staff_id = ? AND n.recipient_role = ?',
      params: [tid, sid, 'AGENT'],
      countParams: [tid, sid, 'AGENT']
    };
  }

  if (['user', 'customer', 'org_spoc', 'product_spoc'].includes(r)) {
    const uid = Number(user.id || 0);
    if (r === 'org_spoc') {
      return {
        joins: 'LEFT JOIN tickets t ON n.ticket_id = t.id',
        where: `n.tenant_id = ? AND (n.recipient_user_id = ? OR (t.tenant_id = ? AND n.recipient_role = 'USER'))`,
        params: [tid, uid, tid],
        countParams: [tid, uid, tid]
      };
    } else if (r === 'product_spoc') {
      const prodId = Number(user.product_scope_id || 0);
      return {
        joins: 'LEFT JOIN tickets t ON n.ticket_id = t.id',
        where: `n.tenant_id = ? AND (n.recipient_user_id = ? OR (t.tenant_id = ? AND t.product_id = ? AND n.recipient_role = 'USER'))`,
        params: [tid, uid, tid, prodId],
        countParams: [tid, uid, tid, prodId]
      };
    } else {
      return {
        joins: '',
        where: 'n.tenant_id = ? AND n.recipient_user_id = ? AND n.recipient_role = ?',
        params: [tid, uid, 'USER'],
        countParams: [tid, uid, 'USER']
      };
    }
  }

  return { joins: '', where: '1=0', params: [], countParams: [] };
}

async function userCanSeeNotification(user, tenantId, row) {
  const tid = Number(tenantId) || 1;
  if (Number(row.tenant_id) !== tid) return false;
  const r = normalizeRole(user.role);
  if (r === 'ceo') {
    return String(row.recipient_role || '') === 'CEO';
  }
  if (r === 'admin') {
    if (row.type === 'COMMENT_ADDED' && ['AGENT', 'MANAGER'].includes(String(row.recipient_role || ''))) {
      return false;
    }
    return true;
  }
  if (['support_manager', 'manager'].includes(r)) {
    const sid = Number(user.id || user.agentId || 0);
    if (row.recipient_role === 'MANAGER' && Number(row.recipient_staff_id) === sid) return true;
    if (row.recipient_role === 'AGENT' && row.recipient_staff_id != null) {
      const [ar] = await pool.execute(
        `SELECT manager_id, tenant_id FROM agents WHERE id = ? LIMIT 1`,
        [row.recipient_staff_id]
      );
      const mid = Number(ar[0]?.manager_id);
      const at = Number(ar[0]?.tenant_id);
      if (mid !== sid) return false;
      return !at || at === tid;
    }
    return false;
  }
  if (['support_agent', 'agent'].includes(r)) {
    return row.recipient_role === 'AGENT' && Number(row.recipient_staff_id) === Number(user.id || user.agentId);
  }
  if (['user', 'customer', 'org_spoc', 'product_spoc'].includes(r)) {
    if (Number(row.recipient_user_id) === Number(user.id)) return true;
    
    if (r === 'org_spoc' || r === 'product_spoc') {
      if (!row.ticket_id) return false;
      const [tk] = await pool.execute('SELECT tenant_id, product_id FROM tickets WHERE id = ? LIMIT 1', [row.ticket_id]);
      if (tk.length === 0) return false;
      
      if (r === 'org_spoc') {
        return Number(tk[0].tenant_id || 0) === tid;
      } else {
        return Number(tk[0].tenant_id || 0) === tid &&
               Number(tk[0].product_id || 0) === Number(user.product_scope_id || 0);
      }
    }
    return row.recipient_role === 'USER' && Number(row.recipient_user_id) === Number(user.id);
  }
  return false;
}

// GET /api/notifications?limit=&offset=
router.get('/', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (role === 'business_dashboard' || role === 'super_admin') {
      return res.json({ success: true, data: [], unreadCount: 0, total: 0 });
    }
    // CEO role should have access to notifications
    if (role === 'ceo') {
      // CEOs get normal notifications flow
    }

    const tenantId = req.tenantId || req.user.tenant_id || 1;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const f = inboxFilter(req.user, tenantId);

    // LIMIT/OFFSET as prepared params triggers ER_WRONG_ARGUMENTS on some MySQL builds; use validated integers.
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 20, 1), 100);
    const safeOffset = Math.min(Math.max(Number.isFinite(offset) && offset >= 0 ? Math.trunc(offset) : 0, 0), 500000);

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM app_notifications n ${f.joins} WHERE ${f.where}`,
      f.countParams
    );
    const total = Number(countRows[0]?.c || 0);

    const [rows] = await pool.query(
      `SELECT n.* FROM app_notifications n ${f.joins} WHERE ${f.where} ORDER BY n.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      f.params
    );

    const [unreadRows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM app_notifications n ${f.joins} WHERE ${f.where} AND n.is_read = 0`,
      f.countParams
    );
    const unreadCount = Number(unreadRows[0]?.c || 0);

    res.json({
      success: true,
      data: rows.map(mapRowToApi),
      unreadCount,
      total,
      limit,
      offset
    });
  } catch (e) {
    console.error('GET /notifications error:', e);
    res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (role === 'business_dashboard' || role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not available' });
    }
    // CEO role should have access to notifications
    if (role === 'ceo') {
      // CEOs get normal notifications flow
    }
    const tenantId = req.tenantId || req.user.tenant_id || 1;
    const id = String(req.params.id || '').trim();
    const [rows] = await pool.execute('SELECT * FROM app_notifications WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    const ok = await userCanSeeNotification(req.user, tenantId, rows[0]);
    if (!ok) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await pool.execute('UPDATE app_notifications SET is_read = 1 WHERE id = ?', [id]);
    res.json({ success: true, data: { ...mapRowToApi(rows[0]), isRead: true } });
  } catch (e) {
    console.error('PATCH /notifications/:id/read error:', e);
    res.status(500).json({ success: false, message: 'Failed to update' });
  }
});

// PATCH /api/notifications/mark-all-read
router.patch('/mark-all-read', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (role === 'business_dashboard' || role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not available' });
    }
    // CEO role should have access to notifications
    if (role === 'ceo') {
      // CEOs get normal notifications flow
    }
    const tenantId = req.tenantId || req.user.tenant_id || 1;
    const f = inboxFilter(req.user, tenantId);
    const [r] = await pool.execute(
      `UPDATE app_notifications n ${f.joins} SET n.is_read = 1 WHERE ${f.where} AND n.is_read = 0`,
      f.params
    );
    res.json({ success: true, updated: r.affectedRows || 0 });
  } catch (e) {
    console.error('PATCH /notifications/mark-all-read error:', e);
    res.status(500).json({ success: false, message: 'Failed to update' });
  }
});

module.exports = router;
