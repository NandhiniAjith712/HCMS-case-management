const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');
const { authenticate } = require('../../auth/middleware/auth.middleware');
const { verifyTenantAccess } = require('../../shared/middleware/tenant');
const { getVisibilityFilter, isSystemAdmin } = require('../services/specialCaseAccessService');

function getVisibilityClause(userId, role) {
  if (isSystemAdmin({ role })) return { sql: '', params: [] };
  const { sql, params } = getVisibilityFilter('cases', userId);
  return { sql, params };
}

function normalizeRole(role) {
  return String(role || '').toLowerCase();
}

// GET /api/dashboard/counts - Get badge counts for sidebar
router.get('/', authenticate, verifyTenantAccess, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    const tenantId = Number(req.tenantId || req.user.tenant_id || 1) || 1;
    const userId = Number(req.user.id || 0);

    let counts = {
      tickets: 0,
      assigned: 0,
      escalations: 0,
      notifications: 0,
      investigations: 0,
      returned: 0
    };

    // Notification count (role-specific)
    try {
      let notifQuery = `SELECT COUNT(*) AS c FROM app_notifications WHERE tenant_id = ? AND is_read = 0 AND `;
      let notifParams = [tenantId];

      if (role === 'hr_executive' || role === 'support_agent' || role === 'agent') {
        notifQuery += `recipient_staff_id = ? AND recipient_role = 'AGENT'`;
        notifParams.push(userId);
      } else if (role === 'department_head' || role === 'support_manager' || role === 'manager') {
        notifQuery += `recipient_staff_id = ? AND recipient_role = 'MANAGER'`;
        notifParams.push(userId);
      } else if (role === 'system_admin' || role === 'admin') {
        notifQuery += `recipient_staff_id = ? AND recipient_role = 'MANAGER'`;
        notifParams.push(userId);
      } else if (role === 'ceo') {
        notifQuery += `recipient_role = 'CEO'`;
      } else {
        notifQuery += `recipient_user_id = ? AND recipient_role = 'USER'`;
        notifParams.push(userId);
      }

      const [notifRows] = await pool.execute(notifQuery, notifParams);
      counts.notifications = Number(notifRows[0]?.c || 0);
    } catch (notifErr) {
      console.warn('[dashboard-counts] Failed to fetch notification count:', notifErr.message);
    }

    const { sql: visSql, params: visParams } = getVisibilityClause(userId, role);

    // Role-specific counts
    if (role === 'hr_executive' || role === 'support_manager') {
      // All tickets for HR
      try {
        const [ticketRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL)${visSql}`,
          [tenantId, ...visParams]
        );
        counts.tickets = Number(ticketRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch ticket count:', err.message);
      }

      // Assigned to HR
      try {
        const [assignedRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND assigned_to = ? 
           AND status IN ('new', 'in_progress', 'waiting')${visSql}`,
          [tenantId, userId, ...visParams]
        );
        counts.assigned = Number(assignedRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch assigned count:', err.message);
      }

      // Escalations (tickets escalated to department head)
      try {
        const [escRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND status = 'escalated'${visSql}`,
          [tenantId, ...visParams]
        );
        counts.escalations = Number(escRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch escalation count:', err.message);
      }
    } else if (role === 'employee' || role === 'user') {
      // Employee's tickets
      try {
        const [ticketRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND created_by = ?`,
          [tenantId, userId]
        );
        counts.tickets = Number(ticketRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch employee ticket count:', err.message);
      }
    } else if (role === 'department_head') {
      // Tickets escalated to this department head
      try {
        const [escRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND assigned_to = ?
           AND is_escalated = TRUE${visSql}`,
          [tenantId, userId, ...visParams]
        );
        counts.escalations = Number(escRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch dept escalation count:', err.message);
      }

      // Under investigation
      try {
        const [invRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND dept_review_status = 'under_investigation'${visSql}`,
          [tenantId, ...visParams]
        );
        counts.investigations = Number(invRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch investigation count:', err.message);
      }

      // Returned to HR
      try {
        const [retRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND dept_review_status = 'returned_to_hr'${visSql}`,
          [tenantId, ...visParams]
        );
        counts.returned = Number(retRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch returned count:', err.message);
      }

      // Cases directly assigned to this department head
      try {
        const [assignedRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND assigned_to = ?${visSql}`,
          [tenantId, userId, ...visParams]
        );
        counts.assigned = Number(assignedRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch assigned count:', err.message);
      }
    } else if (role === 'system_admin' || role === 'admin') {
      // Admin escalated tickets (escalated to this admin)
      try {
        const [ticketRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND assigned_to = ?
           AND is_escalated = TRUE`,
          [tenantId, userId]
        );
        counts.tickets = Number(ticketRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch admin ticket count:', err.message);
      }

      // All cases directly assigned to this admin (including escalated)
      try {
        const [assignedRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND assigned_to = ?`,
          [tenantId, userId]
        );
        counts.assigned = Number(assignedRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch assigned count:', err.message);
      }
    } else if (role === 'hr_manager' || role === 'ceo') {
      // Tickets escalated to this HR Manager / CEO
      try {
        const [escRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND assigned_to = ?
           AND is_escalated = TRUE${visSql}`,
          [tenantId, userId, ...visParams]
        );
        counts.escalations = Number(escRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch escalation count:', err.message);
      }
      // All cases directly assigned to this HR Manager / CEO (including escalated)
      try {
        const [assignedRows] = await pool.execute(
          `SELECT COUNT(*) AS c FROM cases 
           WHERE (tenant_id = ? OR tenant_id IS NULL) 
           AND assigned_to = ?${visSql}`,
          [tenantId, userId, ...visParams]
        );
        counts.assigned = Number(assignedRows[0]?.c || 0);
      } catch (err) {
        console.warn('[dashboard-counts] Failed to fetch assigned count:', err.message);
      }
    }

    res.json({ success: true, counts });
  } catch (error) {
    console.error('[dashboard-counts] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
});

module.exports = router;
