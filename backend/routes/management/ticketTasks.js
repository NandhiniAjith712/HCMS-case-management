const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../../database');
const { authenticateToken, authorizeRole } = require('../../middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../../middleware/tenant');
const emailService = require('../../services/emailService');
const ticketEventNotificationService = require('../../services/ticketEventNotificationService');

const router = express.Router();
router.use(setTenantContext);
router.use(authenticateToken);
router.use(verifyTenantAccess);

let taskSchemaEnsured = false;
let ticketGroupColumnsEnsured = false;

const ensureTicketGroupColumns = async () => {
  if (ticketGroupColumnsEnsured) return;
  const alters = [
    'ALTER TABLE tickets ADD COLUMN group_title VARCHAR(255) NULL',
    'ALTER TABLE tickets ADD COLUMN group_internal_note TEXT NULL',
    'ALTER TABLE tickets ADD COLUMN grouped_at DATETIME NULL'
  ];
  for (const sql of alters) {
    try {
      await pool.execute(sql);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        console.warn('ensureTicketGroupColumns:', e.message);
      }
    }
  }
  ticketGroupColumnsEnsured = true;
};

let assignmentStatusColumnEnsured = false;
const ensureAssignmentStatusColumn = async () => {
  if (assignmentStatusColumnEnsured) return;
  try {
    await pool.execute(`
      ALTER TABLE ticket_tasks
      ADD COLUMN assignment_status ENUM('new','in_progress','escalated') NOT NULL DEFAULT 'new'
    `);
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn('ensureAssignmentStatusColumn:', e.message);
    }
  }
  try {
    await pool.execute(`
      UPDATE ticket_tasks
      SET assignment_status = 'in_progress'
      WHERE status = 'in_progress' AND assignment_status = 'new'
    `);
  } catch (e) {
    console.warn('assignment_status backfill:', e.message);
  }
  assignmentStatusColumnEnsured = true;
};

let taskEtaReasonColumnEnsured = false;
const ensureTaskEtaReasonColumn = async () => {
  if (taskEtaReasonColumnEnsured) return;
  try {
    await pool.execute(
      'ALTER TABLE ticket_tasks ADD COLUMN task_eta_reason VARCHAR(500) NULL AFTER sla_due_at'
    );
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn('ticket_tasks.task_eta_reason:', e.message);
    }
  }
  taskEtaReasonColumnEnsured = true;
};

let taskRemovalColumnsEnsured = false;
/**
 * Soft-delete columns on ticket_tasks so a manager can remove an agent from a
 * group ticket without losing the audit trail. Active queries must filter
 * `is_removed = 0`; removed rows are kept for the "Previously Assigned Agents"
 * history view.
 */
const ensureTaskRemovalColumns = async () => {
  if (taskRemovalColumnsEnsured) return;
  const alters = [
    "ALTER TABLE ticket_tasks ADD COLUMN is_removed TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE ticket_tasks ADD COLUMN removed_at DATETIME NULL",
    "ALTER TABLE ticket_tasks ADD COLUMN removed_by INT NULL",
    "ALTER TABLE ticket_tasks ADD COLUMN removal_reason VARCHAR(1000) NULL"
  ];
  for (const sql of alters) {
    try {
      await pool.execute(sql);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        console.warn('ensureTaskRemovalColumns:', e.message);
      }
    }
  }
  try {
    await pool.execute(
      'CREATE INDEX idx_ticket_tasks_is_removed ON ticket_tasks (ticket_id, is_removed)'
    );
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME') {
      console.warn('ensureTaskRemovalColumns idx:', e.message);
    }
  }
  taskRemovalColumnsEnsured = true;
};

let ticketsEtaColumnsEnsured = false;
/** Minimal ensure so grouped ETA sync can UPDATE tickets.eta_* without importing tickets route. */
const ensureTicketsEtaColumnsForSync = async () => {
  if (ticketsEtaColumnsEnsured) return;
  const specs = [
    { name: 'eta_due_at', sql: 'ALTER TABLE tickets ADD COLUMN eta_due_at DATETIME NULL' },
    { name: 'eta_reason', sql: 'ALTER TABLE tickets ADD COLUMN eta_reason VARCHAR(500) NULL' },
    { name: 'eta_updated_by', sql: 'ALTER TABLE tickets ADD COLUMN eta_updated_by INT NULL' },
    { name: 'eta_updated_at', sql: 'ALTER TABLE tickets ADD COLUMN eta_updated_at DATETIME NULL' }
  ];
  for (const spec of specs) {
    try {
      await pool.execute(spec.sql);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        console.warn(`tickets.${spec.name}:`, e.message);
      }
    }
  }
  ticketsEtaColumnsEnsured = true;
};

/**
 * Recompute ticket-level ETA from MAX(open task sla_due_at) and notify customer if it changed.
 */
const syncGroupedTicketOverallEta = async (tenantId, ticketId) => {
  try {
    await ensureTicketsEtaColumnsForSync();
    const [maxRows] = await pool.execute(
      `SELECT MAX(sla_due_at) AS mx
       FROM ticket_tasks
       WHERE tenant_id = ? AND ticket_id = ? AND status <> 'completed' AND sla_due_at IS NOT NULL
         AND COALESCE(is_removed, 0) = 0`,
      [tenantId, ticketId]
    );
    const mx = maxRows[0]?.mx;
    if (!mx) return;

    const [tickets] = await pool.execute(
      `SELECT id, tenant_id, eta_due_at, eta_reason, issue_title, description, email, name, mobile, user_id, assigned_to
       FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [ticketId, tenantId]
    );
    if (!tickets.length) return;
    const ticket = tickets[0];
    const newEta = new Date(mx);
    const prev = ticket.eta_due_at ? new Date(ticket.eta_due_at) : null;
    if (prev && Number.isFinite(prev.getTime()) && Math.abs(newEta.getTime() - prev.getTime()) < 60000) {
      return;
    }

    const reasonText = 'Overall ETA = latest open task commitment (max of task ETAs).';
    await pool.execute(
      `UPDATE tickets
       SET eta_due_at = ?, eta_reason = ?, eta_updated_at = NOW(), updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [newEta, reasonText, ticketId, tenantId]
    );

    await ticketEventNotificationService.notifyEtaUpdated({
      ticket: {
        ...ticket,
        eta_due_at: newEta,
        eta_reason: reasonText
      },
      tenantId,
      previousEta: prev,
      newEta,
      reason: 'Overall ETA updated to match the latest open task ETA.',
      actorId: null,
      actorName: 'System'
    });
  } catch (e) {
    console.warn('syncGroupedTicketOverallEta:', e?.message || e);
  }
};

const MANAGER_ROLES = ['support_manager', 'manager', 'ceo', 'admin'];
const AGENT_ROLES = ['support_agent', 'agent'];

const getActorId = (user) => user?.id || user?.agentId || user?.userId || null;
const isManager = (user) => MANAGER_ROLES.includes((user?.role || '').toLowerCase());
const isAgent = (user) => AGENT_ROLES.includes((user?.role || '').toLowerCase());

const ensureTaskSchema = async () => {
  if (!taskSchemaEnsured) {
    await pool.execute(`
    CREATE TABLE IF NOT EXISTS ticket_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      ticket_id INT NOT NULL,
      task_name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      category VARCHAR(100) NULL,
      assigned_agent_id INT NULL,
      assigned_by INT NULL,
      status ENUM('pending','in_progress','completed','blocked') NOT NULL DEFAULT 'pending',
      sla_due_at DATETIME NULL,
      completed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ticket_tasks_ticket (ticket_id),
      INDEX idx_ticket_tasks_agent (assigned_agent_id),
      INDEX idx_ticket_tasks_status (status)
    )
  `);

    await pool.execute(`
    CREATE TABLE IF NOT EXISTS ticket_task_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      ticket_id INT NOT NULL,
      task_id INT NOT NULL,
      action VARCHAR(80) NOT NULL,
      performed_by INT NULL,
      details JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_task_history_task (task_id),
      INDEX idx_task_history_ticket (ticket_id)
    )
  `);

    await pool.execute(`
    CREATE TABLE IF NOT EXISTS ticket_task_notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      ticket_id INT NOT NULL,
      task_id INT NULL,
      recipient_agent_id INT NULL,
      recipient_role VARCHAR(40) NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_task_notifications_recipient (recipient_agent_id, is_read),
      INDEX idx_task_notifications_ticket (ticket_id)
    )
  `);

    taskSchemaEnsured = true;
  }
    await ensureTicketGroupColumns();
    await ensureAssignmentStatusColumn();
    await ensureTaskEtaReasonColumn();
    await ensureTaskRemovalColumns();
  };

const addHistory = async ({ tenantId, ticketId, taskId, action, actorId, details }) => {
  await pool.execute(
    `INSERT INTO ticket_task_history (tenant_id, ticket_id, task_id, action, performed_by, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, ticketId, taskId, action, actorId, JSON.stringify(details || {})]
  );
};

const insertNotification = async ({ tenantId, ticketId, taskId = null, recipientAgentId = null, recipientRole = null, title, message }) => {
  await pool.execute(
    `INSERT INTO ticket_task_notifications
      (tenant_id, ticket_id, task_id, recipient_agent_id, recipient_role, title, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, ticketId, taskId, recipientAgentId, recipientRole, title, message]
  );
};

const getManagerRecipients = async (tenantId) => {
  const [rows] = await pool.execute(
    `SELECT id, name, email, role
     FROM agents
     WHERE tenant_id = ? AND is_active = TRUE AND role IN ('support_manager','manager','ceo')`,
    [tenantId]
  );
  return rows;
};

const syncParentTicketStatus = async (tenantId, ticketId) => {
  const [taskStatsRows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_tasks,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
       SUM(CASE WHEN status <> 'completed' THEN 1 ELSE 0 END) AS open_tasks
     FROM ticket_tasks
     WHERE tenant_id = ? AND ticket_id = ? AND COALESCE(is_removed, 0) = 0`,
    [tenantId, ticketId]
  );
  const stats = taskStatsRows[0] || { total_tasks: 0, completed_tasks: 0, open_tasks: 0 };
  // Grouped tickets use per-task assignment_status + task.status; do not auto-change parent ticket.status.
  return stats;
};

/**
 * Backfill safety: if a grouped ticket is already reopened/in-progress but still has
 * all tasks marked completed from the previous cycle, reset those task rows.
 */
const reconcileRecentlyReopenedGroupedTasks = async (tenantId, ticketId) => {
  try {
    const [ticketRows] = await pool.execute(
      `SELECT id, status, is_reopened, group_title
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [ticketId, tenantId]
    );
    const ticket = ticketRows?.[0];
    if (!ticket) return;

    const status = String(ticket.status || '').toLowerCase();
    const reopened = Number(ticket.is_reopened || 0) === 1;
    const grouped = String(ticket.group_title || '').trim().length > 0;
    if (!(status === 'in_progress' && reopened && grouped)) return;

    const [statsRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total_tasks,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
         SUM(CASE WHEN status <> 'completed' THEN 1 ELSE 0 END) AS open_tasks
       FROM ticket_tasks
       WHERE tenant_id = ? AND ticket_id = ? AND COALESCE(is_removed, 0) = 0`,
      [tenantId, ticketId]
    );
    const stats = statsRows?.[0] || { total_tasks: 0, completed_tasks: 0, open_tasks: 0 };
    const total = Number(stats.total_tasks || 0);
    const completed = Number(stats.completed_tasks || 0);
    const open = Number(stats.open_tasks || 0);
    if (!(total > 0 && completed === total && open === 0)) return;

    await pool.execute(
      `UPDATE ticket_tasks
       SET status = 'pending',
           completed_at = NULL,
           assignment_status = 'new',
           updated_at = NOW()
       WHERE tenant_id = ? AND ticket_id = ? AND COALESCE(is_removed, 0) = 0`,
      [tenantId, ticketId]
    );
    console.log(`♻️ Reconciled stale reopened grouped tasks for ticket ${ticketId}`);
  } catch (error) {
    console.warn('reconcileRecentlyReopenedGroupedTasks:', error?.message);
  }
};

// Manager: create multiple tasks under one ticket.
router.post(
  '/ticket/:ticketId',
  authorizeRole(['support_manager', 'manager', 'ceo', 'admin']),
  [body('tasks').isArray({ min: 1 }).withMessage('tasks array is required')],
  async (req, res) => {
    try {
      await ensureTaskSchema();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
      }

      const tenantId = req.tenantId || 1;
      const ticketId = Number(req.params.ticketId);
      const actorId = getActorId(req.user);
      const tasks = req.body.tasks || [];
      const groupTitle = req.body.groupTitle != null ? String(req.body.groupTitle).trim() : '';
      const groupInternalNote =
        req.body.groupInternalNote != null && String(req.body.groupInternalNote).trim() !== ''
          ? String(req.body.groupInternalNote).trim()
          : null;
      const ticketEtaDueAtRaw =
        req.body.ticketEtaDueAt != null && String(req.body.ticketEtaDueAt).trim() !== ''
          ? String(req.body.ticketEtaDueAt).trim()
          : '';

      const [existingCountRows] = await pool.execute(
        `SELECT COUNT(*) AS c FROM ticket_tasks WHERE ticket_id = ? AND tenant_id = ?`,
        [ticketId, tenantId]
      );
      if (Number(existingCountRows[0]?.c || 0) > 0) {
        return res.status(400).json({
          success: false,
          message: 'This ticket already has grouped tasks. Conversion is only available once per ticket.'
        });
      }

      const [tickets] = await pool.execute(
        'SELECT id, issue_title, assigned_to, status FROM tickets WHERE id = ? AND tenant_id = ?',
        [ticketId, tenantId]
      );
      if (!tickets.length) return res.status(404).json({ success: false, message: 'Ticket not found' });

      const ticketRow = tickets[0];
      const ticketStatus = String(ticketRow.status || '').toLowerCase();

      let normalizedTasks = Array.isArray(tasks) ? [...tasks] : [];

      if (groupTitle) {
        const allowedStatuses = ['new', 'in_progress', 'escalated'];
        if (!allowedStatuses.includes(ticketStatus)) {
          return res.status(400).json({
            success: false,
            message: 'Grouped conversion is only allowed when the ticket is New, In Progress, or Escalated (and not closed).'
          });
        }
        if (!normalizedTasks.length) {
          return res.status(400).json({ success: false, message: 'Add at least one agent with assigned work.' });
        }
        for (let i = 0; i < normalizedTasks.length; i += 1) {
          const t = normalizedTasks[i];
          const agentId = t?.assigned_agent_id ? Number(t.assigned_agent_id) : 0;
          const work = String(t?.description || '').trim();
          if (!agentId || !work) {
            return res.status(400).json({
              success: false,
              message: 'Each row must include an assigned agent and assigned work.'
            });
          }
          const tn = String(t?.task_name || '').trim();
          normalizedTasks[i] = {
            ...t,
            task_name: tn || 'Assigned work',
            description: work,
            assigned_agent_id: agentId
          };
        }
        const primaryId = Number(ticketRow.assigned_to || 0);
        if (primaryId) {
          const includesPrimary = normalizedTasks.some((t) => Number(t.assigned_agent_id) === primaryId);
          if (!includesPrimary) {
            return res.status(400).json({
              success: false,
              message:
                'Add a row for the ticket’s currently assigned agent with their specific work. The ticket is split—every agent in the group needs an explicit assignment, including the primary assignee.'
            });
          }
        }
      } else {
        const initiallyAssignedAgentId = Number(ticketRow.assigned_to || 0);
        if (initiallyAssignedAgentId) {
          const alreadyIncluded = normalizedTasks.some(
            (t) => Number(t?.assigned_agent_id || 0) === initiallyAssignedAgentId
          );
          if (!alreadyIncluded) {
            normalizedTasks.push({
              task_name: 'Primary handling',
              description: 'Auto-added task for initially assigned agent',
              category: 'general',
              assigned_agent_id: initiallyAssignedAgentId
            });
          }
        }
      }

      const createdTasks = [];
      for (const rawTask of normalizedTasks) {
        const taskName = String(rawTask.task_name || '').trim();
        if (!taskName) continue;

        const assignedAgentId = rawTask.assigned_agent_id ? Number(rawTask.assigned_agent_id) : null;
        const category = rawTask.category ? String(rawTask.category).trim() : null;
        const description = rawTask.description ? String(rawTask.description).trim() : null;
        const slaDueAt = rawTask.sla_due_at ? new Date(rawTask.sla_due_at) : null;

        if (assignedAgentId) {
          const [agents] = await pool.execute(
            'SELECT id, name, email, category FROM agents WHERE id = ? AND tenant_id = ? AND is_active = TRUE',
            [assignedAgentId, tenantId]
          );
          if (!agents.length) {
            return res.status(400).json({ success: false, message: `Assigned agent ${assignedAgentId} not found` });
          }
        }

        const [inserted] = await pool.execute(
          `INSERT INTO ticket_tasks
            (tenant_id, ticket_id, task_name, description, category, assigned_agent_id, assigned_by, status, assignment_status, sla_due_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'new', ?)`,
          [tenantId, ticketId, taskName, description, category, assignedAgentId, actorId, slaDueAt]
        );

        const taskId = inserted.insertId;
        await addHistory({
          tenantId,
          ticketId,
          taskId,
          action: 'task_created',
          actorId,
          details: { task_name: taskName, category, assigned_agent_id: assignedAgentId, sla_due_at: slaDueAt }
        });

        if (assignedAgentId) {
          const [agentRows] = await pool.execute(
            'SELECT id, name, email FROM agents WHERE id = ? AND tenant_id = ?',
            [assignedAgentId, tenantId]
          );
          const agent = agentRows[0];
          await insertNotification({
            tenantId,
            ticketId,
            taskId,
            recipientAgentId: assignedAgentId,
            recipientRole: 'agent',
            title: 'New task assigned',
            message: `Task "${taskName}" was assigned to you for ticket #${ticketId}.`
          });
          if (agent?.email) {
            await emailService.sendAgentAssignmentNotification(
              agent.email,
              agent.name,
              ticketId,
              'Customer',
              `${tickets[0].issue_title || 'Ticket'} - Task: ${taskName}`
            );
          }
        }

        createdTasks.push({ id: taskId, task_name: taskName, assigned_agent_id: assignedAgentId, category });
      }

      let groupSnapshot = null;
      if (groupTitle) {
        await pool.execute(
          `UPDATE tickets SET group_title = ?, group_internal_note = ?, grouped_at = NOW() WHERE id = ? AND tenant_id = ?`,
          [groupTitle, groupInternalNote, ticketId, tenantId]
        );
        const [gRows] = await pool.execute(
          `SELECT group_title, group_internal_note, grouped_at FROM tickets WHERE id = ? AND tenant_id = ?`,
          [ticketId, tenantId]
        );
        groupSnapshot = gRows[0] || null;

        if (ticketEtaDueAtRaw) {
          const initialEta = new Date(ticketEtaDueAtRaw);
          if (Number.isFinite(initialEta.getTime())) {
            await ensureTicketsEtaColumnsForSync();
            const initialReason = 'Initial overall ETA set when creating the group.';
            await pool.execute(
              `UPDATE tickets SET eta_due_at = ?, eta_reason = ?, eta_updated_by = ?, eta_updated_at = NOW(), updated_at = NOW()
               WHERE id = ? AND tenant_id = ?`,
              [initialEta, initialReason, actorId, ticketId, tenantId]
            );
            await pool.execute(
              `UPDATE ticket_tasks SET sla_due_at = ?, updated_at = NOW() WHERE ticket_id = ? AND tenant_id = ?`,
              [initialEta, ticketId, tenantId]
            );
          }
        }
      }

      await syncParentTicketStatus(tenantId, ticketId);
      return res.status(201).json({
        success: true,
        message: 'Ticket tasks created',
        data: createdTasks,
        group: groupSnapshot
      });
    } catch (error) {
      console.error('Create ticket tasks error:', error);
      return res.status(500).json({ success: false, message: 'Failed to create ticket tasks' });
    }
  }
);

// Get ticket tasks. Agents see only assigned tasks; managers see all.
router.get('/ticket/:ticketId', async (req, res) => {
  try {
    await ensureTaskSchema();
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.ticketId);
    const actorId = getActorId(req.user);
    const manager = isManager(req.user);

    await reconcileRecentlyReopenedGroupedTasks(tenantId, ticketId);

    const params = [tenantId, ticketId];
    let query = `
      SELECT tt.*, a.name AS assigned_agent_name, a.email AS assigned_agent_email
      FROM ticket_tasks tt
      LEFT JOIN agents a ON a.id = tt.assigned_agent_id
      WHERE tt.tenant_id = ? AND tt.ticket_id = ? AND COALESCE(tt.is_removed, 0) = 0
    `;
    if (!manager) {
      query += ' AND tt.assigned_agent_id = ?';
      params.push(actorId);
    }
    query += ' ORDER BY tt.id ASC';

    const [tasks] = await pool.execute(query, params);
    const [progressRows] = await pool.execute(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM ticket_tasks WHERE tenant_id = ? AND ticket_id = ? AND COALESCE(is_removed, 0) = 0`,
      [tenantId, ticketId]
    );
    const progress = progressRows[0] || { total: 0, completed: 0 };
    const [assignedAgents] = await pool.execute(
      `SELECT DISTINCT a.id, a.name
       FROM ticket_tasks tt
       LEFT JOIN agents a ON a.id = tt.assigned_agent_id
       WHERE tt.tenant_id = ? AND tt.ticket_id = ? AND tt.assigned_agent_id IS NOT NULL
         AND COALESCE(tt.is_removed, 0) = 0
       ORDER BY a.name ASC`,
      [tenantId, ticketId]
    );

    const [derivedEtaRows] = await pool.execute(
      `SELECT MAX(sla_due_at) AS derived_overall_eta
       FROM ticket_tasks
       WHERE tenant_id = ? AND ticket_id = ? AND status <> 'completed' AND sla_due_at IS NOT NULL
         AND COALESCE(is_removed, 0) = 0`,
      [tenantId, ticketId]
    );
    const derivedOverallEta = derivedEtaRows[0]?.derived_overall_eta || null;

    let removedTasks = [];
    if (manager) {
      const [removedRows] = await pool.execute(
        `SELECT tt.id, tt.task_name, tt.description, tt.assigned_agent_id,
                tt.removed_at, tt.removed_by, tt.removal_reason,
                a.name AS assigned_agent_name,
                rb.name AS removed_by_name
         FROM ticket_tasks tt
         LEFT JOIN agents a ON a.id = tt.assigned_agent_id
         LEFT JOIN agents rb ON rb.id = tt.removed_by
         WHERE tt.tenant_id = ? AND tt.ticket_id = ? AND tt.is_removed = 1
         ORDER BY tt.removed_at DESC, tt.id DESC`,
        [tenantId, ticketId]
      );
      removedTasks = removedRows || [];
    }

    return res.json({
      success: true,
      data: {
        tasks,
        derivedOverallEta,
        assignedAgents: (assignedAgents || []).map((a) => ({
          id: Number(a.id),
          name: a.name || `Agent ${a.id}`
        })),
        progress: {
          total: Number(progress.total || 0),
          completed: Number(progress.completed || 0)
        },
        removedTasks
      }
    });
  } catch (error) {
    console.error('Get ticket tasks error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket tasks' });
  }
});

// Agent task list (assigned-only; URL agentId ignored for safety).
router.get('/agent/:agentId', async (req, res) => {
  try {
    await ensureTaskSchema();
    const tenantId = req.tenantId || 1;
    const actorId = getActorId(req.user);
    const manager = isManager(req.user);
    if (!manager && !isAgent(req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const effectiveAgentId = manager ? Number(req.params.agentId) : actorId;
    const [tasks] = await pool.execute(
      `SELECT
         tt.*,
         t.issue_title,
         t.status AS ticket_status,
         t.priority AS ticket_priority,
         t.product,
         t.module,
         (
           SELECT GROUP_CONCAT(DISTINCT a2.name ORDER BY a2.name SEPARATOR ', ')
           FROM ticket_tasks tt2
           LEFT JOIN agents a2
             ON a2.id = tt2.assigned_agent_id
            AND a2.tenant_id = tt2.tenant_id
           WHERE tt2.tenant_id = tt.tenant_id
             AND tt2.ticket_id = tt.ticket_id
             AND tt2.assigned_agent_id IS NOT NULL
             AND COALESCE(tt2.is_removed, 0) = 0
         ) AS grouped_assigned_agents
       FROM ticket_tasks tt
       JOIN tickets t ON t.id = tt.ticket_id AND t.tenant_id = tt.tenant_id
       WHERE tt.tenant_id = ? AND tt.assigned_agent_id = ?
         AND COALESCE(tt.is_removed, 0) = 0
       ORDER BY tt.status <> 'completed' DESC, tt.updated_at DESC`,
      [tenantId, effectiveAgentId]
    );
    return res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Get agent tasks error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch agent tasks' });
  }
});

// Update task (manager or assigned agent). Only manager can reassign.
router.put('/ticket/:ticketId/:taskId', async (req, res) => {
  try {
    await ensureTaskSchema();
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.ticketId);
    const taskId = Number(req.params.taskId);
    const actorId = getActorId(req.user);
    const manager = isManager(req.user);

    const [taskRows] = await pool.execute(
      'SELECT * FROM ticket_tasks WHERE id = ? AND ticket_id = ? AND tenant_id = ?',
      [taskId, ticketId, tenantId]
    );
    if (!taskRows.length) return res.status(404).json({ success: false, message: 'Task not found' });
    const task = taskRows[0];

    if (Number(task.is_removed || 0) === 1) {
      return res.status(400).json({
        success: false,
        message: 'This agent slot has been removed from the group and can no longer be updated.'
      });
    }

    if (!manager && Number(task.assigned_agent_id) !== Number(actorId)) {
      return res.status(403).json({ success: false, message: 'Only assigned agent can update this task' });
    }

    const allowedStatus = ['pending', 'in_progress', 'completed', 'blocked'];
    const updates = [];
    const values = [];
    const details = {};

    if (req.body.task_name !== undefined && manager) {
      updates.push('task_name = ?');
      values.push(String(req.body.task_name).trim());
      details.task_name = req.body.task_name;
    }
    if (req.body.description !== undefined && manager) {
      updates.push('description = ?');
      values.push(req.body.description ? String(req.body.description).trim() : null);
      details.description = req.body.description;
    }
    if (req.body.category !== undefined && manager) {
      updates.push('category = ?');
      values.push(req.body.category ? String(req.body.category).trim() : null);
      details.category = req.body.category;
    }
    // Anyone who passed the gate above as a non-manager is the assigned agent (see 403 check).
    // Do not require isAgent(role): staff rows may use roles outside AGENT_ROLES while still being assignees.
    const assignedAgentUpdatingEta =
      !manager && Number(task.assigned_agent_id) === Number(actorId);
    if (req.body.sla_due_at !== undefined) {
      if (manager) {
        updates.push('sla_due_at = ?');
        values.push(req.body.sla_due_at ? new Date(req.body.sla_due_at) : null);
        details.sla_due_at = req.body.sla_due_at;
        if (req.body.task_eta_reason !== undefined) {
          updates.push('task_eta_reason = ?');
          values.push(req.body.task_eta_reason ? String(req.body.task_eta_reason).trim() : null);
          details.task_eta_reason = req.body.task_eta_reason;
        }
      } else if (assignedAgentUpdatingEta) {
        const reasonTrim = String(req.body.task_eta_reason || '').trim();
        const newSlaDate = req.body.sla_due_at ? new Date(req.body.sla_due_at) : null;
        if (newSlaDate && (!reasonTrim || reasonTrim.length < 3)) {
          return res.status(400).json({
            success: false,
            message: 'task_eta_reason is required (min 3 characters) when setting task ETA.'
          });
        }
        updates.push('sla_due_at = ?');
        values.push(newSlaDate);
        details.sla_due_at = req.body.sla_due_at;
        updates.push('task_eta_reason = ?');
        values.push(reasonTrim || null);
        details.task_eta_reason = reasonTrim;
      }
    }
    if (req.body.status !== undefined) {
      if (!allowedStatus.includes(req.body.status)) {
        return res.status(400).json({ success: false, message: 'Invalid task status' });
      }
      updates.push('status = ?');
      values.push(req.body.status);
      details.status = req.body.status;
      if (req.body.status === 'completed') {
        updates.push('completed_at = NOW()');
      } else {
        updates.push('completed_at = NULL');
      }
    }
    if (req.body.assignment_status !== undefined) {
      const allowedAssignmentStatus = ['new', 'in_progress', 'escalated'];
      if (!allowedAssignmentStatus.includes(req.body.assignment_status)) {
        return res.status(400).json({ success: false, message: 'Invalid assignment status' });
      }
      updates.push('assignment_status = ?');
      values.push(req.body.assignment_status);
      details.assignment_status = req.body.assignment_status;
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    values.push(taskId, ticketId, tenantId);
    await pool.execute(
      `UPDATE ticket_tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ? AND ticket_id = ? AND tenant_id = ?`,
      values
    );

    await addHistory({
      tenantId,
      ticketId,
      taskId,
      action: 'task_updated',
      actorId,
      details: { before: { status: task.status, assigned_agent_id: task.assigned_agent_id }, after: details }
    });

    if (req.body.status === 'completed') {
      const managers = await getManagerRecipients(tenantId);
      for (const m of managers) {
        await insertNotification({
          tenantId,
          ticketId,
          taskId,
          recipientAgentId: m.id,
          recipientRole: 'manager',
          title: 'Task completed',
          message: `Task "${task.task_name}" on ticket #${ticketId} was completed by agent #${actorId}.`
        });
      }

      const [pendingRows] = await pool.execute(
        `SELECT id, task_name, assigned_agent_id
         FROM ticket_tasks
         WHERE tenant_id = ? AND ticket_id = ? AND status <> 'completed' AND assigned_agent_id IS NOT NULL
           AND COALESCE(is_removed, 0) = 0`,
        [tenantId, ticketId]
      );
      for (const p of pendingRows) {
        await insertNotification({
          tenantId,
          ticketId,
          taskId: p.id,
          recipientAgentId: p.assigned_agent_id,
          recipientRole: 'agent',
          title: 'Action required',
          message: `Other tasks in ticket #${ticketId} are completed. Please complete your pending task "${p.task_name}".`
        });
      }
    }

    // SLA breach checks trigger alerts for manager + assigned agent.
    const [latestRows] = await pool.execute(
      'SELECT * FROM ticket_tasks WHERE id = ? AND ticket_id = ? AND tenant_id = ?',
      [taskId, ticketId, tenantId]
    );
    const latest = latestRows[0];
    if (latest?.sla_due_at && latest.status !== 'completed' && new Date(latest.sla_due_at).getTime() < Date.now()) {
      if (latest.assigned_agent_id) {
        await insertNotification({
          tenantId,
          ticketId,
          taskId,
          recipientAgentId: latest.assigned_agent_id,
          recipientRole: 'agent',
          title: 'Task SLA breached',
          message: `Task "${latest.task_name}" for ticket #${ticketId} has crossed SLA due time.`
        });
      }
      const managers = await getManagerRecipients(tenantId);
      for (const m of managers) {
        await insertNotification({
          tenantId,
          ticketId,
          taskId,
          recipientAgentId: m.id,
          recipientRole: 'manager',
          title: 'Task SLA breached',
          message: `Task "${latest.task_name}" in ticket #${ticketId} is SLA breached.`
        });
      }
    }

    const progress = await syncParentTicketStatus(tenantId, ticketId);
    if (Number(progress.total_tasks || 0) > 0 && Number(progress.total_tasks || 0) === Number(progress.completed_tasks || 0)) {
      const managers = await getManagerRecipients(tenantId);
      for (const m of managers) {
        await insertNotification({
          tenantId,
          ticketId,
          taskId,
          recipientAgentId: m.id,
          recipientRole: 'manager',
          title: 'All tasks completed',
          message: `All tasks in ticket #${ticketId} are completed. Ticket is ready for manager closure review.`
        });
      }
      try {
        await ticketEventNotificationService.notifyGroupedTicketReadyForManagerResolution({
          ticketId,
          tenantId,
          actorName: req.user?.name || req.user?.email || null
        });
      } catch (e) {
        console.warn('notifyGroupedTicketReadyForManagerResolution failed:', e?.message);
      }
    }

    const [groupedCountRows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM ticket_tasks
       WHERE ticket_id = ? AND tenant_id = ? AND COALESCE(is_removed, 0) = 0`,
      [ticketId, tenantId]
    );
    const isGroupedTicket = Number(groupedCountRows[0]?.c || 0) > 0;
    if (isGroupedTicket) {
      if (details.sla_due_at !== undefined) {
        const oldMs = task.sla_due_at ? new Date(task.sla_due_at).getTime() : null;
        const newMs = latest.sla_due_at ? new Date(latest.sla_due_at).getTime() : null;
        if (oldMs !== newMs) {
          try {
            const [ticketsFull] = await pool.execute(
              `SELECT id, tenant_id, issue_title, description, email, name, mobile, user_id, assigned_to
               FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
              [ticketId, tenantId]
            );
            const t0 = ticketsFull[0];
            if (t0) {
              await ticketEventNotificationService.notifyManagersGroupedTaskEtaChange({
                ticket: t0,
                tenantId,
                task: latest,
                previousTaskEta: task.sla_due_at,
                newTaskEta: latest.sla_due_at,
                reason: String(req.body.task_eta_reason || details.task_eta_reason || '').trim(),
                actorName: req.user?.name || req.user?.email || 'Agent'
              });
              if (assignedAgentUpdatingEta) {
                try {
                  await ticketEventNotificationService.notifyAgentGroupedTaskEtaConfirmation({
                    ticket: t0,
                    tenantId,
                    task: latest,
                    previousTaskEta: task.sla_due_at,
                    newTaskEta: latest.sla_due_at,
                    reason: String(req.body.task_eta_reason || details.task_eta_reason || '').trim(),
                    actorName: req.user?.name || req.user?.email || 'Agent'
                  });
                } catch (e) {
                  console.warn('notifyAgentGroupedTaskEtaConfirmation:', e?.message);
                }
              }
            }
          } catch (e) {
            console.warn('notifyManagersGroupedTaskEtaChange:', e?.message);
          }
        }
      }
      try {
        await syncGroupedTicketOverallEta(tenantId, ticketId);
      } catch (e) {
        console.warn('syncGroupedTicketOverallEta:', e?.message);
      }
    }

    return res.json({ success: true, message: 'Task updated successfully' });
  } catch (error) {
    console.error('Update task error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update task' });
  }
});

// Reassign a task (manager only).
router.put('/ticket/:ticketId/:taskId/reassign', authorizeRole(['support_manager', 'manager', 'ceo', 'admin']), async (req, res) => {
  try {
    await ensureTaskSchema();
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.ticketId);
    const taskId = Number(req.params.taskId);
    const actorId = getActorId(req.user);
    const newAgentId = Number(req.body.assigned_agent_id);
    if (!newAgentId) return res.status(400).json({ success: false, message: 'assigned_agent_id is required' });

    const [agents] = await pool.execute(
      'SELECT id, name, email FROM agents WHERE id = ? AND tenant_id = ? AND is_active = TRUE',
      [newAgentId, tenantId]
    );
    if (!agents.length) return res.status(404).json({ success: false, message: 'Agent not found' });

    const [taskRows] = await pool.execute(
      'SELECT assigned_agent_id, task_name, is_removed FROM ticket_tasks WHERE id = ? AND ticket_id = ? AND tenant_id = ?',
      [taskId, ticketId, tenantId]
    );
    if (!taskRows.length) return res.status(404).json({ success: false, message: 'Task not found' });
    if (Number(taskRows[0].is_removed || 0) === 1) {
      return res.status(400).json({
        success: false,
        message: 'This agent slot has been removed from the group and cannot be reassigned.'
      });
    }
    const oldAgentId = taskRows[0].assigned_agent_id;

    await pool.execute(
      `UPDATE ticket_tasks
       SET assigned_agent_id = ?, assigned_by = ?,
           status = 'pending',
           assignment_status = 'new',
           completed_at = NULL,
           updated_at = NOW()
       WHERE id = ? AND ticket_id = ? AND tenant_id = ?`,
      [newAgentId, actorId, taskId, ticketId, tenantId]
    );

    await addHistory({
      tenantId,
      ticketId,
      taskId,
      action: 'task_reassigned',
      actorId,
      details: { from_agent_id: oldAgentId, to_agent_id: newAgentId }
    });

    if (oldAgentId) {
      await insertNotification({
        tenantId,
        ticketId,
        taskId,
        recipientAgentId: oldAgentId,
        recipientRole: 'agent',
        title: 'Task reassigned away',
        message: `Task "${taskRows[0].task_name}" from ticket #${ticketId} has been reassigned to another agent.`
      });
    }

    await insertNotification({
      tenantId,
      ticketId,
      taskId,
      recipientAgentId: newAgentId,
      recipientRole: 'agent',
      title: 'Task reassigned to you',
      message: `Task "${taskRows[0].task_name}" from ticket #${ticketId} has been reassigned to you. This is a grouped ticket task — complete it independently.`
    });

    if (agents[0].email) {
      await emailService.sendAgentAssignmentNotification(
        agents[0].email,
        agents[0].name,
        ticketId,
        'Customer',
        `Task reassigned: ${taskRows[0].task_name}`
      );
    }

    return res.json({ success: true, message: 'Task reassigned successfully' });
  } catch (error) {
    console.error('Task reassign error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reassign task' });
  }
});

/**
 * Manager-only: soft-remove an agent's slot from a group ticket.
 *
 * Guardrails (each enforced and returned as 400 with a clear message):
 *  1) Ticket must exist and not be closed.
 *  2) The slot must not already be removed.
 *  3) The slot's work status must NOT be 'completed' (completed work stays as history).
 *  4) The slot's agent must NOT be the ticket's primary assignee
 *     (manager must reassign the ticket first).
 *  5) After removal at least 2 active agents must remain in the group.
 *  6) `reason` is required (>= 5 chars) for audit + notification.
 *
 * Side effects:
 *  - Soft delete the row (is_removed = 1, removed_at, removed_by, removal_reason).
 *  - Write a `task_removed` entry into ticket_task_history.
 *  - Send in-app notification + email to the removed agent.
 *  - Recompute overall ticket ETA from remaining active tasks.
 *  - Run syncParentTicketStatus (now ignores removed) and the standard
 *    "all tasks completed → ready for manager closure" notification.
 */
router.delete(
  '/ticket/:ticketId/:taskId',
  authorizeRole(['support_manager', 'manager', 'ceo', 'admin']),
  async (req, res) => {
    try {
      await ensureTaskSchema();
      const tenantId = req.tenantId || 1;
      const ticketId = Number(req.params.ticketId);
      const taskId = Number(req.params.taskId);
      const actorId = getActorId(req.user);
      const actorName = req.user?.name || req.user?.email || `Manager #${actorId || ''}`.trim();
      const reason = String(req.body?.reason || '').trim();

      if (!reason || reason.length < 5) {
        return res.status(400).json({
          success: false,
          message: 'A reason is required (minimum 5 characters) when removing an agent from a group.'
        });
      }

      const [ticketRows] = await pool.execute(
        `SELECT id, tenant_id, issue_title, description, email, name, mobile,
                user_id, assigned_to, status, group_title
         FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [ticketId, tenantId]
      );
      if (!ticketRows.length) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      const parentTicket = ticketRows[0];
      const ticketStatus = String(parentTicket.status || '').toLowerCase();
      if (['closed', 'resolved'].includes(ticketStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot remove an agent from a ${ticketStatus} ticket.`
        });
      }

      const [taskRows] = await pool.execute(
        `SELECT tt.*, a.name AS assigned_agent_name, a.email AS assigned_agent_email
         FROM ticket_tasks tt
         LEFT JOIN agents a ON a.id = tt.assigned_agent_id
         WHERE tt.id = ? AND tt.ticket_id = ? AND tt.tenant_id = ?
         LIMIT 1`,
        [taskId, ticketId, tenantId]
      );
      if (!taskRows.length) {
        return res.status(404).json({
          success: false,
          message: 'Agent slot not found on this ticket.'
        });
      }
      const task = taskRows[0];

      if (Number(task.is_removed || 0) === 1) {
        return res.status(400).json({
          success: false,
          message: 'This agent has already been removed from the group.'
        });
      }

      const taskStatus = String(task.status || '').toLowerCase();
      if (taskStatus === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'This agent has already completed their assigned work and cannot be removed from the group.'
        });
      }

      const removedAgentId = Number(task.assigned_agent_id || 0);
      const primaryAssigneeId = Number(parentTicket.assigned_to || 0);
      if (removedAgentId && primaryAssigneeId && removedAgentId === primaryAssigneeId) {
        return res.status(400).json({
          success: false,
          message:
            "The primary assignee cannot be removed directly. Reassign the ticket's primary ownership to another agent first, then remove this slot."
        });
      }

      const [activeRows] = await pool.execute(
        `SELECT COUNT(*) AS c FROM ticket_tasks
         WHERE tenant_id = ? AND ticket_id = ? AND COALESCE(is_removed, 0) = 0`,
        [tenantId, ticketId]
      );
      const activeCount = Number(activeRows?.[0]?.c || 0);
      if (activeCount - 1 < 2) {
        return res.status(400).json({
          success: false,
          message:
            'A group ticket must contain at least two active agents. Reassign this slot to another agent or dissolve the group instead.'
        });
      }

      await pool.execute(
        `UPDATE ticket_tasks
         SET is_removed = 1,
             removed_at = NOW(),
             removed_by = ?,
             removal_reason = ?,
             updated_at = NOW()
         WHERE id = ? AND ticket_id = ? AND tenant_id = ?`,
        [actorId, reason.slice(0, 1000), taskId, ticketId, tenantId]
      );

      await addHistory({
        tenantId,
        ticketId,
        taskId,
        action: 'task_removed',
        actorId,
        details: {
          removed_agent_id: removedAgentId || null,
          removed_agent_name: task.assigned_agent_name || null,
          task_name: task.task_name || null,
          reason
        }
      });

      if (removedAgentId) {
        try {
          await insertNotification({
            tenantId,
            ticketId,
            taskId,
            recipientAgentId: removedAgentId,
            recipientRole: 'agent',
            title: 'Removed from grouped ticket',
            message:
              `${actorName} has removed you from group ticket #${ticketId}` +
              `${parentTicket.group_title ? ` (${parentTicket.group_title})` : ''}.` +
              ` Reason: ${reason}`
          });
        } catch (e) {
          console.warn('insert removal notification:', e?.message);
        }

        if (task.assigned_agent_email) {
          try {
            if (typeof emailService.sendAgentGroupRemovalNotification === 'function') {
              await emailService.sendAgentGroupRemovalNotification(
                task.assigned_agent_email,
                task.assigned_agent_name || `Agent #${removedAgentId}`,
                ticketId,
                parentTicket.issue_title || 'Support Request',
                parentTicket.group_title || null,
                actorName,
                reason
              );
            } else {
              await emailService.sendAgentReassignmentNoticeNotification(
                task.assigned_agent_email,
                task.assigned_agent_name || `Agent #${removedAgentId}`,
                ticketId,
                'Group removed',
                parentTicket.issue_title || 'Support Request'
              );
            }
          } catch (e) {
            console.warn('removal email send:', e?.message);
          }
        }
      }

      try {
        await syncGroupedTicketOverallEta(tenantId, ticketId);
      } catch (e) {
        console.warn('syncGroupedTicketOverallEta after removal:', e?.message);
      }

      const progress = await syncParentTicketStatus(tenantId, ticketId);
      if (
        Number(progress.total_tasks || 0) > 0 &&
        Number(progress.total_tasks || 0) === Number(progress.completed_tasks || 0)
      ) {
        try {
          const managers = await getManagerRecipients(tenantId);
          for (const m of managers) {
            await insertNotification({
              tenantId,
              ticketId,
              taskId: null,
              recipientAgentId: m.id,
              recipientRole: 'manager',
              title: 'All tasks completed',
              message: `All remaining tasks in ticket #${ticketId} are completed. Ticket is ready for manager closure review.`
            });
          }
          await ticketEventNotificationService.notifyGroupedTicketReadyForManagerResolution({
            ticketId,
            tenantId,
            actorName
          });
        } catch (e) {
          console.warn('post-removal closure-ready notify:', e?.message);
        }
      }

      return res.json({
        success: true,
        message: 'Agent removed from group',
        data: {
          removed_task_id: taskId,
          removed_agent_id: removedAgentId || null,
          removed_agent_name: task.assigned_agent_name || null,
          remaining_active_agents: Math.max(0, activeCount - 1)
        }
      });
    } catch (error) {
      console.error('Remove agent from group error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to remove agent from group ticket.'
      });
    }
  }
);

// Manager task history per ticket.
router.get('/ticket/:ticketId/history', authorizeRole(['support_manager', 'manager', 'ceo', 'admin']), async (req, res) => {
  try {
    await ensureTaskSchema();
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.ticketId);
    const [rows] = await pool.execute(
      `SELECT h.*, a.name AS performed_by_name
       FROM ticket_task_history h
       LEFT JOIN agents a ON a.id = h.performed_by
       WHERE h.tenant_id = ? AND h.ticket_id = ?
       ORDER BY h.created_at DESC`,
      [tenantId, ticketId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Task history error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch task history' });
  }
});

// Manager: get progress summary for multiple tickets.
router.post('/progress/bulk', authorizeRole(['support_manager', 'manager', 'ceo', 'admin']), async (req, res) => {
  try {
    await ensureTaskSchema();
    const tenantId = req.tenantId || 1;
    const ticketIds = Array.isArray(req.body.ticketIds) ? req.body.ticketIds.map(Number).filter(Boolean) : [];
    if (!ticketIds.length) return res.json({ success: true, data: {} });

    const placeholders = ticketIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT
         ticket_id,
         COUNT(*) AS total_tasks,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
       FROM ticket_tasks
       WHERE tenant_id = ? AND ticket_id IN (${placeholders})
         AND COALESCE(is_removed, 0) = 0
       GROUP BY ticket_id`,
      [tenantId, ...ticketIds]
    );

    const map = {};
    ticketIds.forEach((id) => { map[id] = { total: 0, completed: 0 }; });
    rows.forEach((r) => {
      map[r.ticket_id] = { total: Number(r.total_tasks || 0), completed: Number(r.completed_tasks || 0) };
    });
    return res.json({ success: true, data: map });
  } catch (error) {
    console.error('Bulk task progress error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch task progress' });
  }
});

module.exports = router;

