const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');
const { authenticate } = require('../../auth/middleware/auth.middleware');
const { verifyTenantAccess } = require('../../shared/middleware/tenant');
const { mapRowToApi, insertNotification, RECIPIENT, TYPE } = require('../services/appNotificationService');

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

  if (r === 'admin' || r === 'system_admin') {
    const sid = Number(user.id || user.agentId || 0);
    return {
      joins: '',
      where: 'n.tenant_id = ? AND n.recipient_staff_id = ? AND n.recipient_role = ?',
      params: [tid, sid, 'MANAGER'],
      countParams: [tid, sid, 'MANAGER']
    };
  }

  if (['support_manager', 'manager', 'department_head'].includes(r)) {
    const sid = Number(user.id || user.agentId || 0);
    return {
      joins: '',
      where: 'n.tenant_id = ? AND n.recipient_staff_id = ? AND n.recipient_role = ?',
      params: [tid, sid, 'MANAGER'],
      countParams: [tid, sid, 'MANAGER']
    };
  }

  if (['support_agent', 'agent', 'hr_executive'].includes(r)) {
    const sid = Number(user.id || user.agentId || 0);
    return {
      joins: '',
      where: 'n.tenant_id = ? AND n.recipient_staff_id = ? AND n.recipient_role = ?',
      params: [tid, sid, 'AGENT'],
      countParams: [tid, sid, 'AGENT']
    };
  }

  if (['user', 'customer', 'org_spoc', 'product_spoc', 'employee'].includes(r)) {
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
  if (r === 'admin' || r === 'system_admin') {
    const sid = Number(user.id || user.agentId || 0);
    return String(row.recipient_role || '') === 'MANAGER' && Number(row.recipient_staff_id) === sid;
  }
  if (['support_manager', 'manager', 'department_head'].includes(r)) {
    const sid = Number(user.id || user.agentId || 0);
    return String(row.recipient_role || '') === 'MANAGER' && Number(row.recipient_staff_id) === sid;
  }
  if (['support_agent', 'agent', 'hr_executive'].includes(r)) {
    return String(row.recipient_role || '') === 'AGENT' && Number(row.recipient_staff_id) === Number(user.id || user.agentId);
  }
  if (['user', 'customer', 'org_spoc', 'product_spoc', 'employee'].includes(r)) {
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
router.get('/', authenticate, verifyTenantAccess, async (req, res) => {
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
router.patch('/:id/read', authenticate, verifyTenantAccess, async (req, res) => {
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
router.patch('/mark-all-read', authenticate, verifyTenantAccess, async (req, res) => {
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

// POST /api/notifications/backfill-hr (Admin only: backfill historical HR notifications)
router.post('/backfill-hr', authenticate, verifyTenantAccess, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (role !== 'system_admin' && role !== 'admin' && role !== 'hr_executive') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const tenantId = Number(req.tenantId || req.user.tenant_id || 1) || 1;
    let created = 0;
    let skipped = 0;

    // Find all active HR executives
    const [hrAgents] = await pool.execute(
      `SELECT id FROM users WHERE role = 'hr_executive' AND (tenant_id = ? OR tenant_id IS NULL) AND (is_active = 1 OR is_active IS NULL)`,
      [tenantId]
    );

    for (const hr of hrAgents) {
      const hrId = Number(hr.id);
      if (!hrId) continue;

      // Find all cases assigned to this HR
      const [cases] = await pool.execute(
        `SELECT id, title, status, created_by, created_at FROM cases
         WHERE (tenant_id = ? OR tenant_id IS NULL) AND assigned_to = ?
         ORDER BY id ASC`,
        [tenantId, hrId]
      );

      for (const c of cases) {
        const ticketId = Number(c.id);

        // 1. Ticket assigned notification
        const taRow = await insertNotification(pool, {
          tenantId,
          recipientRole: RECIPIENT.AGENT,
          recipientStaffId: hrId,
          recipientUserId: null,
          title: 'Ticket assigned to you',
          description: `${c.title || 'Support request'} — Ticket #${ticketId}`,
          type: TYPE.TICKET_ASSIGNED,
          ticketId,
          dedupeKey: `bf:ta:${tenantId}:${ticketId}:${hrId}`
        });
        if (taRow) created++; else skipped++;

        // 2. Status change notifications from ticket_activity
        const [activities] = await pool.execute(
          `SELECT id, action, details, created_at FROM ticket_activity
           WHERE ticket_id = ? AND action IN ('status_changed', 'escalated', 'resolved', 'closed', 'reopened')
           ORDER BY created_at ASC`,
          [ticketId]
        );
        for (const act of activities) {
          let newStatus = '';
          try {
            const d = JSON.parse(act.details || '{}');
            newStatus = d.status?.new || d.status || act.action;
          } catch (_) {
            newStatus = act.action;
          }
          const stRow = await insertNotification(pool, {
            tenantId,
            recipientRole: RECIPIENT.AGENT,
            recipientStaffId: hrId,
            recipientUserId: null,
            title: 'Ticket status updated',
            description: `Ticket #${ticketId} status changed to ${newStatus} — ${c.title || ''}`.trim(),
            type: TYPE.STATUS_CHANGED,
            ticketId,
            dedupeKey: `bf:st:${tenantId}:${ticketId}:${hrId}:${newStatus}:${act.id}`
          });
          if (stRow) created++; else skipped++;
        }

        // 3. Employee comment notifications
        const [comments] = await pool.execute(
          `SELECT id, message, sender_name, created_at FROM ticket_messages
           WHERE ticket_id = ? AND sender_type = 'user'
           ORDER BY created_at ASC`,
          [ticketId]
        );
        for (const msg of comments) {
          const cmRow = await insertNotification(pool, {
            tenantId,
            recipientRole: RECIPIENT.AGENT,
            recipientStaffId: hrId,
            recipientUserId: null,
            title: 'New customer reply',
            description: `${msg.sender_name || 'Customer'} on ${c.title || `Ticket #${ticketId}`}: ${(msg.message || '').slice(0, 140)}`,
            type: TYPE.COMMENT_ADDED,
            ticketId,
            dedupeKey: `bf:cm:${tenantId}:${ticketId}:${hrId}:${msg.id}`
          });
          if (cmRow) created++; else skipped++;
        }
      }
    }

    res.json({
      success: true,
      message: `Backfill complete: ${created} notifications created, ${skipped} skipped (duplicates)`,
      created,
      skipped
    });
  } catch (e) {
    console.error('POST /notifications/backfill-hr error:', e);
    res.status(500).json({ success: false, message: 'Failed to backfill notifications', error: e.message });
  }
});

// POST /api/notifications/backfill-managers (Admin/Dept Head: backfill historical escalation notifications)
router.post('/backfill-managers', authenticate, verifyTenantAccess, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (role !== 'system_admin' && role !== 'admin' && role !== 'department_head') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const tenantId = Number(req.tenantId || req.user.tenant_id || 1) || 1;
    let created = 0;
    let skipped = 0;

    // Find all department heads and system admins
    const [managers] = await pool.execute(
      `SELECT id, role FROM users WHERE role IN ('department_head', 'system_admin') AND (tenant_id = ? OR tenant_id IS NULL) AND (is_active = 1 OR is_active IS NULL)`,
      [tenantId]
    );

    for (const mgr of managers) {
      const mgrId = Number(mgr.id);
      if (!mgrId) continue;
      const mgrRole = mgr.role === 'system_admin' ? 'System Admin' : 'Department Head';

      // Find all cases currently assigned to this manager in the escalation/review workflow
      const [cases] = await pool.execute(
        `SELECT id, title, status, dept_review_status, created_by, created_at, escalation_reason FROM cases
         WHERE (tenant_id = ? OR tenant_id IS NULL) AND assigned_to = ? AND dept_review_status IS NOT NULL
         ORDER BY id ASC`,
        [tenantId, mgrId]
      );

      for (const c of cases) {
        const ticketId = Number(c.id);
        const reasonText = (c.escalation_reason || '').slice(0, 100);

        const escRow = await insertNotification(pool, {
          tenantId,
          recipientRole: RECIPIENT.MANAGER,
          recipientStaffId: mgrId,
          recipientUserId: null,
          title: `Ticket escalated to ${mgrRole}`,
          description: `A ticket was escalated to you${reasonText ? `: ${reasonText}` : '. Please review.'} — ${c.title || `Ticket #${ticketId}`}`,
          type: TYPE.STATUS_CHANGED,
          ticketId,
          dedupeKey: `bf:esc:${tenantId}:${ticketId}:${mgrId}`
        });
        if (escRow) created++; else skipped++;

        // Status change notifications from ticket_activity
        const [activities] = await pool.execute(
          `SELECT id, action, details, created_at FROM ticket_activity
           WHERE ticket_id = ? AND action IN ('escalated', 'resolved', 'closed', 'reopened', 'returned_to_hr')
           ORDER BY created_at ASC`,
          [ticketId]
        );
        for (const act of activities) {
          let actStatus = '';
          try {
            const d = JSON.parse(act.details || '{}');
            actStatus = d.status?.new || d.status || act.action;
          } catch (_) {
            actStatus = act.action;
          }
          const stRow = await insertNotification(pool, {
            tenantId,
            recipientRole: RECIPIENT.MANAGER,
            recipientStaffId: mgrId,
            recipientUserId: null,
            title: 'Ticket status updated',
            description: `Ticket #${ticketId} status changed to ${actStatus} — ${c.title || ''}`.trim(),
            type: TYPE.STATUS_CHANGED,
            ticketId,
            dedupeKey: `bf:st:${tenantId}:${ticketId}:${mgrId}:${actStatus}:${act.id}`
          });
          if (stRow) created++; else skipped++;
        }

        // Employee comments
        const [comments] = await pool.execute(
          `SELECT id, message, sender_name, created_at FROM ticket_messages
           WHERE ticket_id = ? AND sender_type = 'user'
           ORDER BY created_at ASC`,
          [ticketId]
        );
        for (const msg of comments) {
          const cmRow = await insertNotification(pool, {
            tenantId,
            recipientRole: RECIPIENT.MANAGER,
            recipientStaffId: mgrId,
            recipientUserId: null,
            title: 'New employee reply',
            description: `${msg.sender_name || 'Employee'} on ${c.title || `Ticket #${ticketId}`}: ${(msg.message || '').slice(0, 140)}`,
            type: TYPE.COMMENT_ADDED,
            ticketId,
            dedupeKey: `bf:cm:${tenantId}:${ticketId}:${mgrId}:${msg.id}`
          });
          if (cmRow) created++; else skipped++;
        }
      }
    }

    res.json({
      success: true,
      message: `Backfill complete: ${created} notifications created, ${skipped} skipped (duplicates)`,
      created,
      skipped
    });
  } catch (e) {
    console.error('POST /notifications/backfill-managers error:', e);
    res.status(500).json({ success: false, message: 'Failed to backfill notifications', error: e.message });
  }
});

module.exports = router;
