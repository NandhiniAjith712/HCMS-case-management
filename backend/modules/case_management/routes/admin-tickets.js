/**
 * System Admin Tickets API Routes
 * Handles all escalated tickets that the system admin needs to work on.
 * Endpoints:
 * - GET /api/admin/system-admin-tickets - List all escalated tickets
 * - GET /api/admin/system-admin-tickets/:id - Get ticket detail
 * - POST /api/admin/system-admin-tickets/:id/action - Perform action (approve/reject/investigate/return)
 * - POST /api/admin/system-admin-tickets/:id/notes - Add internal note
 * - POST /api/admin/system-admin-tickets/:id/comments - Add comment
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');
const { authenticate, authorizeRoles } = require('../../auth/middleware/auth.middleware');
const { ROLES } = require('../../auth/constants/roles');
const { notifyCommentAdded, insertAndFanOut } = require('../services/appNotificationService');
const { getCasePermissions, maskCaseData, maskAnonymousName, isAnonymousCase } = require('../services/specialCaseAccessService');

const requireSystemAdmin = [
  authenticate,
  authorizeRoles(ROLES.ADMIN)
];

function maskAnonymousAdminHistory(history, isAnonymous, createdBy) {
  if (!isAnonymous || !Array.isArray(history) || !createdBy) return history;
  return history.map(h => {
    if (Number(h.performed_by) === Number(createdBy)) {
      return { ...h, performed_by_name: 'Anonymous Employee', performed_by: null };
    }
    return h;
  });
}

function maskAnonymousAdminComments(comments, isAnonymous, createdBy) {
  if (!isAnonymous || !Array.isArray(comments) || !createdBy) return comments;
  return comments.map(c => {
    if (Number(c.sender_id) === Number(createdBy)) {
      return { ...c, sender_name: 'Anonymous Employee', sender_id: null, name: 'Anonymous Employee' };
    }
    return c;
  });
}

function maskAnonymousAdminNotes(notes, isAnonymous, reporterName) {
  if (!isAnonymous || !Array.isArray(notes) || !reporterName) return notes;
  return notes.map(n => {
    if (String(n.author || '').toLowerCase() === String(reporterName).toLowerCase()) {
      return { ...n, author: 'Anonymous Employee' };
    }
    return n;
  });
}

// GET /api/admin/system-admin-tickets - List all escalated tickets
router.get('/system-admin-tickets', requireSystemAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const userId = Number(req.user.id || 0);
    const { search, status, category, priority } = req.query;
    const limit = Math.max(1, parseInt(req.query.limit || 50, 10) || 50);

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
        COALESCE(c.dept_review_status, c.status) as status,
        c.created_at,
        c.updated_at,
        c.escalation_reason,
        u.name as reporter_name,
        u.id as reporter_id,
        a.name as assigned_to_name
      FROM cases c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN users a ON c.assigned_to = a.id
      WHERE (c.tenant_id = ? OR c.tenant_id IS NULL)
        AND c.assigned_to = ?
        AND c.is_escalated = TRUE
    `;
    const params = [tenantId, userId];

    if (search) {
      query += ` AND (c.ticket_code LIKE ? OR c.title LIKE ? OR (c.reporting_mode != 'anonymous' AND u.name LIKE ?))`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status && status !== 'all') {
      query += ` AND (c.dept_review_status = ? OR (c.dept_review_status IS NULL AND c.status = ?))`;
      params.push(status, status);
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

    const maskedTickets = tickets.map(t => {
      if (isAnonymousCase(t)) {
        return { ...t, reporter_name: 'Anonymous Employee', reporter_id: '******' };
      }
      return t;
    });

    res.json({ data: maskedTickets });
  } catch (error) {
    console.error('Error fetching admin tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET /api/admin/system-admin-tickets/:id - Get ticket detail
router.get('/system-admin-tickets/:id', requireSystemAdmin, async (req, res) => {
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
        COALESCE(c.dept_review_status, c.status) as status,
        c.status as raw_status,
        c.dept_review_status,
        c.created_at,
        c.updated_at,
        c.escalation_reason,
        c.sla,
        c.created_by,
        c.tenant_id,
        u.name as reporter_name,
        u.id as reporter_id,
        a.name as assigned_to_name,
        a.id as assigned_to
       FROM cases c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE c.id = ? AND (c.tenant_id = ? OR c.tenant_id IS NULL)
         AND (
           c.dept_review_status = 'escalated_to_admin'
           OR c.assigned_to IN (SELECT id FROM users WHERE role = 'system_admin')
         )`,
      [req.params.id, tenantId]
    );

    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = tickets[0];
    const permissions = await getCasePermissions(req.user, ticket);

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

    const [notes] = await connection.execute(
      `SELECT id, note as text, created_at, author FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );

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

    const [pendingEscalationConsent] = await connection.execute(
      `SELECT * FROM case_escalation_consent
       WHERE case_id = ? AND tenant_id = ? AND status = 'pending'
       ORDER BY requested_at DESC
       LIMIT 1`,
      [req.params.id, tenantId]
    );

    connection.release();

    const isAnonymous = isAnonymousCase(ticket);
    const maskedTicket = await maskCaseData(ticket, req.user);
    const maskedComments = maskAnonymousAdminComments(commentsWithAttachments, isAnonymous, ticket.created_by);
    const maskedNotes = maskAnonymousAdminNotes(notes, isAnonymous, ticket.reporter_name);
    const maskedTimeline = maskAnonymousAdminHistory(timeline, isAnonymous, ticket.created_by);
    const maskedCaseAttachments = caseAttachments.map(a => {
      if (isAnonymous && Number(a.uploaded_by) === Number(ticket.created_by)) {
        return { ...a, uploaded_by: null };
      }
      return a;
    });

    res.json({
      data: {
        ...maskedTicket,
        permissions,
        pendingEscalationConsent: pendingEscalationConsent[0] || null,
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
        internal_notes: maskedNotes.map(n => ({ ...n, note: n.text })),
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
    console.error('Error fetching admin ticket detail:', error);
    res.status(500).json({ error: 'Failed to fetch ticket detail' });
  }
});

// POST /api/admin/system-admin-tickets/:id/action - Perform action
router.post('/system-admin-tickets/:id/action', requireSystemAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { action, reason } = req.body;

    const validActions = ['approve', 'reject', 'investigate', 'return', 'resolution', 'resolve'];
    if (!validActions.includes(action)) {
      connection.release();
      return res.status(400).json({ error: 'Invalid action' });
    }

    if (action === 'reject' && (!reason || !reason.trim())) {
      connection.release();
      return res.status(400).json({ error: 'A reason is required to reject the ticket' });
    }

    const [tickets] = await connection.execute(
      `SELECT c.id, c.status, c.title, c.ticket_code, c.created_by, c.assigned_to, u.name as reporter_name
       FROM cases c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ? AND (c.tenant_id = ? OR c.tenant_id IS NULL)
         AND (
           c.dept_review_status = 'escalated_to_admin'
           OR c.assigned_to IN (SELECT id FROM users WHERE role = 'system_admin')
         )`,
      [req.params.id, tenantId]
    );

    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticketRow = tickets[0];

    let newStatus = 'escalated';
    let deptStatus = 'pending_approval';
    let actionType = action;
    let assignedTo = null;
    let notifyUserId = null;
    let notifyStaffId = null;
    let notifTitle = '';
    let notifDesc = '';

    switch (action) {
      case 'approve':
      case 'resolution':
      case 'resolve':
        newStatus = 'resolved';
        deptStatus = 'resolved';
        actionType = 'resolved';
        notifyUserId = ticketRow.created_by;
        notifTitle = 'Ticket resolved';
        notifDesc = `System Admin has resolved your ticket "${ticketRow.title || ticketRow.ticket_code}". You may now close it.`;
        break;
      case 'reject':
        newStatus = 'rejected';
        deptStatus = 'rejected';
        actionType = 'rejected';
        notifyUserId = ticketRow.created_by;
        notifTitle = 'Ticket rejected';
        notifDesc = `Your ticket "${ticketRow.title || ticketRow.ticket_code}" has been rejected by System Admin. Reason: ${reason.trim()}`;
        break;
      case 'investigate':
        newStatus = 'in_progress';
        deptStatus = 'under_investigation';
        actionType = 'under_investigation';
        break;
      case 'return':
        newStatus = 'in_progress';
        deptStatus = 'returned_to_hr';
        actionType = 'returned_to_hr';
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
          const [hrUsers] = await connection.execute(
            `SELECT id FROM users WHERE role = 'hr_executive' ORDER BY id ASC LIMIT 1`
          );
          if (hrUsers.length > 0) {
            assignedTo = hrUsers[0].id;
            notifyStaffId = hrUsers[0].id;
          }
        }
        notifTitle = 'Ticket returned by System Admin';
        notifDesc = `System Admin has returned ticket "${ticketRow.title || ticketRow.ticket_code}" back to HR. Please review and continue handling.`;
        break;
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

    try {
      if (notifyUserId) {
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
        await insertAndFanOut(pool, {
          tenantId,
          recipientRole: 'AGENT',
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

    res.json({ success: true, message: `Ticket ${action} completed successfully`, status: newStatus });
  } catch (error) {
    console.error('Error performing admin action:', error);
    res.status(500).json({ error: 'Failed to perform action' });
  }
});

// POST /api/admin/system-admin-tickets/:id/notes
router.post('/system-admin-tickets/:id/notes', requireSystemAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { text } = req.body;

    if (!text || !text.trim()) {
      connection.release();
      return res.status(400).json({ error: 'Note text is required' });
    }

    const [tickets] = await connection.execute(
      `SELECT id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
         AND (
           dept_review_status = 'escalated_to_admin'
           OR assigned_to IN (SELECT id FROM users WHERE role = 'system_admin')
         )`,
      [req.params.id, tenantId]
    );

    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    await connection.execute(
      `INSERT INTO ticket_notes (ticket_id, note, author, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [req.params.id, text.trim(), req.user.name]
    );

    const [notes] = await connection.execute(
      `SELECT id, note as text, created_at, author FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );

    connection.release();
    res.json({ data: notes.map(n => ({ ...n, note: n.text })) });
  } catch (error) {
    console.error('Error adding admin note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// POST /api/admin/system-admin-tickets/:id/comments
router.post('/system-admin-tickets/:id/comments', requireSystemAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = Number(req.user.tenant_id || req.user.tenantId || 1) || 1;
    const { message } = req.body;

    if (!message || !message.trim()) {
      connection.release();
      return res.status(400).json({ error: 'Message is required' });
    }

    const [tickets] = await connection.execute(
      `SELECT id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
         AND (
           dept_review_status = 'escalated_to_admin'
           OR assigned_to IN (SELECT id FROM users WHERE role = 'system_admin')
         )`,
      [req.params.id, tenantId]
    );

    if (tickets.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const [insertResult] = await connection.execute(
      `INSERT INTO ticket_messages (tenant_id, ticket_id, sender_type, sender_id, sender_name, message, channel, created_at)
       VALUES (?, ?, 'agent', ?, ?, ?, 'platform_chat', CURRENT_TIMESTAMP)`,
      [tenantId, req.params.id, req.user.id, req.user.name, message.trim()]
    );
    const messageId = insertResult.insertId;

    const [ticketData] = await connection.execute(
      `SELECT c.id, c.ticket_code as ticket_id, c.title, c.reporting_mode, c.created_by, u.name as reporter_name, u.id as reporter_id
       FROM cases c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`,
      [req.params.id]
    );

    const [comments] = await connection.execute(
      `SELECT tm.id, tm.message as text, tm.created_at, tm.sender_type, tm.sender_name as name, u.role,
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

    const adminTicket = ticketData[0] || {};
    const adminIsAnonymous = isAnonymousCase(adminTicket);
    const maskedAdminTicket = adminIsAnonymous
      ? { ...adminTicket, reporter_name: 'Anonymous Employee', reporter_id: '******' }
      : adminTicket;
    const maskedAdminComments = maskAnonymousAdminComments(commentsWithAttachments, adminIsAnonymous, adminTicket.created_by);

    connection.release();

    try {
      await notifyCommentAdded(pool, {
        tenantId,
        ticketId: Number(req.params.id),
        isCustomerReply: false,
        senderName: req.user.name,
        excerpt: message.trim(),
        userId: adminTicket.reporter_id,
        issueTitle: adminTicket.title
      });
    } catch (notifErr) {
      console.error('Failed to send comment notification (non-fatal):', notifErr.message);
    }

    res.json({
      data: {
        ...maskedAdminTicket,
        message_id: messageId,
        conversation: maskedAdminComments.map(c => {
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
    console.error('Error adding admin comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

module.exports = router;
