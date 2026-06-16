/**
 * Central ticket lifecycle notification + timeline orchestration.
 * Routes should call this service instead of scattering email/WhatsApp/system messages.
 */
const { pool } = require('../../shared/database/database');
const emailService = require('./emailService');
const ticketActivityService = require('./ticketActivityService');
const ticketMessagesService = require('./ticketMessagesService');
const { createFeedbackToken } = require('./feedbackTokenService');

const whatsappNotifications = require('../../shared/utils/whatsapp-notifications');

/** @typedef {'TICKET_CREATED'|'STATUS_CHANGED'|'ESCALATED'|'RESOLVED'|'CLOSED'|'REOPENED'|'REASSIGNED_INTERNAL'|'PRIORITY_CHANGED_INTERNAL'|'SLA_AUTO_ESCALATED'} TicketEventType */

const DEDUPE_TTL_MS = 120000;
const dedupeUntil = new Map();

function shouldSkipDedupe(key) {
  if (!key) return false;
  const now = Date.now();
  const exp = dedupeUntil.get(key);
  if (exp && exp > now) return true;
  dedupeUntil.set(key, now + DEDUPE_TTL_MS);
  if (dedupeUntil.size > 5000) {
    for (const [k, v] of dedupeUntil) {
      if (v < now) dedupeUntil.delete(k);
    }
  }
  return false;
}

function statusLabel(s) {
  const m = {
    new: 'New',
    in_progress: 'In progress',
    resolved: 'Resolved',
    closed: 'Closed',
    escalated: 'Escalated'
  };
  return m[s] || String(s || '').replace(/_/g, ' ');
}

function toValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatEtaForText(value) {
  const d = toValidDate(value);
  if (!d) return 'Not set';
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function shouldNotifyManagerForEtaChange(previousEta, newEta, reason) {
  const prevDate = toValidDate(previousEta);
  const nextDate = toValidDate(newEta);
  if (!nextDate) return false;
  if (!prevDate) return true;

  const deltaMinutes = Math.round((nextDate.getTime() - prevDate.getTime()) / 60000);
  if (deltaMinutes >= 30) return true;

  const reasonText = String(reason || '').toLowerCase();
  return /(escalat|block|dependency|vendor|sla|risk|critical|urgent|major)/.test(reasonText);
}

async function logLifecycle(ticketId, tenantId, eventType, details, actorId = null, actorName = null) {
  await ticketActivityService.logActivity({
    ticketId,
    tenantId: tenantId || 1,
    action: ticketActivityService.ACTIONS.TICKET_LIFECYCLE_EVENT,
    performedBy: actorId,
    performedByName: actorName,
    details: { eventType, ...details }
  });
}

async function appendTimelineMessage({
  ticketId,
  tenantId,
  text,
  customerVisible,
  channel = ticketMessagesService.CHANNELS.PLATFORM_CHAT
}) {
  try {
    await ticketMessagesService.addMessage({
      ticketId,
      tenantId: tenantId || 1,
      senderType: ticketMessagesService.SENDER_TYPES.SYSTEM,
      senderName: 'System',
      message: text,
      channel,
      senderId: null,
      isInternal: !customerVisible
    });
  } catch (e) {
    console.warn('[ticketEventNotification] timeline message failed:', e?.message);
  }
}

async function resolveCustomerContact(ticket) {
  let customerEmail = String(ticket.email || '').trim();
  let customerName = String(ticket.name || '').trim() || 'Customer';
  let emailNotifications = true;
  let welcomeUrlSent = false;

  if (!customerEmail && ticket.user_id) {
    const [userRows] = await pool.execute(
      'SELECT email, name, welcome_url_sent, email_notifications FROM users WHERE id = ? LIMIT 1',
      [ticket.user_id]
    );
    if (userRows[0]) {
      customerEmail = String(userRows[0].email || '').trim();
      if (userRows[0].name) customerName = userRows[0].name;
      welcomeUrlSent = userRows[0].welcome_url_sent === 1 || userRows[0].welcome_url_sent === true;
      emailNotifications =
        userRows[0].email_notifications === null ||
        userRows[0].email_notifications === undefined ||
        userRows[0].email_notifications === 1 ||
        userRows[0].email_notifications === true;
    }
  } else if (customerEmail) {
    const [userRows] = await pool.execute(
      'SELECT welcome_url_sent, email_notifications FROM users WHERE email = ? LIMIT 1',
      [customerEmail]
    );
    if (userRows[0]) {
      welcomeUrlSent = userRows[0].welcome_url_sent === 1 || userRows[0].welcome_url_sent === true;
      emailNotifications =
        userRows[0].email_notifications === null ||
        userRows[0].email_notifications === undefined ||
        userRows[0].email_notifications === 1 ||
        userRows[0].email_notifications === true;
    }
  }

  return { customerEmail: emailNotifications ? customerEmail : '', customerName, welcomeUrlSent };
}

async function getResolutionSummaryForTicket(ticketId, tenantId) {
  const id = Number(ticketId || 0);
  if (!id) return '';
  try {
    const [rows] = await pool.execute(
      `SELECT resolution_summary
       FROM ticket_resolution_details
       WHERE ticket_id = ? AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId || 1]
    );
    return String(rows?.[0]?.resolution_summary || '').trim();
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[ticketEventNotification] resolution summary lookup failed:', err?.message);
    }
    return '';
  }
}

async function sendClosedEmailWithFeedback(ticket, actorName) {
  const { customerEmail, customerName, welcomeUrlSent } = await resolveCustomerContact(ticket);
  if (!customerEmail) return;
  const includeTicketLink = !welcomeUrlSent;
  const token = createFeedbackToken({
    ticketId: ticket.id,
    tenantId: ticket.tenant_id || 1,
    customerEmail
  });
  const feedbackUrl = `${emailService.getAppUrl()}/feedback/${ticket.id}?token=${encodeURIComponent(token)}`;
  await emailService.sendTicketClosedNotification(
    customerEmail,
    customerName,
    ticket.id,
    ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request',
    feedbackUrl,
    emailService.getAppUrl(),
    { includeTicketLink, actorName: actorName || null }
  );
}

/**
 * Ticket created: confirmation email + optional WhatsApp + timeline + audit log.
 */
async function notifyTicketCreated({
  ticketId,
  tenantId,
  name,
  email,
  mobile,
  issueTitle,
  firstResponseMinutes,
  returnToSupportUrl,
}) {
  const tid = tenantId || 1;
  const customerEmail = String(email || '').trim();
  const customerName = String(name || '').trim();
  const title = issueTitle || 'Support Request';

  await logLifecycle(ticketId, tid, 'TICKET_CREATED', { issueTitle: title }, null, 'System');
  await appendTimelineMessage({
    ticketId,
    tenantId: tid,
    text: `Ticket #${ticketId} was created. Our team will review it shortly.`,
    customerVisible: true
  });

  if (customerEmail) {
    pool.execute('SELECT welcome_url_sent FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))', [customerEmail])
      .then(([rows]) => {
        const welcomeSent = rows[0]?.welcome_url_sent === 1 || rows[0]?.welcome_url_sent === true;
        return emailService.sendTicketConfirmation(
          customerEmail,
          customerName,
          ticketId,
          title,
          emailService.getAppUrl(),
          {
            includeLink: !welcomeSent,
            firstResponseExpectationMinutes: firstResponseMinutes,
            returnToSupportUrl
          }
        );
      })
      .catch((err) => console.warn('[ticketEventNotification] ticket confirmation email failed:', err?.message));
  }

  if (mobile) {
    Promise.resolve()
      .then(async () => {
        let includeLink = true;
        if (customerEmail) {
          const [rows] = await pool.execute(
            'SELECT welcome_url_sent FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))',
            [customerEmail]
          );
          if (rows[0]?.welcome_url_sent === 1 || rows[0]?.welcome_url_sent === true) includeLink = false;
        }
        await whatsappNotifications.sendTicketCreatedNotification(
          {
            id: ticketId,
            mobile,
            email: customerEmail,
            issue_title: title
          },
          { includeLink, firstResponseExpectationMinutes: firstResponseMinutes }
        );
      })
      .catch((err) => console.warn('[ticketEventNotification] WhatsApp ticket-created failed:', err?.message));
  }
}

/**
 * Reopen confirmation email only. In-app "update card" comes from REOPENED activity (logLifecycle), not ticket_messages.
 */
/**
 * When a grouped ticket reopens, email every agent who has a task row on that ticket.
 */
async function notifyGroupedTicketAssigneesReopened({ ticket, tenantId, previousStatus, actorName }) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = ticket?.id;
  if (!ticketId) return;

  const selectSql = `SELECT
         tt.assigned_agent_id,
         a.email,
         a.name,
         GROUP_CONCAT(
           DISTINCT COALESCE(
             NULLIF(TRIM(tt.task_name), ''),
             NULLIF(TRIM(LEFT(COALESCE(tt.description, ''), 80)), ''),
             CONCAT('Task #', tt.id)
           )
           ORDER BY tt.id SEPARATOR ', '
         ) AS task_names
       FROM ticket_tasks tt
       LEFT JOIN agents a ON a.id = tt.assigned_agent_id
       WHERE tt.ticket_id = ? AND tt.assigned_agent_id IS NOT NULL
         AND COALESCE(tt.is_removed, 0) = 0`;

  let rows = [];
  try {
    const [tenantRows] = await pool.execute(
      `${selectSql} AND tt.tenant_id = ?
       GROUP BY tt.assigned_agent_id, a.email, a.name`,
      [ticketId, tid]
    );
    rows = tenantRows || [];
    if (!rows.length) {
      const [fallbackRows] = await pool.execute(
        `${selectSql}
         GROUP BY tt.assigned_agent_id, a.email, a.name`,
        [ticketId]
      );
      rows = fallbackRows || [];
      if (rows.length) {
        console.warn(`[ticketEventNotification] grouped reopen assignee fallback used for ticket ${ticketId}`);
      }
    }
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return;
    console.warn('[ticketEventNotification] grouped reopen agent lookup failed:', e?.message);
    return;
  }

  if (!rows?.length) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  const prev = previousStatus || 'closed';
  const reopenedBy = actorName || null;

  for (const row of rows) {
    const email = String(row.email || '').trim();
    if (!email) continue;
    const taskSummary = String(row.task_names || '').trim();
    try {
      await emailService.sendAgentGroupedTicketReopenedNotification(
        email,
        row.name || 'Agent',
        ticketId,
        title,
        taskSummary,
        emailService.getAppUrl(),
        { reopenedBy, previousStatus: prev }
      );
    } catch (err) {
      console.warn('[ticketEventNotification] grouped reopen agent email failed:', err?.message);
    }
  }
}

async function deliverCustomerReopenFanout({ ticket, tenantId, actorName }) {
  const id = ticket.id;
  try {
    const { customerEmail, customerName, welcomeUrlSent } = await resolveCustomerContact(ticket);
    if (customerEmail) {
      const issueTypeDisplay = [ticket.issue_type, ticket.issue_type_other]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' — ');
      await emailService.sendTicketReopenedNotification(
        customerEmail,
        customerName,
        {
          id,
          issue_title: ticket.issue_title,
          description: ticket.description,
          product: ticket.product,
          module: ticket.module,
          issue_type: issueTypeDisplay,
          priority: ticket.priority
        },
        actorName || null,
        emailService.getAppUrl(),
        { includeLink: !welcomeUrlSent }
      );
    }
  } catch (err) {
    console.warn('[ticketEventNotification] reopen email failed:', err?.message);
  }
}

async function getManagerRecipientsForTicket({ ticket, tenantId, ticketId }) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const resolvedTicketId = Number(ticketId || ticket?.id || 0);
  const assignedTo = Number(ticket?.assigned_to || 0);
  const recipients = new Map();
  const addRows = (rows) => {
    for (const r of rows || []) {
      const id = Number(r?.id || 0);
      const email = String(r?.email || '').trim();
      if (!id || !email) continue;
      recipients.set(id, { id, name: r.name || 'Manager', email });
    }
  };

  if (assignedTo) {
    try {
      const [rows] = await pool.execute(
        `SELECT m.id, m.name, m.email
         FROM agents a
         JOIN agents m ON m.id = a.manager_id
         WHERE a.id = ? AND (a.tenant_id = ? OR a.tenant_id IS NULL)
           AND (m.tenant_id = ? OR m.tenant_id IS NULL)
         LIMIT 1`,
        [assignedTo, tid, tid]
      );
      addRows(rows);
      if (!rows?.length) {
        const [fallbackRows] = await pool.execute(
          `SELECT m.id, m.name, m.email
           FROM agents a
           JOIN agents m ON m.id = a.manager_id
           WHERE a.id = ?
           LIMIT 1`,
          [assignedTo]
        );
        addRows(fallbackRows);
      }
    } catch (e) {
      console.warn('[ticketEventNotification] manager lookup by assigned_to failed:', e?.message);
    }
  }

  if (resolvedTicketId) {
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT m.id, m.name, m.email
         FROM ticket_tasks tt
         JOIN agents a ON a.id = tt.assigned_agent_id
         JOIN agents m ON m.id = a.manager_id
         WHERE tt.ticket_id = ?
           AND (tt.tenant_id = ? OR tt.tenant_id IS NULL)
           AND (a.tenant_id = ? OR a.tenant_id IS NULL)
           AND (m.tenant_id = ? OR m.tenant_id IS NULL)
           AND COALESCE(tt.is_removed, 0) = 0`,
        [resolvedTicketId, tid, tid, tid]
      );
      addRows(rows);
      if (!rows?.length) {
        const [fallbackRows] = await pool.execute(
          `SELECT DISTINCT m.id, m.name, m.email
           FROM ticket_tasks tt
           JOIN agents a ON a.id = tt.assigned_agent_id
           JOIN agents m ON m.id = a.manager_id
           WHERE tt.ticket_id = ?
             AND COALESCE(tt.is_removed, 0) = 0`,
          [resolvedTicketId]
        );
        addRows(fallbackRows);
      }
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('[ticketEventNotification] manager lookup by grouped tasks failed:', e?.message);
      }
    }
  }

  if (recipients.size === 0) {
    try {
      const [fallbackRows] = await pool.execute(
        `SELECT id, name, email
         FROM agents
         WHERE tenant_id = ?
           AND COALESCE(is_active, TRUE) = TRUE
           AND role IN ('support_manager','manager','ceo','admin')`,
        [tid]
      );
      addRows(fallbackRows);
    } catch (e) {
      console.warn('[ticketEventNotification] manager fallback lookup failed:', e?.message);
    }
  }

  // Legacy/deployment fallback: some setups still keep managers in users table.
  if (recipients.size === 0) {
    try {
      const [userRows] = await pool.execute(
        `SELECT id, name, email
         FROM users
         WHERE tenant_id = ?
           AND COALESCE(is_active, TRUE) = TRUE
           AND role IN ('support_manager','manager','ceo','admin')`,
        [tid]
      );
      addRows(userRows);
    } catch (e) {
      console.warn('[ticketEventNotification] users-manager fallback lookup failed:', e?.message);
    }
  }
  return Array.from(recipients.values());
}

async function getCeoRecipients(tenantId) {
  const tid = tenantId || 1;
  const recipients = new Map();
  const addRows = (rows) => {
    for (const r of rows || []) {
      const id = Number(r?.id || 0);
      const email = String(r?.email || '').trim();
      if (!id || !email) continue;
      recipients.set(id, { id, name: r.name || 'CEO', email });
    }
  };
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email
       FROM agents
       WHERE tenant_id = ?
         AND COALESCE(is_active, TRUE) = TRUE
         AND role = 'ceo'`,
      [tid]
    );
    addRows(rows);
  } catch (e) {
    console.warn('[ticketEventNotification] ceo lookup in agents failed:', e?.message);
  }
  if (recipients.size === 0) {
    try {
      const [rows] = await pool.execute(
        `SELECT id, name, email
         FROM users
         WHERE tenant_id = ?
           AND COALESCE(is_active, TRUE) = TRUE
           AND role = 'ceo'`,
        [tid]
      );
      addRows(rows);
    } catch (e) {
      console.warn('[ticketEventNotification] ceo lookup in users failed:', e?.message);
    }
  }
  return Array.from(recipients.values());
}

async function notifyCeoCriticalEscalation({ ticket, tenantId, reason = null, actorName = null }) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || 0);
  if (!ticketId) return;
  let priority = String(ticket?.priority || ticket?.priority_level || '').trim().toLowerCase();
  if (!priority) {
    try {
      const [rows] = await pool.execute(
        `SELECT priority
         FROM tickets
         WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
         LIMIT 1`,
        [ticketId, tid]
      );
      priority = String(rows?.[0]?.priority || '').trim().toLowerCase();
    } catch (e) {
      console.warn('[ticketEventNotification] ceo critical escalation priority lookup failed:', e?.message);
    }
  }

  const normalizedPriority = ({
    p1: 'urgent',
    critical: 'urgent',
    sev1: 'urgent',
    sev_1: 'urgent',
    p2: 'high'
  }[priority] || priority);
  if (!['urgent', 'high'].includes(normalizedPriority)) {
    console.log(`[ticketEventNotification] CEO escalation skipped for ticket ${ticketId} (priority=${priority || 'unknown'})`);
    return;
  }

  const recipients = await getCeoRecipients(tid);
  if (!recipients.length) {
    console.warn(`[ticketEventNotification] no CEO recipients for escalated ticket ${ticketId}`);
    return;
  }
  const dedupeKey = `${ticketId}:ceo:critical-escalation`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  for (const ceo of recipients) {
    try {
      await emailService.sendCeoCriticalTicketEscalatedNotification(
        ceo.email,
        ceo.name,
        ticketId,
        title,
        emailService.getAppUrl(),
        {
          priority: normalizedPriority,
          reason: reason || null,
          escalatedBy: actorName || null
        }
      );
    } catch (e) {
      console.warn('[ticketEventNotification] ceo critical escalation email failed:', e?.message);
    }
  }
}

async function notifyManagersTicketEscalated({ ticket, tenantId, reason = null, actorName = null }) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || 0);
  if (!ticketId) return;

  const managers = await getManagerRecipientsForTicket({ ticket, tenantId: tid, ticketId });
  if (!managers.length) {
    console.warn(`[ticketEventNotification] no manager recipients for escalated ticket ${ticketId}`);
    return;
  }
  console.log(`[ticketEventNotification] escalated ticket ${ticketId}: manager recipients=${managers.map((m) => m.email).join(', ')}`);
  const dedupeKey = `${ticketId}:manager:escalated`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  for (const m of managers) {
    try {
      await emailService.sendManagerTicketEscalatedNotification(
        m.email,
        m.name,
        ticketId,
        title,
        emailService.getAppUrl(),
        { escalatedBy: actorName || null, reason: reason || null }
      );
    } catch (e) {
      console.warn('[ticketEventNotification] manager escalation email failed:', e?.message);
    }
  }
}

/**
 * Customer escalation: notify assigned agent + managers, log lifecycle + timeline.
 */
async function notifyCustomerEscalated({
  ticket,
  tenantId,
  reason = null,
  comment = null,
  actorName = null
}) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || 0);
  if (!ticketId) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  const reasonText = String(reason || '').trim();
  const commentText = String(comment || '').trim();
  const who = actorName || 'Customer';

  await logLifecycle(ticketId, tid, 'ESCALATED', { reason: reasonText || null, comment: commentText || null }, null, who);
  await appendTimelineMessage({
    ticketId,
    tenantId: tid,
    text: `Ticket #${ticketId} was escalated by the customer.${reasonText ? ` Reason: ${reasonText}.` : ''}`,
    customerVisible: true
  });

  // Inform previously assigned agent (email) when available
  try {
    const agentId = ticket.assigned_to || ticket.current_owner_id || null;
    if (agentId) {
      const [rows] = await pool.execute(
        `SELECT email, name
         FROM agents
         WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
         LIMIT 1`,
        [agentId, tid]
      );
      const agent = rows?.[0];
      if (agent?.email) {
        await emailService.sendAgentTicketEscalatedNotification(
          agent.email,
          agent.name || 'Agent',
          ticketId,
          title,
          emailService.getAppUrl(),
          {
            customerName: ticket.name || 'Customer',
            escalatedBy: who,
            reason: reasonText ? `Escalated to manager by customer. ${reasonText}` : 'Escalated to manager by customer.'
          }
        );
      }
    }
  } catch (e) {
    console.warn('[ticketEventNotification] assigned agent escalation email failed:', e?.message);
  }

  // Managers only (customer escalation is a manager handoff)
  await notifyManagersTicketEscalated({ ticket, tenantId: tid, reason: reasonText || null, actorName: who });

  try {
    const appNotificationService = require('./appNotificationService');
    await appNotificationService.notifyCustomerEscalationInApp(pool, { tenantId: tid, ticket });
  } catch (e) {
    console.warn('[ticketEventNotification] customer escalation in-app failed:', e?.message);
  }
}

async function notifyManagersTicketReopenedByCustomer({ ticket, tenantId, actorName = null }) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || 0);
  if (!ticketId) return;

  const managers = await getManagerRecipientsForTicket({ ticket, tenantId: tid, ticketId });
  if (!managers.length) {
    console.warn(`[ticketEventNotification] no manager recipients for reopened ticket ${ticketId}`);
    return;
  }
  const dedupeKey = `${ticketId}:manager:reopened`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  for (const m of managers) {
    try {
      await emailService.sendManagerTicketReopenedNotification(
        m.email,
        m.name,
        ticketId,
        title,
        emailService.getAppUrl(),
        { reopenedBy: actorName || 'Customer' }
      );
    } catch (e) {
      console.warn('[ticketEventNotification] manager reopen email failed:', e?.message);
    }
  }
}

/**
 * Grouped ticket: agent (or manager) changed a single task ETA — email managers only.
 */
async function notifyManagersGroupedTaskEtaChange({
  ticket,
  tenantId,
  task,
  previousTaskEta = null,
  newTaskEta = null,
  reason = '',
  actorName = null
}) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || task?.ticket_id || 0);
  const taskId = Number(task?.id || 0);
  if (!ticketId || !taskId) return;

  const managers = await getManagerRecipientsForTicket({ ticket, tenantId: tid, ticketId });
  if (!managers.length) {
    console.warn(`[ticketEventNotification] no manager recipients for grouped task ETA on ticket ${ticketId}`);
    return;
  }
  const dedupeKey = `${ticketId}:task:${taskId}:eta:${String(previousTaskEta || '')}:${String(newTaskEta || '')}:${String(reason || '').slice(0, 80)}`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  const taskLabel = String(task?.task_name || task?.description || 'Task').trim().slice(0, 200);
  const agentName = actorName || 'Agent';
  const reasonText = String(reason || '').trim();

  const appNotificationService = require('./appNotificationService');
  for (const m of managers) {
    try {
      await emailService.sendManagerGroupedTaskEtaNotification(
        m.email,
        m.name,
        ticketId,
        title,
        emailService.getAppUrl(),
        {
          taskLabel,
          agentName,
          oldTaskEta: previousTaskEta,
          newTaskEta,
          reason: reasonText
        }
      );
    } catch (e) {
      console.warn('[ticketEventNotification] grouped task ETA manager email failed:', e?.message);
    }
    try {
      const mid = Number(m.id || 0);
      if (mid) {
        await appNotificationService.notifyManagerStaffInApp(pool, {
          tenantId: tid,
          managerStaffId: mid,
          ticketId,
          title: 'Grouped task ETA changed',
          description: `Ticket #${ticketId} — ${taskLabel}: ETA updated${reasonText ? ` — ${reasonText}` : ''}`,
          dedupeKey: `gteta:${tid}:${ticketId}:${taskId}:m:${mid}:${String(newTaskEta || '').slice(0, 40)}`
        });
      }
    } catch (inAppErr) {
      console.warn('[ticketEventNotification] grouped task ETA manager in-app failed:', inAppErr?.message);
    }
  }
}

/**
 * Grouped ticket: assigned agent changed their task ETA — email that agent (confirmation copy).
 */
async function notifyAgentGroupedTaskEtaConfirmation({
  ticket,
  tenantId,
  task,
  previousTaskEta = null,
  newTaskEta = null,
  reason = '',
  actorName = null
}) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || task?.ticket_id || 0);
  const taskId = Number(task?.id || 0);
  const agentId = Number(task?.assigned_agent_id || 0);
  if (!ticketId || !taskId || !agentId) return;

  const [agentRows] = await pool.execute(
    'SELECT id, name, email FROM agents WHERE id = ? AND tenant_id = ? AND is_active = TRUE LIMIT 1',
    [agentId, tid]
  );
  const agentRow = agentRows[0];
  const email = String(agentRow?.email || '').trim();
  if (!email) {
    console.warn(`[ticketEventNotification] no agent email for id ${agentId} — skipping grouped task ETA confirmation`);
    return;
  }

  const dedupeKey = `${ticketId}:task:${taskId}:agent_eta_confirm:${agentId}:${String(newTaskEta || '')}:${String(reason || '').slice(0, 80)}`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  const taskLabel = String(task?.task_name || task?.description || 'Task').trim().slice(0, 200);
  const reasonText = String(reason || '').trim();
  const displayName = String(actorName || agentRow?.name || 'Agent').trim();

  try {
    await emailService.sendAgentGroupedTaskEtaConfirmation(
      email,
      displayName,
      ticketId,
      title,
      emailService.getAppUrl(),
      {
        taskLabel,
        oldTaskEta: previousTaskEta,
        newTaskEta,
        reason: reasonText
      }
    );
  } catch (e) {
    console.warn('[ticketEventNotification] grouped task ETA agent confirmation email failed:', e?.message);
  }

  try {
    const appNotificationService = require('./appNotificationService');
    await appNotificationService.notifyAgentStaffInApp(pool, {
      tenantId: tid,
      agentStaffId: agentId,
      ticketId,
      title: 'Task ETA updated',
      description: `Ticket #${ticketId} — ${taskLabel}: ETA updated${reasonText ? ` — ${reasonText}` : ''}`,
      dedupeKey: `gta:${tid}:${ticketId}:${taskId}:a:${agentId}:${String(newTaskEta || '').slice(0, 40)}`
    });
  } catch (inAppErr) {
    console.warn('[ticketEventNotification] grouped task ETA agent in-app failed:', inAppErr?.message);
  }
}

async function notifyGroupedTicketReadyForManagerResolution({ ticketId, tenantId, actorName = null }) {
  const tid = tenantId || 1;
  const id = Number(ticketId || 0);
  if (!id) return;

  let ticket = null;
  try {
    const [rows] = await pool.execute(
      `SELECT id, tenant_id, issue_title, description, assigned_to
       FROM tickets
       WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
       LIMIT 1`,
      [id, tid]
    );
    ticket = rows?.[0] || null;
  } catch (e) {
    console.warn('[ticketEventNotification] grouped-complete ticket lookup failed:', e?.message);
  }
  if (!ticket) return;

  const managers = await getManagerRecipientsForTicket({ ticket, tenantId: tid, ticketId: id });
  if (!managers.length) {
    console.warn(`[ticketEventNotification] no manager recipients for grouped-complete ticket ${id}`);
    return;
  }
  const dedupeKey = `${id}:manager:grouped-complete`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  const appNotificationService = require('./appNotificationService');
  for (const m of managers) {
    try {
      await emailService.sendManagerGroupedTicketReadyForResolutionNotification(
        m.email,
        m.name,
        id,
        title,
        emailService.getAppUrl(),
        { completedBy: actorName || null }
      );
    } catch (e) {
      console.warn('[ticketEventNotification] manager grouped-complete email failed:', e?.message);
    }
    try {
      const mid = Number(m.id || 0);
      if (mid) {
        await appNotificationService.notifyManagerStaffInApp(pool, {
          tenantId: tid,
          managerStaffId: mid,
          ticketId: id,
          title: 'Grouped ticket ready for resolution',
          description: `Ticket #${id} — ${title}${actorName ? ` (${actorName})` : ''}`,
          dedupeKey: `gtr:${tid}:${id}:m:${mid}`
        });
      }
    } catch (inAppErr) {
      console.warn('[ticketEventNotification] manager grouped-complete in-app failed:', inAppErr?.message);
    }
  }
}

async function notifyEtaUpdated({
  ticket,
  tenantId,
  previousEta = null,
  newEta,
  reason = '',
  actorId = null,
  actorName = null
}) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || 0);
  if (!ticketId) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  const oldEtaLabel = formatEtaForText(previousEta);
  const newEtaLabel = formatEtaForText(newEta);
  const reasonText = String(reason || '').trim();
  const updatedBy = actorName || 'Support Team';

  try {
    await logLifecycle(
      ticketId,
      tid,
      'ETA_UPDATED',
      {
        old_eta_due_at: previousEta || null,
        new_eta_due_at: newEta || null,
        old_eta_label: oldEtaLabel,
        new_eta_label: newEtaLabel,
        reason: reasonText
      },
      actorId,
      actorName
    );
  } catch (err) {
    console.warn('[ticketEventNotification] ETA lifecycle log failed:', err?.message);
  }

  // Ensure ETA updates are visible in Support Chat as an info card.
  await appendTimelineMessage({
    ticketId,
    tenantId: tid,
    text: 'ETA has been updated. Please check.',
    customerVisible: true
  });

  try {
    const { customerEmail, customerName, welcomeUrlSent } = await resolveCustomerContact(ticket);
    if (customerEmail) {
      await emailService.sendCustomerEtaUpdatedNotification(
        customerEmail,
        customerName || 'Customer',
        ticketId,
        title,
        emailService.getAppUrl(),
        {
          oldEta: previousEta,
          newEta,
          reason: reasonText,
          updatedBy,
          includeLink: !welcomeUrlSent
        }
      );
      try {
        const appNotificationService = require('./appNotificationService');
        const uid = Number(ticket.user_id || 0);
        if (uid) {
          await appNotificationService.notifyUserTicketInApp(pool, {
            tenantId: tid,
            userId: uid,
            ticketId,
            title: 'ETA updated',
            description: `Ticket #${ticketId}: commitment updated${reasonText ? ` — ${reasonText}` : ''}`,
            dedupeKey: `etausr:${tid}:${ticketId}:${String(newEta || '').slice(0, 60)}`
          });
        }
      } catch (inAppErr) {
        console.warn('[ticketEventNotification] ETA customer in-app failed:', inAppErr?.message);
      }
    }
  } catch (err) {
    console.warn('[ticketEventNotification] ETA customer email failed:', err?.message);
  }

  try {
    if (ticket?.mobile) {
      await whatsappNotifications.sendTicketEtaUpdatedNotification(
        {
          id: ticketId,
          mobile: ticket.mobile,
          email: ticket.email || '',
          name: ticket.name || '',
          issue_title: title
        },
        {
          oldEta: previousEta,
          newEta,
          reason: reasonText,
          updatedBy
        }
      );
    }
  } catch (err) {
    console.warn('[ticketEventNotification] ETA customer WhatsApp failed:', err?.message);
  }

  const shouldNotifyManager = shouldNotifyManagerForEtaChange(previousEta, newEta, reasonText);
  if (!shouldNotifyManager) return;

  const managers = await getManagerRecipientsForTicket({ ticket, tenantId: tid, ticketId });
  if (!managers.length) {
    console.warn(`[ticketEventNotification] no manager recipients for ETA update on ticket ${ticketId}`);
    return;
  }

  const dedupeKey = `${ticketId}:manager:eta:${String(previousEta || '')}:${String(newEta || '')}:${reasonText}`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const appNotificationService = require('./appNotificationService');
  for (const manager of managers) {
    try {
      await emailService.sendManagerTicketEtaUpdatedNotification(
        manager.email,
        manager.name,
        ticketId,
        title,
        emailService.getAppUrl(),
        {
          oldEta: previousEta,
          newEta,
          reason: reasonText,
          updatedBy
        }
      );
    } catch (err) {
      console.warn('[ticketEventNotification] ETA manager email failed:', err?.message);
    }
    try {
      const mid = Number(manager.id || 0);
      if (mid) {
        await appNotificationService.notifyManagerStaffInApp(pool, {
          tenantId: tid,
          managerStaffId: mid,
          ticketId,
          title: 'Ticket ETA updated (team)',
          description: `Ticket #${ticketId} — ${title}${reasonText ? ` — ${reasonText}` : ''}`,
          dedupeKey: `eta:${tid}:${ticketId}:m:${mid}:${String(newEta || '').slice(0, 40)}`
        });
      }
    } catch (inAppErr) {
      console.warn('[ticketEventNotification] ETA manager in-app failed:', inAppErr?.message);
    }
  }
}

/**
 * Email the assigned agent when their ticket becomes escalated (manual status or SLA job).
 */
async function sendEscalationEmailToAssignedAgent(ticket, tenantId, { escalatedByName, reason }) {
  const tid = tenantId || ticket.tenant_id || 1;
  const ticketId = ticket.id;
  if (!ticketId) return;

  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request';
  const customerLabel = String(ticket.name || '').trim() || 'Customer';

  let agentEmail = ticket.agent_email;
  let agentName = ticket.agent_name;

  if ((!agentEmail || !String(agentEmail).trim()) && ticket.assigned_to) {
    try {
      const [rows] = await pool.execute(
        'SELECT id, name, email FROM agents WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1',
        [ticket.assigned_to, tid]
      );
      if (rows[0]?.email) {
        agentEmail = rows[0].email;
        agentName = rows[0].name || agentName;
      }
    } catch (e) {
      console.warn('[ticketEventNotification] agent lookup for escalation email failed:', e?.message);
    }
  }

  if (!agentEmail || !String(agentEmail).trim()) return;

  try {
    await emailService.sendAgentTicketEscalatedNotification(
      String(agentEmail).trim(),
      agentName || 'Agent',
      ticketId,
      title,
      emailService.getAppUrl(),
      {
        customerName: customerLabel,
        escalatedBy: escalatedByName || null,
        reason: reason || null
      }
    );
  } catch (e) {
    console.warn('[ticketEventNotification] agent escalation email failed:', e?.message);
  }
}

/** Persist + WS in-app bell (audience mirrors email routing in appNotificationService). */
async function syncInAppTicketStatus({ tenantId, ticketId, previousStatus, newStatus, ticket, audience }) {
  try {
    const appNotificationService = require('./appNotificationService');
    await appNotificationService.notifyStatusChanged(pool, {
      tenantId: tenantId || 1,
      ticketId: Number(ticketId),
      prevStatus: previousStatus,
      nextStatus: newStatus,
      assignedTo: ticket?.assigned_to ?? ticket?.current_owner_id ?? null,
      userId: ticket?.user_id ?? null,
      issueTitle: ticket?.issue_title || (ticket?.description ? String(ticket.description).substring(0, 100) : '') || '',
      audience,
      ticketSnapshot: ticket || null
    });
  } catch (e) {
    console.warn('[ticketEventNotification] in-app status sync failed:', e?.message);
  }
}

/**
 * Status change from PUT /api/tickets/:id/status
 */
async function notifyStatusChanged({
  ticket,
  tenantId,
  previousStatus,
  newStatus,
  actorId,
  actorName
}) {
  const id = ticket.id;
  const tid = tenantId || ticket.tenant_id || 1;
  const dedupeKey = `${id}:status:${previousStatus}->${newStatus}`;
  if (shouldSkipDedupe(dedupeKey)) {
    console.log('[ticketEventNotification] deduped status change', dedupeKey);
    return;
  }

  if (previousStatus === newStatus) return;
  const resolutionSummary =
    ['resolved', 'closed'].includes(newStatus)
      ? (String(ticket?.resolution_summary || '').trim() || await getResolutionSummaryForTicket(id, tid))
      : '';

  // Grouped ticket: assigned agents get email when ticket becomes in progress again from closed/resolved.
  if (newStatus === 'in_progress' && ['closed', 'resolved'].includes(previousStatus)) {
    await notifyGroupedTicketAssigneesReopened({
      ticket,
      tenantId,
      previousStatus,
      actorName: actorName || null
    });
  }

  // Reopen from closed: never use generic "Your Ticket Status Was Updated" (closed → new / in_progress).
  const reopenFromClosed = previousStatus === 'closed' && ['new', 'in_progress'].includes(newStatus);
  if (reopenFromClosed) {
    await logLifecycle(id, tid, 'REOPENED', { from: 'closed', to: 'in_progress' }, actorId, actorName || null);
    await appendTimelineMessage({
      ticketId: id,
      tenantId: tid,
      text: 'Your ticket has been reopened and is now in progress.',
      customerVisible: true
    });
    const t = { ...ticket, id, mobile: ticket.mobile, email: ticket.email, name: ticket.name, issue_title: ticket.issue_title };
    if (ticket.mobile) {
      try {
        await whatsappNotifications.sendStatusUpdateNotification({ ...t, status: 'in_progress' }, 'in_progress');
      } catch (err) {
        console.warn('[ticketEventNotification] reopen WhatsApp failed:', err?.message);
      }
    }
    await deliverCustomerReopenFanout({ ticket, tenantId, actorName });
    const { STATUS_AUDIENCE: SA } = require('./appNotificationService');
    await syncInAppTicketStatus({
      tenantId: tid,
      ticketId: id,
      previousStatus,
      newStatus,
      ticket,
      audience: SA.STAFF_REOPEN
    });
    return;
  }

  await logLifecycle(id, tid, 'STATUS_CHANGED', { from: previousStatus, to: newStatus }, actorId, actorName);

  // Status transitions must also be visible inside Support Chat as an info card.
  await appendTimelineMessage({
    ticketId: id,
    tenantId: tid,
    text: `Status updated to ${statusLabel(newStatus)}`,
    customerVisible: true
  });

  const t = { ...ticket, id, mobile: ticket.mobile, email: ticket.email, name: ticket.name, issue_title: ticket.issue_title };

  if (ticket.mobile) {
    try {
      if (newStatus === 'escalated') {
        await whatsappNotifications.sendEscalationNotification(t);
      } else if (newStatus === 'resolved' || newStatus === 'closed') {
        await whatsappNotifications.sendResolutionNotification(t, resolutionSummary);
      } else {
        await whatsappNotifications.sendStatusUpdateNotification(t, newStatus);
      }
      if (newStatus === 'closed') {
        try {
          const { startSatisfactionRating } = require('../routes/communication/whatsapp');
          await startSatisfactionRating(ticket.mobile, id);
        } catch (e) {
          console.warn('[ticketEventNotification] satisfaction rating WhatsApp failed:', e?.message);
        }
      }
    } catch (err) {
      console.warn('[ticketEventNotification] WhatsApp status failed:', err?.message);
    }
  }

  if (newStatus === 'escalated' && previousStatus !== 'escalated') {
    try {
      await sendEscalationEmailToAssignedAgent(ticket, tid, {
        escalatedByName: actorName || null,
        reason: null
      });
    } catch (err) {
      console.warn('[ticketEventNotification] assigned agent escalation email failed:', err?.message);
    }
    try {
      await notifyManagersTicketEscalated({
        ticket,
        tenantId: tid,
        reason: null,
        actorName: actorName || null
      });
    } catch (err) {
      console.warn('[ticketEventNotification] manager escalation email failed:', err?.message);
    }
    try {
      await notifyCeoCriticalEscalation({
        ticket,
        tenantId: tid,
        reason: null,
        actorName: actorName || null
      });
    } catch (err) {
      console.warn('[ticketEventNotification] ceo critical escalation email failed:', err?.message);
    }
  }

  if (newStatus === 'resolved' && previousStatus !== 'resolved') {
    try {
      const { customerEmail, customerName, welcomeUrlSent } = await resolveCustomerContact(ticket);
      if (customerEmail) {
        await emailService.sendTicketResolvedNotification(
          customerEmail,
          customerName,
          id,
          ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request',
          actorName || null,
          emailService.getAppUrl(),
          { includeLink: !welcomeUrlSent, resolutionSummary }
        );
      }
    } catch (err) {
      console.warn('[ticketEventNotification] resolved email failed:', err?.message);
    }
  }

  if (!['resolved', 'closed'].includes(newStatus)) {
    try {
      const { customerEmail, customerName, welcomeUrlSent } = await resolveCustomerContact(ticket);
      if (customerEmail) {
        await emailService.sendTicketStatusUpdateNotification(
          customerEmail,
          customerName,
          id,
          ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request',
          previousStatus,
          newStatus,
          actorName || null,
          emailService.getAppUrl(),
          { includeLink: !welcomeUrlSent }
        );
      }
    } catch (err) {
      console.warn('[ticketEventNotification] status update email failed:', err?.message);
    }
  }

  if (newStatus === 'closed' && previousStatus !== 'closed') {
    try {
      await sendClosedEmailWithFeedback({ ...ticket, tenant_id: tid, status: 'closed' }, actorName);
    } catch (err) {
      console.warn('[ticketEventNotification] closed email failed:', err?.message);
    }
  }

  const { STATUS_AUDIENCE: SA } = require('./appNotificationService');
  let statusAudience = SA.CUSTOMER_ONLY;
  if (newStatus === 'resolved' && previousStatus !== 'resolved') statusAudience = SA.CUSTOMER_RESOLVED;
  else if (newStatus === 'closed' && previousStatus !== 'closed') statusAudience = SA.CUSTOMER_CLOSED;
  else if (newStatus === 'escalated' && previousStatus !== 'escalated') statusAudience = SA.ESCALATION;

  await syncInAppTicketStatus({
    tenantId: tid,
    ticketId: id,
    previousStatus,
    newStatus,
    ticket,
    audience: statusAudience
  });
}

/**
 * Customer reopened a closed ticket: confirmation email + audit + customer-visible timeline.
 */
async function notifyTicketReopenedByCustomer({ ticket, tenantId, actorId, actorName }) {
  if (!ticket?.id) return;
  const id = ticket.id;
  const tid = tenantId || ticket.tenant_id || 1;
  const dedupeKey = `${id}:reopen`;
  if (shouldSkipDedupe(dedupeKey)) return;

  await logLifecycle(id, tid, 'REOPENED', { from: 'closed', to: 'in_progress' }, actorId, actorName || null);
  const t = { ...ticket, id, mobile: ticket.mobile, email: ticket.email, name: ticket.name, issue_title: ticket.issue_title };
  if (ticket.mobile) {
    try {
      await whatsappNotifications.sendStatusUpdateNotification({ ...t, status: 'in_progress' }, 'in_progress');
    } catch (err) {
      console.warn('[ticketEventNotification] reopen WhatsApp failed:', err?.message);
    }
  }
  await deliverCustomerReopenFanout({ ticket, tenantId, actorName });
  await notifyGroupedTicketAssigneesReopened({
    ticket,
    tenantId,
    previousStatus: 'closed',
    actorName: actorName || null
  });
  await notifyManagersTicketReopenedByCustomer({
    ticket,
    tenantId: tid,
    actorName: actorName || 'Customer'
  });

  const { STATUS_AUDIENCE: SA2 } = require('./appNotificationService');
  await syncInAppTicketStatus({
    tenantId: tid,
    ticketId: id,
    previousStatus: 'closed',
    newStatus: 'in_progress',
    ticket,
    audience: SA2.CUSTOMER_REOPEN
  });
}

/**
 * Customer rejected resolution on a resolved ticket: notify assigned agent (single-assignee).
 * Grouped ticket notifications are handled separately.
 */
async function notifyAssignedAgentCustomerRejectedResolution({
  ticket,
  tenantId,
  actorName = null,
  reason = null
}) {
  const tid = tenantId || ticket?.tenant_id || 1;
  const ticketId = Number(ticket?.id || 0);
  if (!ticketId) return;
  const assignedTo = Number(ticket?.assigned_to || 0);
  if (!assignedTo) return;

  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email FROM agents WHERE id = ? AND tenant_id = ? LIMIT 1',
      [assignedTo, tid]
    );
    const agent = rows?.[0];
    if (agent?.email) {
      await emailService.sendAssignedAgentCustomerRejectionReopenNotification(
        agent.email,
        agent.name || 'Agent',
        ticketId,
        ticket.issue_title || ticket.description?.substring(0, 100) || 'Support Request',
        ticket.name || 'Customer',
        emailService.getAppUrl(),
        { reopenedBy: actorName || 'Customer', reason: reason || null }
      );
    }
  } catch (e) {
    console.warn('[ticketEventNotification] assigned agent rejection reopen email failed:', e?.message);
  }
  try {
    const appNotificationService = require('./appNotificationService');
    await appNotificationService.notifyAgentStaffInApp(pool, {
      tenantId: tid,
      agentStaffId: assignedTo,
      ticketId,
      title: 'Customer rejected resolution',
      description: `Ticket #${ticketId} — ${ticket.issue_title || 'Support request'}${reason ? ` — ${String(reason).slice(0, 120)}` : ''}`,
      dedupeKey: `rej:${tid}:${ticketId}:a:${assignedTo}`
    });
  } catch (inAppErr) {
    console.warn('[ticketEventNotification] rejection in-app failed:', inAppErr?.message);
  }
}

/**
 * Manager reassignment: internal timeline + agent email (customer not spammed).
 */
async function notifyReassignedInternal({
  ticketId,
  tenantId,
  fromAgentId,
  toAgentId,
  toAgentName,
  customerName,
  customerEmail,
  customerMobile,
  customerUserId,
  issueTitle,
  managerId,
  managerName,
  agentEmail,
  agentDisplayName
}) {
  const tid = tenantId || 1;
  const dedupeKey = `${ticketId}:reassign:${fromAgentId || 'none'}->${toAgentId || 'none'}`;
  if (shouldSkipDedupe(dedupeKey)) return;

  await logLifecycle(ticketId, tid, 'REASSIGNED_INTERNAL', { from_agent_id: fromAgentId, to_agent_id: toAgentId, to_agent_name: toAgentName }, managerId, managerName);
  await appendTimelineMessage({
    ticketId,
    tenantId: tid,
    text: `Internal: Ticket reassigned to ${toAgentName || 'agent'}.`,
    customerVisible: false
  });

  if (agentEmail) {
    try {
      await emailService.sendAgentAssignmentNotification(
        agentEmail,
        agentDisplayName || toAgentName,
        ticketId,
        customerName || 'Customer',
        issueTitle || 'Support Request'
      );
    } catch (e) {
      console.warn('[ticketEventNotification] agent assignment email failed:', e?.message);
    }
    try {
      const toId = Number(toAgentId || 0);
      if (toId) {
        const appNotificationService = require('./appNotificationService');
        await appNotificationService.notifyTicketAssigned(pool, {
          tenantId: tid,
          ticketId,
          assigneeAgentId: toId,
          issueTitle: issueTitle || 'Support Request'
        });
      }
    } catch (inAppErr) {
      console.warn('[ticketEventNotification] reassignment new-agent in-app failed:', inAppErr?.message);
    }
  }

  // Notify previous assignee that ticket moved away
  if (fromAgentId && Number(fromAgentId) !== Number(toAgentId)) {
    try {
      let previousAssignee = null;

      // Preferred source: agents table
      const [fromAgents] = await pool.execute(
        'SELECT id, name, email FROM agents WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1',
        [fromAgentId, tid]
      );
      if (fromAgents[0]?.email) {
        previousAssignee = fromAgents[0];
      } else {
        // Legacy fallback: some older records may reference users(id)
        const [fromUsers] = await pool.execute(
          'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
          [fromAgentId]
        );
        if (fromUsers[0]?.email) previousAssignee = fromUsers[0];
      }

      if (previousAssignee?.email) {
        await emailService.sendAgentReassignmentNoticeNotification(
          previousAssignee.email,
          previousAssignee.name,
          ticketId,
          toAgentName || agentDisplayName || 'another agent',
          issueTitle || 'Support Request',
          emailService.getAppUrl()
        );
      } else {
        console.warn('[ticketEventNotification] previous assignee email not found for reassignment', {
          ticketId,
          fromAgentId,
          toAgentId
        });
      }
      try {
        const fromId = Number(fromAgentId || 0);
        if (fromId && fromId !== Number(toAgentId || 0)) {
          const appNotificationService = require('./appNotificationService');
          await appNotificationService.notifyAgentStaffInApp(pool, {
            tenantId: tid,
            agentStaffId: fromId,
            ticketId,
            title: 'Ticket reassigned away from you',
            description: `Ticket #${ticketId} — now handled by ${toAgentName || agentDisplayName || 'another agent'}`,
            dedupeKey: `reas:${tid}:${ticketId}:from:${fromId}:to:${Number(toAgentId) || 0}`
          });
        }
      } catch (inAppErr) {
        console.warn('[ticketEventNotification] previous-agent in-app failed:', inAppErr?.message);
      }
    } catch (e) {
      console.warn('[ticketEventNotification] previous-agent reassignment email failed:', e?.message);
    }
  }

  // Customer-facing reassignment notification
  try {
    const customerTicket = {
      id: ticketId,
      tenant_id: tid,
      user_id: customerUserId || null,
      email: customerEmail || '',
      name: customerName || 'Customer',
      mobile: customerMobile || '',
      issue_title: issueTitle || 'Support Request'
    };
    const contact = await resolveCustomerContact(customerTicket);
    if (contact.customerEmail) {
      await emailService.sendTicketStatusUpdateNotification(
        contact.customerEmail,
        contact.customerName,
        ticketId,
        issueTitle || 'Support Request',
        'assigned',
        `reassigned to ${toAgentName || 'support agent'}`,
        managerName || null,
        emailService.getAppUrl(),
        { includeLink: !contact.welcomeUrlSent }
      );
      try {
        const uid = Number(customerUserId || 0);
        if (uid) {
          const appNotificationService = require('./appNotificationService');
          await appNotificationService.notifyUserTicketInApp(pool, {
            tenantId: tid,
            userId: uid,
            ticketId,
            title: 'Ticket reassigned',
            description: `Ticket #${ticketId} is now assigned to ${toAgentName || 'support agent'}`,
            dedupeKey: `reasu:${tid}:${ticketId}:u:${uid}:${Number(toAgentId) || 0}`
          });
        }
      } catch (inAppErr) {
        console.warn('[ticketEventNotification] reassignment customer in-app failed:', inAppErr?.message);
      }
    }
    if (customerTicket.mobile) {
      await whatsappNotifications.sendAssignmentNotification(
        { id: ticketId, issue_title: issueTitle || 'Support Request', mobile: customerTicket.mobile },
        toAgentName || 'support agent'
      );
    }
  } catch (e) {
    console.warn('[ticketEventNotification] customer reassignment notification failed:', e?.message);
  }
}

/**
 * Internal combine alert: notify parent and affected child agents.
 */
async function notifyTicketsCombinedInternal({
  tenantId,
  parentTicketId,
  childTicketIds = [],
  parentOwnerId = null,
  previousChildOwnerMap = {},
  actorName = null
}) {
  const tid = tenantId || 1;
  const parentId = Number(parentTicketId);
  if (!parentId) return;

  const normalizedChildren = Array.isArray(childTicketIds)
    ? childTicketIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  if (!normalizedChildren.length) return;

  const perAgentChildMap = new Map();
  for (const childId of normalizedChildren) {
    const rawOwner = previousChildOwnerMap?.[childId] ?? previousChildOwnerMap?.[String(childId)];
    const ownerId = Number(rawOwner || 0) || null;
    if (!ownerId) continue;
    const bucket = perAgentChildMap.get(ownerId) || [];
    bucket.push(childId);
    perAgentChildMap.set(ownerId, bucket);
  }

  const notifyIds = new Set();
  const normalizedParentOwner = Number(parentOwnerId || 0) || null;
  if (normalizedParentOwner) notifyIds.add(normalizedParentOwner);
  for (const agentId of perAgentChildMap.keys()) notifyIds.add(agentId);
  if (!notifyIds.size) return;

  const placeholders = Array.from(notifyIds).map(() => '?').join(', ');
  const [agents] = await pool.execute(
    `SELECT id, name, email
     FROM agents
     WHERE id IN (${placeholders}) AND (tenant_id = ? OR tenant_id IS NULL)`,
    [...Array.from(notifyIds), tid]
  );

  for (const agent of agents || []) {
    if (!agent?.email) continue;
    const affectedChildIds = perAgentChildMap.get(Number(agent.id)) || [];
    const perspective = normalizedParentOwner && Number(agent.id) === normalizedParentOwner
      ? 'parent_owner'
      : 'child_owner';
    try {
      await emailService.sendAgentTicketsCombinedNotification(
        agent.email,
        agent.name || 'Agent',
        parentId,
        normalizedChildren,
        emailService.getAppUrl(),
        {
          actorName: actorName || 'Manager',
          perspective,
          affectedChildIds
        }
      );
    } catch (e) {
      console.warn('[ticketEventNotification] combined-ticket email failed:', e?.message);
    }
  }

  try {
    const appNotificationService = require('./appNotificationService');
    await appNotificationService.notifyAgentsTicketsCombinedInApp(pool, {
      tenantId: tid,
      agentIds: Array.from(notifyIds),
      parentTicketId: parentId,
      childTicketIds: normalizedChildren,
      actorName: actorName || null
    });
  } catch (inAppErr) {
    console.warn('[ticketEventNotification] combined-ticket in-app failed:', inAppErr?.message);
  }
}

/**
 * Manager priority override: internal timeline + assigned agent email.
 */
async function notifyPriorityOverrideInternal({
  ticketId,
  tenantId,
  issueTitle,
  oldPriority,
  newPriority,
  overrideReason,
  performedBy,
  performedByName,
  assignedAgentId
}) {
  const tid = tenantId || 1;
  if (oldPriority === newPriority) return;
  const dedupeKey = `${ticketId}:priority:${oldPriority}->${newPriority}`;
  if (shouldSkipDedupe(dedupeKey)) return;

  await logLifecycle(ticketId, tid, 'PRIORITY_CHANGED_INTERNAL', { oldPriority, newPriority, overrideReason: overrideReason || null }, performedBy, performedByName);
  await appendTimelineMessage({
    ticketId,
    tenantId: tid,
    text: `Internal: Priority changed from ${oldPriority} to ${newPriority}.${overrideReason ? ` Reason: ${overrideReason}` : ''}`,
    customerVisible: false
  });

  if (!assignedAgentId) return;
  try {
    const [agents] = await pool.execute('SELECT id, name, email FROM agents WHERE id = ?', [assignedAgentId]);
    const agent = agents[0];
    if (agent?.email) {
      await emailService.sendAgentPriorityChangeNotification(
        agent.email,
        agent.name,
        ticketId,
        issueTitle || 'Support Request',
        oldPriority,
        newPriority
      );
    }
  } catch (e) {
    console.warn('[ticketEventNotification] priority agent email failed:', e?.message);
  }
  try {
    const appNotificationService = require('./appNotificationService');
    await appNotificationService.notifyAgentPriorityOverrideInApp(pool, {
      tenantId: tid,
      ticketId,
      agentId: assignedAgentId,
      issueTitle: issueTitle || 'Support Request',
      oldPriority,
      newPriority
    });
  } catch (inAppErr) {
    console.warn('[ticketEventNotification] priority in-app failed:', inAppErr?.message);
  }
}

/**
 * SLA auto-escalation (scheduled job): customer WhatsApp + timeline + audit.
 */
async function notifySlaAutoEscalated({ ticket, tenantId, reason, previousStatus }) {
  const id = ticket.id;
  const tid = tenantId || ticket.tenant_id || 1;
  const dedupeKey = `${id}:sla_escalate`;
  if (shouldSkipDedupe(dedupeKey)) return;

  await logLifecycle(id, tid, 'SLA_AUTO_ESCALATED', { reason: reason || 'SLA breach' }, null, 'System');
  await appendTimelineMessage({
    ticketId: id,
    tenantId: tid,
    text: `Your ticket was escalated for priority handling.${reason ? ` (${reason})` : ''}`,
    customerVisible: true
  });

  if (ticket.mobile) {
    try {
      await whatsappNotifications.sendEscalationNotification(ticket, reason || '');
    } catch (err) {
      console.warn('[ticketEventNotification] SLA escalation WhatsApp failed:', err?.message);
    }
  }

  try {
    await sendEscalationEmailToAssignedAgent(
      { ...ticket, id, status: 'escalated' },
      tid,
      { escalatedByName: null, reason: reason || 'SLA breach — ticket auto-escalated' }
    );
  } catch (err) {
    console.warn('[ticketEventNotification] SLA agent escalation email failed:', err?.message);
  }
  try {
    await notifyManagersTicketEscalated({
      ticket: { ...ticket, id, status: 'escalated' },
      tenantId: tid,
      reason: reason || 'SLA breach — ticket auto-escalated',
      actorName: 'System'
    });
  } catch (err) {
    console.warn('[ticketEventNotification] SLA manager escalation email failed:', err?.message);
  }
  try {
    await notifyCeoCriticalEscalation({
      ticket: { ...ticket, id, status: 'escalated' },
      tenantId: tid,
      reason: reason || 'SLA breach — ticket auto-escalated',
      actorName: 'System'
    });
  } catch (err) {
    console.warn('[ticketEventNotification] SLA ceo critical escalation email failed:', err?.message);
  }

  try {
    const { STATUS_AUDIENCE: SA } = require('./appNotificationService');
    const prev = previousStatus || ticket?.status_before_escalation || 'in_progress';
    await syncInAppTicketStatus({
      tenantId: tid,
      ticketId: id,
      previousStatus: prev,
      newStatus: 'escalated',
      ticket: { ...ticket, id, status: 'escalated' },
      audience: SA.ESCALATION
    });
  } catch (inAppErr) {
    console.warn('[ticketEventNotification] SLA auto-escalation in-app failed:', inAppErr?.message);
  }
}

/**
 * Agent reply to customer: centralized email + WhatsApp fanout.
 * Keeps channel side-effects out of route handlers.
 */
async function notifyAgentReplyToCustomer({
  ticketId,
  tenantId,
  issueTitle,
  customerEmail,
  customerName,
  mobile,
  senderName,
  messageText
}) {
  const tid = tenantId || 1;
  const dedupeKey = `${ticketId}:agent_reply:${String(messageText || '').trim()}`;
  if (shouldSkipDedupe(dedupeKey)) return;

  const safeIssueTitle = issueTitle || 'Support Request';
  const safeCustomerName = customerName || 'Customer';
  const safeSender = senderName || 'Support';
  const safeMessage = String(messageText || '').trim();

  if (customerEmail) {
    try {
      let includeLink = true;
      try {
        const [userRows] = await pool.execute(
          'SELECT welcome_url_sent FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1',
          [customerEmail]
        );
        if (userRows[0]?.welcome_url_sent === 1 || userRows[0]?.welcome_url_sent === true) includeLink = false;
      } catch (_) {}

      const emailResult = await emailService.sendAgentReplyNotification(
        customerEmail,
        safeCustomerName,
        ticketId,
        safeIssueTitle,
        safeSender,
        safeMessage,
        undefined,
        { includeLink }
      );
      if (!emailResult?.success) {
        console.warn('[ticketEventNotification] agent reply email failed:', emailResult?.error || 'unknown');
      }
    } catch (err) {
      console.warn('[ticketEventNotification] agent reply email error:', err?.message);
    }
  }

  if (mobile) {
    try {
      await whatsappNotifications.sendAgentReplyNotification(
        {
          id: ticketId,
          issue_title: safeIssueTitle,
          mobile,
          email: customerEmail || ''
        },
        safeSender,
        safeMessage,
        { includeLink: true }
      );
    } catch (err) {
      console.warn('[ticketEventNotification] agent reply WhatsApp error:', err?.message);
    }
  }

  try {
    await logLifecycle(ticketId, tid, 'AGENT_REPLY_TO_CUSTOMER', { sender: safeSender }, null, safeSender);
  } catch (err) {
    console.warn('[ticketEventNotification] agent reply lifecycle log failed:', err?.message);
  }
}

module.exports = {
  notifyTicketCreated,
  notifyStatusChanged,
  notifyTicketReopenedByCustomer,
  notifyCustomerEscalated,
  notifyAssignedAgentCustomerRejectedResolution,
  notifyGroupedTicketReadyForManagerResolution,
  notifyManagersGroupedTaskEtaChange,
  notifyAgentGroupedTaskEtaConfirmation,
  notifyEtaUpdated,
  notifyReassignedInternal,
  notifyTicketsCombinedInternal,
  notifyPriorityOverrideInternal,
  notifySlaAutoEscalated,
  notifyAgentReplyToCustomer,
  EVENT_TYPES: {
    TICKET_CREATED: 'TICKET_CREATED',
    STATUS_CHANGED: 'STATUS_CHANGED',
    REOPENED: 'REOPENED',
    REASSIGNED_INTERNAL: 'REASSIGNED_INTERNAL',
    PRIORITY_CHANGED_INTERNAL: 'PRIORITY_CHANGED_INTERNAL',
    SLA_AUTO_ESCALATED: 'SLA_AUTO_ESCALATED',
    AGENT_REPLY_TO_CUSTOMER: 'AGENT_REPLY_TO_CUSTOMER',
    ETA_UPDATED: 'ETA_UPDATED'
  }
};
