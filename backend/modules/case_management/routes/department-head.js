/**
 * Department Head API Routes
 * Handles escalated tickets, decisions, and dashboard for Department Head role
 * Endpoints:
 * - GET /api/admin/dashboard - Get department head dashboard stats
 * - GET /api/admin/escalated-tickets - List escalated tickets with filters
 * - GET /api/admin/escalated-tickets/:id - Get escalated ticket detail
 * - POST /api/admin/escalated-tickets/:id/action - Perform action (approve/reject/investigate/return)
 * - POST /api/admin/escalated-tickets/:id/notes - Add internal note
 * - POST /api/admin/escalated-tickets/:id/comments - Add comment
 * - GET /api/admin/audit-logs - Get recent activity/decisions
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');
const { authenticate, authorizeRoles } = require('../../auth/middleware/auth.middleware');
const { ROLES } = require('../../auth/constants/roles');
const { notifyCommentAdded, insertAndFanOut } = require('../services/appNotificationService');
const {
  isSpecialCaseType,
  canViewCase,
  canViewEmployeeDetails,
  canComment,
  canPerformActions,
  canResolveCase,
  canCloseCase,
  getCasePermissions,
  getVisibilityFilter,
  isSystemAdmin,
  maskCaseData,
  isAnonymousCase
} = require('../services/specialCaseAccessService');

function getVisibilityClause(user) {
  if (isSystemAdmin(user)) return { sql: '', params: [] };
  const { sql, params } = getVisibilityFilter('c', user.id);
  return { sql, params };
}

function maskAnonymousDeptList(tickets) {
  if (!Array.isArray(tickets)) return tickets;
  return tickets.map(t => {
    if (isAnonymousCase(t)) {
      return { ...t, reporter_name: 'Anonymous Employee', reporter_id: '******' };
    }
    return t;
  });
}

function maskAnonymousDeptHistory(history, isAnonymous, createdBy) {
  if (!isAnonymous || !Array.isArray(history) || !createdBy) return history;
  return history.map(h => {
    if (Number(h.performed_by) === Number(createdBy)) {
      return { ...h, performed_by_name: 'Anonymous Employee', performed_by: null };
    }
    return h;
  });
}

function maskAnonymousDeptComments(comments, isAnonymous, createdBy) {
  if (!isAnonymous || !Array.isArray(comments) || !createdBy) return comments;
  return comments.map(c => {
    if (Number(c.sender_id) === Number(createdBy)) {
      return { ...c, sender_name: 'Anonymous Employee', sender_id: null, name: 'Anonymous Employee' };
    }
    return c;
  });
}

function maskAnonymousDeptNotes(notes, isAnonymous, reporterName) {
  if (!isAnonymous || !Array.isArray(notes) || !reporterName) return notes;
  return notes.map(n => {
    if (String(n.author || '').toLowerCase() === String(reporterName).toLowerCase()) {
      return { ...n, author: 'Anonymous Employee' };
    }
    return n;
  });
}

// Middleware chain: authenticate then restrict to department head / admin roles
const requireDeptHead = [
  authenticate,
  authorizeRoles(ROLES.DEPARTMENT_HEAD, ROLES.ADMIN)
];

// GET /api/admin/dept-dashboard - Get department head dashboard stats
router.get('/dept-dashboard', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { sql: visSql, params: visParams } = getVisibilityClause(req.user);

    // Count tickets by Department Head review status (one DH handles all departments).
    // Only tickets that have reached the DH (dept_review_status set) are counted.
    const [statusCounts] = await connection.execute(
      `SELECT 
        SUM(CASE WHEN dept_review_status = 'pending_approval' THEN 1 ELSE 0 END) as escalated,
        SUM(CASE WHEN dept_review_status = 'pending_approval' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN dept_review_status = 'under_investigation' THEN 1 ELSE 0 END) as investigation,
        SUM(CASE WHEN dept_review_status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN dept_review_status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN dept_review_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN dept_review_status = 'returned_to_hr' THEN 1 ELSE 0 END) as returned
       FROM cases c
       WHERE (c.tenant_id = ? OR c.tenant_id IS NULL) AND c.dept_review_status IS NOT NULL${visSql}`,
      [tenantId, ...visParams]
    );
    
    const stats = statusCounts[0] || { escalated: 0, pending: 0, investigation: 0, resolved: 0, closed: 0, rejected: 0, returned: 0 };
    
    connection.release();
    
    res.json({
      data: {
        dept_stats: {
          escalated: stats.escalated || 0,
          pending: stats.pending || 0,
          investigation: stats.investigation || 0,
          resolved: stats.resolved || 0,
          closed: stats.closed || 0,
          rejected: stats.rejected || 0,
          returned: stats.returned || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// GET /api/admin/escalated-tickets - List escalated tickets
router.get('/escalated-tickets', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { search, status, category, priority } = req.query;
    const limit = Math.max(1, parseInt(req.query.limit || 50, 10) || 50);
    const { sql: visSql, params: visParams } = getVisibilityClause(req.user);

    let query = `
      SELECT
        c.id,
        c.ticket_code as ticket_id,
        c.title,
        c.description,
        c.category,
        c.subcategory,
        c.priority,
        c.reporting_mode,
        c.dept_review_status as status,
        c.created_at,
        c.updated_at,
        c.escalation_reason,
        u.name as reporter_name,
        u.id as reporter_id,
        a.name as assigned_hr_name
      FROM cases c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN users a ON c.assigned_to = a.id
      WHERE (c.tenant_id = ? OR c.tenant_id IS NULL) AND c.dept_review_status IS NOT NULL${visSql}
    `;
    const params = [tenantId, ...visParams];

    if (search) {
      query += ` AND (c.ticket_code LIKE ? OR c.title LIKE ? OR (c.reporting_mode != 'anonymous' AND u.name LIKE ?))`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (status && status !== 'all') {
      query += ` AND c.dept_review_status = ?`;
      params.push(status);
    }
    
    if (category) {
      query += ` AND c.category = ?`;
      params.push(category);
    }
    
    if (priority) {
      query += ` AND c.priority = ?`;
      params.push(priority);
    }
    
    query += ` ORDER BY c.updated_at DESC LIMIT ${limit}`;
    
    const [tickets] = await connection.execute(query, params);
    connection.release();

    const maskedTickets = await Promise.all(
      tickets.map(async (t) => await maskCaseData(t, req.user))
    );
    res.json({ data: maskedTickets });
  } catch (error) {
    console.error('Error fetching escalated tickets:', error);
    res.status(500).json({ error: 'Failed to fetch escalated tickets' });
  }
});

// GET /api/admin/all-tickets - List ALL tickets across every department (Department Head full visibility)
router.get('/all-tickets', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { search, status, department, priority } = req.query;
    const limit = Math.max(1, parseInt(req.query.limit || 200, 10) || 200);
    const { sql: visSql, params: visParams } = getVisibilityClause(req.user);

    let query = `
      SELECT
        c.id,
        c.ticket_code as ticket_id,
        c.title,
        c.description,
        c.category,
        c.subcategory,
        c.priority,
        c.reporting_mode,
        c.status,
        c.dept_review_status,
        c.created_at,
        c.updated_at,
        u.name as reporter_name,
        u.id as reporter_id,
        a.name as assigned_to_name
      FROM cases c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN users a ON c.assigned_to = a.id
      WHERE (c.tenant_id = ? OR c.tenant_id IS NULL)${visSql}
    `;
    const params = [tenantId, ...visParams];

    if (search) {
      query += ` AND (c.ticket_code LIKE ? OR c.title LIKE ? OR (c.reporting_mode != 'anonymous' AND u.name LIKE ?))`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (department) {
      query += ` AND c.category = ?`;
      params.push(department);
    }
    if (status && status !== 'all') {
      query += ` AND c.status = ?`;
      params.push(status);
    }
    if (priority) {
      query += ` AND c.priority = ?`;
      params.push(priority);
    }

    query += ` ORDER BY c.created_at DESC LIMIT ${limit}`;

    const [tickets] = await connection.execute(query, params);
    connection.release();
    const maskedTickets = await Promise.all(
      tickets.map(async (t) => await maskCaseData(t, req.user))
    );
    res.json({ data: maskedTickets });
  } catch (error) {
    console.error('Error fetching all tickets:', error);
    res.status(500).json({ error: 'Failed to fetch all tickets' });
  }
});

// GET /api/admin/ticket-departments - Distinct departments (categories) for filtering
router.get('/ticket-departments', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const [rows] = await connection.execute(
      `SELECT DISTINCT category FROM cases 
       WHERE (tenant_id = ? OR tenant_id IS NULL) AND category IS NOT NULL AND category <> ''
       ORDER BY category ASC`,
      [tenantId]
    );
    connection.release();
    res.json({ data: rows.map(r => r.category) });
  } catch (error) {
    console.error('Error fetching ticket departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// GET /api/admin/escalated-tickets/:id - Get escalated ticket detail
router.get('/escalated-tickets/:id', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    
    const [tickets] = await connection.execute(
      `SELECT
        c.id,
        c.ticket_code as ticket_id,
        c.title,
        c.description,
        c.category,
        c.subcategory,
        c.priority,
        c.reporting_mode,
        c.escalation_level,
        c.created_by,
        COALESCE(c.dept_review_status, c.status) as status,
        c.status as raw_status,
        c.dept_review_status,
        c.created_at,
        c.updated_at,
        c.escalation_reason,
        c.sla,
        u.name as reporter_name,
        u.id as reporter_id,
        a.name as assigned_hr_name,
        a.id as assigned_to
       FROM cases c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE c.id = ? AND (c.tenant_id = ? OR c.tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );

    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    let ticket = tickets[0];
    const rawCreatedBy = ticket.created_by;
    const rawReporterName = ticket.reporter_name;

    // Special-case view and employee-detail masking
    if (isSpecialCaseType(ticket.reporting_mode)) {
      if (!(await canViewCase(req.user, ticket))) {
        connection.release();
        return res.status(403).json({ error: 'You do not have permission to view this ticket' });
      }
      if (!(await canViewEmployeeDetails(req.user, ticket))) {
        ticket = await maskCaseData(ticket, req.user);
      }
    }

    const isAnonymous = isAnonymousCase(tickets[0]);
    
    // Get conversation/comments from the UNIFIED ticket_messages table so the
    // thread is shared with employees and HR (excluding internal staff-only notes).
    const [comments] = await connection.execute(
      `SELECT 
        tm.id,
        tm.message as text,
        tm.created_at,
        tm.sender_type,
        tm.sender_name as name,
        u.role,
        SUBSTRING(COALESCE(tm.sender_name, u.name, 'U'), 1, 1) as initials
       FROM ticket_messages tm
       LEFT JOIN users u ON tm.sender_id = u.id
       WHERE tm.ticket_id = ? AND (tm.is_internal IS NULL OR tm.is_internal = FALSE)
       ORDER BY tm.created_at ASC`,
      [req.params.id]
    );

    // Fetch attachments for each conversation message
    const commentsWithAttachments = await Promise.all(comments.map(async (c) => {
      const [attachments] = await connection.execute(
        `SELECT id, file_name as name, file_size as size, file_type as type FROM case_attachments WHERE message_id = ?`,
        [c.id]
      );
      return { ...c, attachments };
    }));

    // Get internal notes
    const [notes] = await connection.execute(
      `SELECT 
        id,
        note as text,
        created_at,
        author
       FROM ticket_notes
       WHERE ticket_id = ?
       ORDER BY created_at DESC`,
      [req.params.id]
    );

    // Get activity timeline
    const [timeline] = await connection.execute(
      `SELECT 
        ta.id,
        ta.action,
        ta.details,
        COALESCE(ta.performed_by_name, u.name) as performed_by_name,
        ta.performed_by,
        u.name as user_name,
        ta.created_at
       FROM ticket_activity ta
       LEFT JOIN users u ON ta.performed_by = u.id
       WHERE ta.ticket_id = ?
       ORDER BY ta.created_at DESC`,
      [req.params.id]
    );

    // Get case-level attachments uploaded during ticket creation (message_id IS NULL)
    const [caseAttachments] = await connection.execute(
      `SELECT id, file_name as name, file_size as size, file_type as type, file_path, uploaded_at, uploaded_by
       FROM case_attachments
       WHERE case_id = ? AND message_id IS NULL
       ORDER BY uploaded_at ASC`,
      [req.params.id]
    );
    
    // Compute special-case permissions for the frontend
    const permissions = await getCasePermissions(req.user, ticket);

    const maskedComments = maskAnonymousDeptComments(commentsWithAttachments, isAnonymous, rawCreatedBy);
    const maskedNotes = maskAnonymousDeptNotes(notes, isAnonymous, rawReporterName);
    const maskedTimeline = maskAnonymousDeptHistory(timeline, isAnonymous, rawCreatedBy);
    const maskedCaseAttachments = caseAttachments.map(a => {
      if (isAnonymous && Number(a.uploaded_by) === Number(rawCreatedBy)) {
        return { ...a, uploaded_by: null };
      }
      return a;
    });

    connection.release();

    res.json({
      data: {
        ...ticket,
        permissions,
        attachments: maskedCaseAttachments || [],
        conversation: maskedComments.map(c => {
          const role = c.role || (c.sender_type === 'user' ? 'employee' : 'agent');
          const tag = role === 'employee' ? 'EMPLOYEE' : role === 'hr_executive' ? 'HR' : role === 'department_head' ? 'DEPT HEAD' : 'STAFF';
          return {
            ...c,
            message: c.text,
            roleTag: tag,
            tagBg: role === 'employee' ? '#DBEAFE' : role === 'hr_executive' ? '#D1FAE5' : role === 'department_head' ? '#EDE9FE' : '#F1F5F9',
            tagColor: role === 'employee' ? '#3B82F6' : role === 'hr_executive' ? '#059669' : role === 'department_head' ? '#7C3AED' : '#64748B'
          };
        }),
        internal_notes: maskedNotes.map(n => ({
          ...n,
          note: n.text
        })),
        timeline: maskedTimeline.map(t => ({
          id: t.id,
          action: t.action,
          title: t.action?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Activity',
          description: t.details ? (typeof t.details === 'string' ? t.details : JSON.stringify(t.details)) : '',
          details: (() => {
            if (!t.details) return {};
            if (typeof t.details === 'string') {
              try { return JSON.parse(t.details); } catch (e) { return {}; }
            }
            return t.details;
          })(),
          time: t.created_at,
          created_at: t.created_at,
          performed_by_name: t.performed_by_name || t.user_name || (t.performed_by ? `User #${t.performed_by}` : 'System'),
          performed_by: t.performed_by,
          user_name: t.user_name
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching ticket detail:', error);
    res.status(500).json({ error: 'Failed to fetch ticket detail' });
  }
});

// POST /api/admin/escalated-tickets/:id/action - Perform action
router.post('/escalated-tickets/:id/action', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { action, reason } = req.body;
    
    const validActions = ['approve', 'reject', 'investigate', 'return', 'resolution', 'resolve'];
    if (!validActions.includes(action)) {
      connection.release();
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    // Reject requires a reason
    if (action === 'reject' && (!reason || !reason.trim())) {
      connection.release();
      return res.status(400).json({ error: 'A reason is required to reject the ticket' });
    }

    const [tickets] = await connection.execute(
      `SELECT c.id, c.status, c.title, c.ticket_code, c.created_by, c.assigned_to,
              c.reporting_mode, c.escalation_level, c.tenant_id,
              u.name as reporter_name
       FROM cases c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ? AND (c.tenant_id = ? OR c.tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );

    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticketRow = tickets[0];

    // Special-case action permission
    const isResolveAction = ['approve', 'resolution', 'resolve'].includes(action);
    if (isSpecialCaseType(ticketRow.reporting_mode)) {
      if (isResolveAction && !(await canResolveCase(req.user, ticketRow))) {
        connection.release();
        return res.status(403).json({ error: 'You do not have permission to resolve this ticket' });
      }
      if (!isResolveAction && !(await canPerformActions(req.user, ticketRow))) {
        connection.release();
        return res.status(403).json({ error: 'You do not have permission to perform actions on this ticket' });
      }
    }

    let newStatus = 'escalated';       // raw cases.status
    let deptStatus = 'pending_approval'; // dept_review_status shown to DH
    let actionType = action;
    let assignedTo = null;
    let notifyUserId = null;   // for employee notifications
    let notifyStaffId = null;  // for HR/admin notifications
    let notifTitle = '';
    let notifDesc = '';
    let returnPayload = null;  // extra data returned to frontend (e.g. return message_id)

    switch (action) {
      case 'approve':
      case 'resolution':
      case 'resolve':
        newStatus = 'resolved';
        deptStatus = 'resolved';
        actionType = 'resolved';
        notifyUserId = ticketRow.created_by;
        notifTitle = 'Ticket resolved';
        notifDesc = `Department Head has resolved your ticket "${ticketRow.title || ticketRow.ticket_code}". You may now close it.`;
        break;
      case 'reject':
        newStatus = 'rejected';
        deptStatus = 'rejected';
        actionType = 'rejected';
        notifyUserId = ticketRow.created_by;
        notifTitle = 'Ticket rejected';
        notifDesc = `Your ticket "${ticketRow.title || ticketRow.ticket_code}" has been rejected. Reason: ${reason.trim()}`;
        break;
      case 'investigate':
        newStatus = 'in_progress';
        deptStatus = 'under_investigation';
        actionType = 'under_investigation';
        break;
      case 'return': {
        // Return to the HR executive who escalated it (assigned_to before DH).
        // Reassign back so HR sees it in their queue.
        newStatus = 'in_progress';
        deptStatus = 'returned_to_hr';
        actionType = 'returned_to_hr';
        // Find the HR user who was handling this ticket (look up from ticket_activity)
        const [hrRows] = await connection.execute(
          `SELECT performed_by FROM ticket_activity
           WHERE ticket_id = ? AND action = 'escalated'
           ORDER BY created_at DESC LIMIT 1`,
          [req.params.id]
        );
        if (hrRows.length > 0 && hrRows[0].performed_by) {
          assignedTo = hrRows[0].performed_by;
          notifyStaffId = hrRows[0].performed_by;
        } else {
          // Fallback: find any active HR executive
          const [hrUsers] = await connection.execute(
            `SELECT id FROM users WHERE role = 'hr_executive' ORDER BY id ASC LIMIT 1`
          );
          if (hrUsers.length > 0) {
            assignedTo = hrUsers[0].id;
            notifyStaffId = hrUsers[0].id;
          }
        }
        // Store return note as internal message for HR visibility
        let returnMessageId = null;
        if (reason && reason.trim()) {
          const [msgResult] = await connection.execute(
            `INSERT INTO ticket_messages (tenant_id, ticket_id, sender_type, sender_id, sender_name, message, channel, is_internal, created_at)
             VALUES (?, ?, 'agent', ?, ?, ?, 'platform_chat', TRUE, CURRENT_TIMESTAMP)`,
            [tenantId, req.params.id, req.user.id, req.user.name, reason.trim()]
          );
          returnMessageId = msgResult.insertId;
        }
        returnPayload = { returnMessageId };
        notifTitle = 'Ticket returned by Department Head';
        notifDesc = reason && reason.trim()
          ? `Department Head returned ticket "${ticketRow.title || ticketRow.ticket_code}" back to HR with a note: ${reason.trim().slice(0, 100)}`
          : `Department Head has returned ticket "${ticketRow.title || ticketRow.ticket_code}" back to HR. Please review and continue handling.`;
        break;
      }
    }

    if (assignedTo !== null) {
      await connection.execute(
        `UPDATE cases SET status = ?, dept_review_status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, deptStatus, assignedTo, req.params.id]
      );
    } else {
      await connection.execute(
        `UPDATE cases SET status = ?, dept_review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, deptStatus, req.params.id]
      );
    }

    // Log activity
    try {
      await connection.execute(
        `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [req.params.id, actionType, req.user.id, req.user.name, JSON.stringify({ action, reason: reason || '' })]
      );
    } catch (logErr) {
      console.error('Failed to log activity (non-fatal):', logErr.message);
    }

    connection.release();

    // Send in-app notification to the appropriate person
    try {
      if (notifyUserId) {
        // Notify the employee (ticket creator)
        await insertAndFanOut(pool, {
          tenantId,
          recipientRole: 'USER',
          recipientStaffId: null,
          recipientUserId: notifyUserId,
          title: notifTitle,
          description: notifDesc,
          type: 'STATUS_CHANGED',
          ticketId: Number(req.params.id),
          dedupeKey: null
        });
      }
      if (notifyStaffId) {
        // Determine target role so the notification lands in the correct inbox
        const [targetRows] = await pool.execute(
          `SELECT role FROM users WHERE id = ? LIMIT 1`,
          [notifyStaffId]
        );
        const targetRole = targetRows[0]?.role || 'AGENT';
        const recipientRole = targetRole === 'system_admin' || targetRole === 'admin' ? 'MANAGER' : 'AGENT';
        // Notify HR or admin (staff)
        await insertAndFanOut(pool, {
          tenantId,
          recipientRole,
          recipientStaffId: notifyStaffId,
          recipientUserId: null,
          title: notifTitle,
          description: notifDesc,
          type: 'STATUS_CHANGED',
          ticketId: Number(req.params.id),
          dedupeKey: null
        });
      }
    } catch (notifErr) {
      console.error('Failed to send action notification (non-fatal):', notifErr.message);
    }

    res.json({ success: true, message: `Ticket ${action} completed successfully`, status: newStatus, data: returnPayload });
  } catch (error) {
    console.error('Error performing action:', error);
    res.status(500).json({ error: 'Failed to perform action' });
  }
});

// POST /api/admin/escalated-tickets/:id/notes - Add internal note
router.post('/escalated-tickets/:id/notes', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { text } = req.body;
    
    if (!text || !text.trim()) {
      connection.release();
      return res.status(400).json({ error: 'Note text is required' });
    }
    
    const [tickets] = await connection.execute(
      `SELECT id, assigned_to, reporting_mode, escalation_level, tenant_id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Special-case comment permission
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canComment(req.user, tickets[0]))) {
      connection.release();
      return res.status(403).json({ error: 'You do not have permission to add notes to this ticket' });
    }
    
    const [result] = await connection.execute(
      `INSERT INTO ticket_notes (ticket_id, note, author, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [req.params.id, text.trim(), req.user.name]
    );
    
    // Get updated notes
    const [notes] = await connection.execute(
      `SELECT id, note as text, created_at, author FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    
    connection.release();
    
    res.json({ data: notes.map(n => ({ ...n, note: n.text })) });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// POST /api/admin/escalated-tickets/:id/comments - Add comment
router.post('/escalated-tickets/:id/comments', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      connection.release();
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const [tickets] = await connection.execute(
      `SELECT id, assigned_to, reporting_mode, escalation_level, tenant_id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [req.params.id, tenantId]
    );
    
    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Special-case comment permission
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canComment(req.user, tickets[0]))) {
      connection.release();
      return res.status(403).json({ error: 'You do not have permission to comment on this ticket' });
    }
    
    // Write to the UNIFIED ticket_messages table so the message is visible to the
    // employee and HR in their ticket views. sender_type 'agent' = staff (DH).
    const [insertResult] = await connection.execute(
      `INSERT INTO ticket_messages (tenant_id, ticket_id, sender_type, sender_id, sender_name, message, channel, created_at)
       VALUES (?, ?, 'agent', ?, ?, ?, 'platform_chat', CURRENT_TIMESTAMP)`,
      [tenantId, req.params.id, req.user.id, req.user.name, message.trim()]
    );
    const messageId = insertResult.insertId;

    // Get updated ticket with conversation
    const [ticketData] = await connection.execute(
      `SELECT
        c.id,
        c.ticket_code as ticket_id,
        c.title,
        c.description,
        c.category,
        c.subcategory,
        c.priority,
        c.reporting_mode,
        c.created_by,
        c.status,
        c.created_at,
        c.updated_at,
        c.escalation_reason,
        u.name as reporter_name,
        u.id as reporter_id,
        a.name as assigned_hr_name
       FROM cases c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE c.id = ?`,
      [req.params.id]
    );

    const [comments] = await connection.execute(
      `SELECT 
        tm.id,
        tm.message as text,
        tm.created_at,
        tm.sender_type,
        tm.sender_name as name,
        u.role,
        SUBSTRING(COALESCE(tm.sender_name, u.name, 'U'), 1, 1) as initials
       FROM ticket_messages tm
       LEFT JOIN users u ON tm.sender_id = u.id
       WHERE tm.ticket_id = ? AND (tm.is_internal IS NULL OR tm.is_internal = FALSE)
       ORDER BY tm.created_at ASC`,
      [req.params.id]
    );

    // Fetch attachments for each message
    const commentsWithAttachments = await Promise.all(comments.map(async (c) => {
      const [attachments] = await connection.execute(
        `SELECT id, file_name, file_type, file_size FROM case_attachments WHERE message_id = ?`,
        [c.id]
      );
      return { ...c, attachments };
    }));

    const dhTicket = ticketData[0] || {};
    const dhIsAnonymous = isAnonymousCase(dhTicket);
    const maskedDhTicket = dhIsAnonymous
      ? { ...dhTicket, reporter_name: 'Anonymous Employee', reporter_id: '******' }
      : dhTicket;
    const maskedDhComments = maskAnonymousDeptComments(commentsWithAttachments, dhIsAnonymous, dhTicket.created_by);

    connection.release();

    // Notify the ticket owner (employee) about the new reply
    try {
      await notifyCommentAdded(pool, {
        tenantId,
        ticketId: Number(req.params.id),
        isCustomerReply: false,
        senderName: req.user.name,
        excerpt: message.trim(),
        userId: dhTicket.reporter_id,
        issueTitle: dhTicket.title
      });
    } catch (notifErr) {
      console.error('Failed to send comment notification (non-fatal):', notifErr.message);
    }

    res.json({
      data: {
        ...maskedDhTicket,
        message_id: messageId,
        conversation: maskedDhComments.map(c => {
          const role = c.role || (c.sender_type === 'user' ? 'employee' : 'agent');
          const tag = role === 'employee' ? 'EMPLOYEE' : role === 'hr_executive' ? 'HR' : role === 'department_head' ? 'DEPT HEAD' : 'STAFF';
          return {
            ...c,
            message: c.text,
            roleTag: tag,
            tagBg: role === 'employee' ? '#DBEAFE' : role === 'hr_executive' ? '#D1FAE5' : role === 'department_head' ? '#EDE9FE' : '#F1F5F9',
            tagColor: role === 'employee' ? '#3B82F6' : role === 'hr_executive' ? '#059669' : role === 'department_head' ? '#7C3AED' : '#64748B'
          };
        })
      }
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// GET /api/admin/audit-logs - Get recent activity/decisions
router.get('/audit-logs', requireDeptHead, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const limit = Math.max(1, parseInt(req.query.limit || 10, 10) || 10);
    
    const [activities] = await connection.execute(
      `SELECT 
        ta.id,
        ta.ticket_id,
        ta.action,
        ta.details,
        ta.performed_by_name,
        ta.created_at,
        c.ticket_code
       FROM ticket_activity ta
       LEFT JOIN cases c ON ta.ticket_id = c.id
       WHERE ta.tenant_id = ?
       ORDER BY ta.created_at DESC
       LIMIT ${limit}`,
      [tenantId]
    );
    
    connection.release();
    
    const data = activities.map(a => {
      let icon = 'resolved';
      let title = a.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      if (a.action.includes('reject')) icon = 'rejected';
      else if (a.action.includes('investigat')) icon = 'investigation';
      else if (a.action.includes('return')) icon = 'returned';
      else if (a.action.includes('closed') || a.action.includes('close')) icon = 'closed';
      else if (a.action.includes('escalat')) icon = 'escalated';
      
      return {
        id: a.id,
        ticket_id: a.ticket_code || `TKT-${a.ticket_id}`,
        title: title,
        description: a.details ? (typeof a.details === 'string' ? a.details : JSON.stringify(a.details)) : '',
        icon: icon,
        time: a.created_at,
        created_at: a.created_at
      };
    });
    
    res.json({ data });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
