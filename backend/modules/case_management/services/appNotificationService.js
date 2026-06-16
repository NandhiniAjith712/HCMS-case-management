/**
 * Persisted in-app notifications + WebSocket fan-out.
 * CEO/admin: API returns all rows in tenant; WS receives all events (includeCeoAdmins).
 */
const crypto = require('crypto');
const wsInstanceStore = require('./websocket-instance');

const RECIPIENT = {
  CEO: 'CEO',
  MANAGER: 'MANAGER',
  AGENT: 'AGENT',
  USER: 'USER'
};

const TYPE = {
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_ASSIGNED: 'TICKET_ASSIGNED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  SLA_ALERT: 'SLA_ALERT',
  MANAGER_ALERT: 'MANAGER_ALERT'
};

/** Mirrors ticketEventNotificationService email fan-out for status transitions. */
const STATUS_AUDIENCE = {
  CUSTOMER_ONLY: 'customer_only',
  CUSTOMER_RESOLVED: 'customer_resolved',
  CUSTOMER_CLOSED: 'customer_closed',
  STAFF_REOPEN: 'staff_reopen',
  CUSTOMER_REOPEN: 'customer_reopen',
  ESCALATION: 'escalation'
};

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `n_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function mapRowToApi(row) {
  return {
    id: row.id,
    userId:
      row.recipient_staff_id != null
        ? String(row.recipient_staff_id)
        : String(row.recipient_user_id != null ? row.recipient_user_id : ''),
    role: row.recipient_role,
    title: row.title,
    description: row.description || '',
    type: row.type,
    ticketId: row.ticket_id != null ? String(row.ticket_id) : '',
    isRead: Boolean(row.is_read),
    createdAt: row.created_at
  };
}

function getWsServer() {
  const s = wsInstanceStore.get();
  return s && typeof s.broadcastAppNotification === 'function' ? s : null;
}

function broadcastDelivery(
  tenantId,
  apiPayload,
  { staffRecipientIds = [], userRecipientIds = [], includeCeoAdmins = false } = {}
) {
  const ws = getWsServer();
  if (!ws) return;
  ws.broadcastAppNotification(tenantId, apiPayload, {
    staffRecipientIds: [...new Set(staffRecipientIds.map(Number).filter(Boolean))],
    userRecipientIds: [...new Set(userRecipientIds.map(Number).filter(Boolean))],
    includeCeoAdmins
  });
}

/**
 * @returns {import('mysql2/promise').Pool} row or null if deduped skip
 */
async function insertNotification(pool, params) {
  const {
    tenantId,
    recipientRole,
    recipientStaffId,
    recipientUserId,
    title,
    description,
    type,
    ticketId,
    dedupeKey
  } = params;

  const id = newId();
  const staff = recipientStaffId == null ? null : Number(recipientStaffId);
  const user = recipientUserId == null ? null : Number(recipientUserId);
  const tid = ticketId == null ? null : Number(ticketId);

  if (dedupeKey) {
    const [r] = await pool.execute(
      `INSERT IGNORE INTO app_notifications (
        id, tenant_id, recipient_role, recipient_staff_id, recipient_user_id,
        title, description, type, ticket_id, dedupe_key
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        tenantId,
        recipientRole,
        staff,
        user,
        title,
        description || '',
        type,
        tid,
        String(dedupeKey).slice(0, 190)
      ]
    );
    if (!r.affectedRows) return null;
  } else {
    await pool.execute(
      `INSERT INTO app_notifications (
        id, tenant_id, recipient_role, recipient_staff_id, recipient_user_id,
        title, description, type, ticket_id, dedupe_key
      ) VALUES (?,?,?,?,?,?,?,?,?,NULL)`,
      [
        id,
        tenantId,
        recipientRole,
        staff,
        user,
        title,
        description || '',
        type,
        tid
      ]
    );
  }

  const [rows] = await pool.execute('SELECT * FROM app_notifications WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function insertAndFanOut(pool, def) {
  try {
    const row = await insertNotification(pool, def);
    if (!row) return null;
    const api = mapRowToApi(row);
    const staffIds = [];
    const userIds = [];
    if (row.recipient_staff_id != null) staffIds.push(Number(row.recipient_staff_id));
    if (row.recipient_user_id != null) userIds.push(Number(row.recipient_user_id));
    const includeCeo = def.includeCeoAdmins !== false;
    broadcastDelivery(row.tenant_id, api, {
      staffRecipientIds: staffIds,
      userRecipientIds: userIds,
      includeCeoAdmins: includeCeo
    });
    return row;
  } catch (e) {
    console.warn('⚠️ appNotification insert/fan-out failed:', e?.message || e);
    return null;
  }
}

async function getManagerIdsForAgent(pool, agentId) {
  if (!agentId) return [];
  const [rows] = await pool.execute('SELECT manager_id FROM agents WHERE id = ? LIMIT 1', [agentId]);
  const m = rows[0]?.manager_id;
  return m ? [Number(m)] : [];
}

/**
 * Resolve assignee(s) for in-app routing: tickets.assigned_to / current_owner_id,
 * then DISTINCT ticket_tasks.assigned_agent_id, then latest escalation to_agent_id.
 */
async function resolveTicketNotificationContext(pool, { tenantId, ticketId, assignedTo, userId, issueTitle }) {
  const tid = Number(tenantId) || 1;
  const tidNum = Number(ticketId);
  const agentIds = new Set();
  let uid = userId != null && userId !== '' ? Number(userId) : null;
  let title = issueTitle != null ? String(issueTitle) : '';

  if (assignedTo != null && assignedTo !== '') {
    const a = Number(assignedTo);
    if (Number.isFinite(a) && a > 0) agentIds.add(a);
  }

  if (!Number.isFinite(tidNum) || tidNum <= 0) {
    return { agentIds: [...agentIds], userId: Number.isFinite(uid) && uid > 0 ? uid : null, issueTitle: title };
  }

  try {
    const [rows] = await pool.execute(
      `SELECT assigned_to, current_owner_id, user_id, issue_title
       FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [tidNum, tid]
    );
    const t = rows?.[0];
    if (t) {
      const at = Number(t.assigned_to);
      if (Number.isFinite(at) && at > 0) agentIds.add(at);
      const co = Number(t.current_owner_id);
      if (Number.isFinite(co) && co > 0) agentIds.add(co);
      if (!(Number.isFinite(uid) && uid > 0) && t.user_id != null) {
        const u = Number(t.user_id);
        if (Number.isFinite(u) && u > 0) uid = u;
      }
      if (!title && t.issue_title) title = String(t.issue_title);
    }
  } catch (_) {
    /* tickets row optional */
  }

  try {
    const [taskRows] = await pool.execute(
      `SELECT DISTINCT assigned_agent_id AS aid
       FROM ticket_tasks
       WHERE ticket_id = ? AND assigned_agent_id IS NOT NULL
         AND (tenant_id = ? OR tenant_id IS NULL)
         AND COALESCE(is_removed, 0) = 0`,
      [tidNum, tid]
    );
    for (const r of taskRows || []) {
      const id = Number(r.aid);
      if (Number.isFinite(id) && id > 0) agentIds.add(id);
    }
  } catch (_) {
    /* ticket_tasks may be absent */
  }

  if (!agentIds.size) {
    try {
      const [eh] = await pool.execute(
        `SELECT to_agent_id FROM ticket_escalation_history
         WHERE tenant_id = ? AND ticket_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [tid, tidNum]
      );
      const esc = Number(eh?.[0]?.to_agent_id);
      if (Number.isFinite(esc) && esc > 0) agentIds.add(esc);
    } catch (_) {
      /* history table optional */
    }
  }

  return {
    agentIds: [...agentIds],
    userId: Number.isFinite(uid) && uid > 0 ? uid : null,
    issueTitle: title
  };
}

/** Agents who get grouped-ticket reopen emails: assignee + task owners (no escalation-history fallback). */
async function resolveReopenStaffAgentIds(pool, tenantId, ticketId) {
  const tid = Number(tenantId) || 1;
  const tidNum = Number(ticketId);
  const ids = new Set();
  if (!Number.isFinite(tidNum) || tidNum <= 0) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT assigned_to, current_owner_id FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [tidNum, tid]
    );
    const t = rows?.[0];
    if (t) {
      for (const col of ['assigned_to', 'current_owner_id']) {
        const v = Number(t[col]);
        if (Number.isFinite(v) && v > 0) ids.add(v);
      }
    }
  } catch (_) {}
  try {
    const [taskRows] = await pool.execute(
      `SELECT DISTINCT assigned_agent_id AS aid
       FROM ticket_tasks
       WHERE ticket_id = ? AND assigned_agent_id IS NOT NULL
         AND (tenant_id = ? OR tenant_id IS NULL)
         AND COALESCE(is_removed, 0) = 0`,
      [tidNum, tid]
    );
    for (const r of taskRows || []) {
      const id = Number(r.aid);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
  } catch (_) {}
  return [...ids];
}

async function getUnionManagerIdsForAgents(pool, agentIds) {
  const mgr = new Set();
  for (const aid of agentIds || []) {
    const a = Number(aid);
    if (!Number.isFinite(a) || a <= 0) continue;
    for (const m of await getManagerIdsForAgent(pool, a)) mgr.add(m);
  }
  return [...mgr];
}

async function fetchPrimaryAssigneeId(pool, tenantId, ticketId) {
  const tid = Number(tenantId) || 1;
  const tidNum = Number(ticketId);
  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(NULLIF(assigned_to, 0), NULLIF(current_owner_id, 0)) AS aid
       FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [tidNum, tid]
    );
    const v = Number(rows?.[0]?.aid);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch (_) {
    return null;
  }
}

function normalizePriorityForCeoCritical(priority) {
  const p = String(priority || '')
    .trim()
    .toLowerCase();
  const normalized = (
    {
      p1: 'urgent',
      critical: 'urgent',
      sev1: 'urgent',
      sev_1: 'urgent',
      p2: 'high'
    }[p] || p
  );
  return { normalized, isCritical: ['urgent', 'high'].includes(normalized) };
}

async function fetchTicketPriority(pool, tenantId, ticketId, ticketSnapshot) {
  let pr = String(ticketSnapshot?.priority || ticketSnapshot?.priority_level || '').trim();
  if (pr) return pr;
  try {
    const [rows] = await pool.execute(
      `SELECT priority FROM tickets WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1`,
      [Number(ticketId), Number(tenantId) || 1]
    );
    return String(rows?.[0]?.priority || '').trim();
  } catch (_) {
    return '';
  }
}

async function insertCeoCriticalEscalationRows(pool, { tenantId, ticketId, description, issueTitle }) {
  const tid = Number(tenantId) || 1;
  const tNum = Number(ticketId);
  const recipients = new Map();
  const add = (rows) => {
    for (const r of rows || []) {
      const id = Number(r?.id || 0);
      if (!id) continue;
      recipients.set(id, r);
    }
  };
  try {
    const [ar] = await pool.execute(
      `SELECT id, name, email FROM agents
       WHERE tenant_id = ? AND COALESCE(is_active, TRUE) = TRUE AND role = 'ceo'`,
      [tid]
    );
    add(ar);
  } catch (_) {}
  if (!recipients.size) {
    try {
      const [ur] = await pool.execute(
        `SELECT id, name, email FROM users
         WHERE tenant_id = ? AND COALESCE(is_active, TRUE) = TRUE AND role = 'ceo'`,
        [tid]
      );
      add(ur);
    } catch (_) {}
  }
  for (const ceo of recipients.values()) {
    const sid = Number(ceo.id);
    if (!Number.isFinite(sid) || sid <= 0) continue;
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.CEO,
      recipientStaffId: sid,
      recipientUserId: null,
      title: 'Critical ticket escalated',
      description: description || `Ticket #${tNum} — ${issueTitle || 'Support request'}`,
      type: TYPE.STATUS_CHANGED,
      ticketId: tNum,
      dedupeKey: `esc:${tid}:${tNum}:ceo:${sid}`,
      includeCeoAdmins: true
    });
  }
}

/**
 * New ticket: notify creator (USER), assignee (AGENT), their managers (MANAGER).
 */
async function notifyTicketCreated(pool, { tenantId, ticketId, userId, assignedTo, issueTitle }) {
  const title = 'New ticket created';
  const desc = `${issueTitle || 'Support request'} — Ticket #${ticketId}`;
  const t = TYPE.TICKET_CREATED;

  if (userId) {
    await insertAndFanOut(pool, {
      tenantId,
      recipientRole: RECIPIENT.USER,
      recipientStaffId: null,
      recipientUserId: userId,
      title,
      description: `Your ticket #${ticketId} was submitted successfully.`,
      type: t,
      ticketId,
      dedupeKey: `tc:${tenantId}:${ticketId}:u:${userId}`
    });
  }

  if (assignedTo) {
    await insertAndFanOut(pool, {
      tenantId,
      recipientRole: RECIPIENT.AGENT,
      recipientStaffId: assignedTo,
      recipientUserId: null,
      title: 'New ticket assigned',
      description: desc,
      type: TYPE.TICKET_ASSIGNED,
      ticketId,
      dedupeKey: `tc:${tenantId}:${ticketId}:a:${assignedTo}`
    });
    const mgrs = await getManagerIdsForAgent(pool, assignedTo);
    for (const mid of mgrs) {
      await insertAndFanOut(pool, {
        tenantId,
        recipientRole: RECIPIENT.MANAGER,
        recipientStaffId: mid,
        recipientUserId: null,
        title: 'New ticket for your team',
        description: `Ticket #${ticketId} assigned to your team — ${issueTitle || 'Support request'}`,
        type: t,
        ticketId,
        dedupeKey: `tc:${tenantId}:${ticketId}:m:${mid}`
      });
    }
  }
}

async function notifyTicketAssigned(pool, { tenantId, ticketId, assigneeAgentId, issueTitle }) {
  if (!assigneeAgentId) return;
  const desc = `${issueTitle || 'Support request'} — Ticket #${ticketId}`;
  await insertAndFanOut(pool, {
    tenantId,
    recipientRole: RECIPIENT.AGENT,
    recipientStaffId: assigneeAgentId,
    recipientUserId: null,
    title: 'Ticket assigned to you',
    description: desc,
    type: TYPE.TICKET_ASSIGNED,
    ticketId,
    dedupeKey: `ta:${tenantId}:${ticketId}:a:${assigneeAgentId}`
  });
  const mgrs = await getManagerIdsForAgent(pool, assigneeAgentId);
  for (const mid of mgrs) {
    await insertAndFanOut(pool, {
      tenantId,
      recipientRole: RECIPIENT.MANAGER,
      recipientStaffId: mid,
      recipientUserId: null,
      title: 'Ticket assignment update',
      description: `Ticket #${ticketId} assigned to your team — ${issueTitle || 'Support request'}`,
      type: TYPE.TICKET_ASSIGNED,
      ticketId,
      dedupeKey: `ta:${tenantId}:${ticketId}:m:${mid}`
    });
  }
}

/**
 * Status in-app bell aligned with ticketEventNotificationService email recipients.
 * @param {'customer_only'|'customer_resolved'|'customer_closed'|'staff_reopen'|'customer_reopen'|'escalation'} audience
 */
async function notifyStatusChanged(pool, {
  tenantId,
  ticketId,
  prevStatus,
  nextStatus,
  assignedTo,
  userId,
  issueTitle,
  audience,
  ticketSnapshot = null
}) {
  const tid = Number(tenantId) || 1;
  const tNum = Number(ticketId);
  const ctx = await resolveTicketNotificationContext(pool, {
    tenantId: tid,
    ticketId: tNum,
    assignedTo,
    userId,
    issueTitle
  });
  const subj = ctx.issueTitle || '';
  const desc = `Ticket #${tNum} moved from ${prevStatus || '?'} to ${nextStatus || '?'} — ${subj}`.trim();

  const pushUser = async (title) => {
    if (!ctx.userId) return;
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.USER,
      recipientStaffId: null,
      recipientUserId: ctx.userId,
      title,
      description: desc,
      type: TYPE.STATUS_CHANGED,
      ticketId: tNum,
      dedupeKey: null
    });
  };

  const pushAgent = async (staffId, title, dedupeSuffix) => {
    const sid = Number(staffId);
    if (!Number.isFinite(sid) || sid <= 0) return;
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.AGENT,
      recipientStaffId: sid,
      recipientUserId: null,
      title,
      description: desc,
      type: TYPE.STATUS_CHANGED,
      ticketId: tNum,
      dedupeKey: dedupeSuffix ? `st:${tid}:${tNum}:${sid}:${dedupeSuffix}` : null,
      includeCeoAdmins: false
    });
  };

  const pushManager = async (staffId, title, dedupeSuffix) => {
    const sid = Number(staffId);
    if (!Number.isFinite(sid) || sid <= 0) return;
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.MANAGER,
      recipientStaffId: sid,
      recipientUserId: null,
      title,
      description: desc,
      type: TYPE.STATUS_CHANGED,
      ticketId: tNum,
      dedupeKey: dedupeSuffix ? `st:${tid}:${tNum}:m:${sid}:${dedupeSuffix}` : null,
      includeCeoAdmins: false
    });
  };

  switch (audience) {
    case STATUS_AUDIENCE.CUSTOMER_RESOLVED:
      await pushUser('Ticket marked resolved');
      return;
    case STATUS_AUDIENCE.CUSTOMER_CLOSED:
      await pushUser('Ticket closed');
      return;
    case STATUS_AUDIENCE.CUSTOMER_ONLY:
      await pushUser('Ticket status updated');
      return;
    case STATUS_AUDIENCE.STAFF_REOPEN: {
      await pushUser('Ticket reopened');
      const reopenAgents = await resolveReopenStaffAgentIds(pool, tid, tNum);
      for (const aid of reopenAgents) {
        await pushAgent(aid, 'Ticket you work on was reopened', 'reopen');
      }
      return;
    }
    case STATUS_AUDIENCE.CUSTOMER_REOPEN: {
      await pushUser('Ticket reopened');
      const reopenAgents = await resolveReopenStaffAgentIds(pool, tid, tNum);
      for (const aid of reopenAgents) {
        await pushAgent(aid, 'Ticket you work on was reopened', 'creopen');
      }
      const mgrs = await getUnionManagerIdsForAgents(pool, reopenAgents);
      for (const mid of mgrs) {
        await pushManager(mid, 'Customer reopened a ticket', 'creopen');
      }
      return;
    }
    case STATUS_AUDIENCE.ESCALATION: {
      const primary = await fetchPrimaryAssigneeId(pool, tid, tNum);
      if (primary) {
        await pushAgent(primary, 'Ticket escalated', 'esc');
      }
      const agentsForManagers = await resolveReopenStaffAgentIds(pool, tid, tNum);
      const mgrs = await getUnionManagerIdsForAgents(pool, agentsForManagers);
      for (const mid of mgrs) {
        await pushManager(mid, 'Ticket escalated (team)', 'esc');
      }
      const pr = await fetchTicketPriority(pool, tid, tNum, ticketSnapshot);
      const { isCritical } = normalizePriorityForCeoCritical(pr);
      if (isCritical) {
        await insertCeoCriticalEscalationRows(pool, {
          tenantId: tid,
          ticketId: tNum,
          description: desc,
          issueTitle: subj
        });
      }
      return;
    }
    default: {
      if (!audience) {
        await pushUser('Ticket status updated');
        return;
      }
      console.warn('[appNotification] unknown status audience:', audience);
    }
  }
}

async function notifyCommentAdded(pool, { tenantId, ticketId, isCustomerReply, senderName, excerpt, assignedTo, userId, issueTitle }) {
  const ctx = await resolveTicketNotificationContext(pool, {
    tenantId,
    ticketId,
    assignedTo,
    userId,
    issueTitle
  });
  const preview = (excerpt || '').slice(0, 140);
  const subj = ctx.issueTitle || `Ticket #${ticketId}`;

  if (isCustomerReply) {
    const mgrSeen = new Set();
    for (const aid of ctx.agentIds) {
      await insertAndFanOut(pool, {
        tenantId,
        recipientRole: RECIPIENT.AGENT,
        recipientStaffId: aid,
        recipientUserId: null,
        title: 'New customer reply',
        description: `${senderName || 'Customer'} on ${subj}: ${preview}`,
        type: TYPE.COMMENT_ADDED,
        ticketId,
        dedupeKey: null,
        includeCeoAdmins: false
      });
      const mgrs = await getManagerIdsForAgent(pool, aid);
      for (const mid of mgrs) {
        if (mgrSeen.has(mid)) continue;
        mgrSeen.add(mid);
        await insertAndFanOut(pool, {
          tenantId,
          recipientRole: RECIPIENT.MANAGER,
          recipientStaffId: mid,
          recipientUserId: null,
          title: 'New customer reply (team)',
          description: `Ticket #${ticketId} — ${preview}`,
          type: TYPE.COMMENT_ADDED,
          ticketId,
          dedupeKey: null,
          includeCeoAdmins: false
        });
      }
    }
  } else if (ctx.userId) {
    await insertAndFanOut(pool, {
      tenantId,
      recipientRole: RECIPIENT.USER,
      recipientStaffId: null,
      recipientUserId: ctx.userId,
      title: 'Update on your ticket',
      description: `${senderName || 'Support'} replied on ${subj}: ${preview}`,
      type: TYPE.COMMENT_ADDED,
      ticketId,
      dedupeKey: null
    });
  }
}

async function notifySlaAlert(pool, { tenantId, ticketId, assignedTo, userId, message, issueTitle, includeCustomer = false }) {
  const ctx = await resolveTicketNotificationContext(pool, {
    tenantId,
    ticketId,
    assignedTo,
    userId,
    issueTitle
  });
  const desc = message || `SLA alert for ticket #${ticketId} — ${ctx.issueTitle || ''}`.trim();
  const slot = Math.floor(Date.now() / 300000);
  const mgrSeen = new Set();
  const primary = await fetchPrimaryAssigneeId(pool, Number(tenantId) || 1, Number(ticketId));
  const staffAgents = primary ? [primary] : ctx.agentIds;
  for (const aid of staffAgents) {
    await insertAndFanOut(pool, {
      tenantId,
      recipientRole: RECIPIENT.AGENT,
      recipientStaffId: aid,
      recipientUserId: null,
      title: 'SLA warning',
      description: desc,
      type: TYPE.SLA_ALERT,
      ticketId,
      dedupeKey: `sla:${tenantId}:${ticketId}:a:${aid}:${slot}`,
      includeCeoAdmins: false
    });
    const mgrs = await getManagerIdsForAgent(pool, aid);
    for (const mid of mgrs) {
      if (mgrSeen.has(mid)) continue;
      mgrSeen.add(mid);
      await insertAndFanOut(pool, {
        tenantId,
        recipientRole: RECIPIENT.MANAGER,
        recipientStaffId: mid,
        recipientUserId: null,
        title: 'SLA warning (team)',
        description: desc,
        type: TYPE.SLA_ALERT,
        ticketId,
        dedupeKey: `sla:${tenantId}:${ticketId}:m:${mid}:${slot}`,
        includeCeoAdmins: false
      });
    }
  }
  if (includeCustomer && ctx.userId) {
    await insertAndFanOut(pool, {
      tenantId,
      recipientRole: RECIPIENT.USER,
      recipientStaffId: null,
      recipientUserId: ctx.userId,
      title: 'SLA update',
      description: desc,
      type: TYPE.SLA_ALERT,
      ticketId,
      dedupeKey: `sla:${tenantId}:${ticketId}:u:${ctx.userId}:${slot}`
    });
  }
}

async function notifyCustomerEscalationInApp(pool, { tenantId, ticket }) {
  const tid = Number(tenantId || ticket?.tenant_id || 1);
  const ticketId = Number(ticket?.id || 0);
  if (!ticketId) return;
  const title = ticket.issue_title || ticket.description?.substring(0, 100) || 'Support request';
  const desc = `Customer escalated ticket #${ticketId} — ${title}`;
  const primary = Number(ticket.assigned_to || ticket.current_owner_id || 0);
  if (Number.isFinite(primary) && primary > 0) {
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.AGENT,
      recipientStaffId: primary,
      recipientUserId: null,
      title: 'Customer escalated ticket',
      description: desc,
      type: TYPE.STATUS_CHANGED,
      ticketId,
      dedupeKey: `ce:${tid}:${ticketId}:a:${primary}`,
      includeCeoAdmins: false
    });
  }
  const agents = new Set(await resolveReopenStaffAgentIds(pool, tid, ticketId));
  if (primary) agents.add(primary);
  const mgrs = await getUnionManagerIdsForAgents(pool, [...agents]);
  for (const mid of mgrs) {
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.MANAGER,
      recipientStaffId: mid,
      recipientUserId: null,
      title: 'Customer escalation (team)',
      description: desc,
      type: TYPE.STATUS_CHANGED,
      ticketId,
      dedupeKey: `ce:${tid}:${ticketId}:m:${mid}`,
      includeCeoAdmins: false
    });
  }
}

async function notifyAgentPriorityOverrideInApp(pool, { tenantId, ticketId, agentId, issueTitle, oldPriority, newPriority }) {
  const aid = Number(agentId || 0);
  if (!Number.isFinite(aid) || aid <= 0) return;
  const tid = Number(tenantId) || 1;
  const tNum = Number(ticketId);
  const subj = issueTitle || `Ticket #${tNum}`;
  const desc = `Priority changed ${oldPriority} → ${newPriority} — ${subj}`;
  await insertAndFanOut(pool, {
    tenantId: tid,
    recipientRole: RECIPIENT.AGENT,
    recipientStaffId: aid,
    recipientUserId: null,
    title: 'Priority updated on your ticket',
    description: desc,
    type: TYPE.STATUS_CHANGED,
    ticketId: tNum,
    dedupeKey: `prio:${tid}:${tNum}:${aid}:${String(oldPriority)}:${String(newPriority)}`,
    includeCeoAdmins: false
  });
}

async function notifyManagerStaffInApp(pool, { tenantId, managerStaffId, ticketId, title, description, dedupeKey }) {
  const mid = Number(managerStaffId || 0);
  if (!Number.isFinite(mid) || mid <= 0) return;
  await insertAndFanOut(pool, {
    tenantId: Number(tenantId) || 1,
    recipientRole: RECIPIENT.MANAGER,
    recipientStaffId: mid,
    recipientUserId: null,
    title: title || 'Team update',
    description: description || '',
    type: TYPE.MANAGER_ALERT,
    ticketId: Number(ticketId) || null,
    dedupeKey: dedupeKey || null,
    includeCeoAdmins: false
  });
}

async function notifyAgentStaffInApp(pool, { tenantId, agentStaffId, ticketId, title, description, dedupeKey, notifType }) {
  const aid = Number(agentStaffId || 0);
  if (!Number.isFinite(aid) || aid <= 0) return;
  await insertAndFanOut(pool, {
    tenantId: Number(tenantId) || 1,
    recipientRole: RECIPIENT.AGENT,
    recipientStaffId: aid,
    recipientUserId: null,
    title: title || 'Ticket update',
    description: description || '',
    type: notifType || TYPE.STATUS_CHANGED,
    ticketId: Number(ticketId) || null,
    dedupeKey: dedupeKey || null,
    includeCeoAdmins: false
  });
}

async function notifyUserTicketInApp(pool, { tenantId, userId, ticketId, title, description, dedupeKey }) {
  const uid = Number(userId || 0);
  if (!Number.isFinite(uid) || uid <= 0) return;
  await insertAndFanOut(pool, {
    tenantId: Number(tenantId) || 1,
    recipientRole: RECIPIENT.USER,
    recipientStaffId: null,
    recipientUserId: uid,
    title: title || 'Ticket update',
    description: description || '',
    type: TYPE.STATUS_CHANGED,
    ticketId: Number(ticketId) || null,
    dedupeKey: dedupeKey || null
  });
}

async function notifyAgentsTicketsCombinedInApp(pool, { tenantId, agentIds, parentTicketId, childTicketIds, actorName }) {
  const tid = Number(tenantId) || 1;
  const parentId = Number(parentTicketId);
  const children = (childTicketIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  const desc = `Tickets #${children.join(', ')} combined into parent #${parentId}${actorName ? ` — ${actorName}` : ''}`;
  const uniq = [...new Set((agentIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  for (const aid of uniq) {
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.AGENT,
      recipientStaffId: aid,
      recipientUserId: null,
      title: 'Linked tickets combined',
      description: desc,
      type: TYPE.STATUS_CHANGED,
      ticketId: parentId,
      dedupeKey: `comb:${tid}:${parentId}:${aid}:${children.join('-')}`,
      includeCeoAdmins: false
    });
  }
}

async function notifyReopenReasonInApp(pool, { tenantId, ticketId, reason }) {
  const tid = Number(tenantId) || 1;
  const tNum = Number(ticketId);
  const text = String(reason || '').trim();
  if (!tNum || !text) return;
  const safeReason = text.length > 300 ? `${text.slice(0, 300)}…` : text;

  const ctx = await resolveTicketNotificationContext(pool, { tenantId: tid, ticketId: tNum });
  const desc = `Ticket #${tNum}${ctx.issueTitle ? ` — ${ctx.issueTitle}` : ''}\nReason: ${safeReason}`;

  // Agent(s) who need to see it: assignee + task assignees (mirrors reopen routing).
  const agentSet = new Set(await resolveReopenStaffAgentIds(pool, tid, tNum));
  const primary = await fetchPrimaryAssigneeId(pool, tid, tNum);
  if (primary) agentSet.add(primary);
  const agentIds = Array.from(agentSet);
  for (const aid of agentIds) {
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.AGENT,
      recipientStaffId: aid,
      recipientUserId: null,
      title: 'Ticket reopened (reason)',
      description: desc,
      type: TYPE.STATUS_CHANGED,
      ticketId: tNum,
      dedupeKey: `reopen_reason:${tid}:${tNum}:a:${aid}:${safeReason.slice(0, 60)}`,
      includeCeoAdmins: false
    });
  }

  // Also show to the ticket owner (customer) so they see immediate confirmation in their bell.
  if (ctx.userId) {
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.USER,
      recipientStaffId: null,
      recipientUserId: ctx.userId,
      title: 'Ticket reopened',
      description: `Reason: ${safeReason}`,
      type: TYPE.STATUS_CHANGED,
      ticketId: tNum,
      dedupeKey: `reopen_reason:${tid}:${tNum}:u:${ctx.userId}:${safeReason.slice(0, 60)}`
    });
  }

  const mgrs = await getUnionManagerIdsForAgents(pool, agentIds);
  for (const mid of mgrs) {
    await insertAndFanOut(pool, {
      tenantId: tid,
      recipientRole: RECIPIENT.MANAGER,
      recipientStaffId: mid,
      recipientUserId: null,
      title: 'Customer reopened (reason)',
      description: desc,
      type: TYPE.MANAGER_ALERT,
      ticketId: tNum,
      dedupeKey: `reopen_reason:${tid}:${tNum}:m:${mid}:${safeReason.slice(0, 60)}`,
      includeCeoAdmins: false
    });
  }
}

module.exports = {
  RECIPIENT,
  TYPE,
  STATUS_AUDIENCE,
  mapRowToApi,
  insertNotification,
  insertAndFanOut,
  resolveTicketNotificationContext,
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyStatusChanged,
  notifyCommentAdded,
  notifySlaAlert,
  notifyCustomerEscalationInApp,
  notifyAgentPriorityOverrideInApp,
  notifyManagerStaffInApp,
  notifyAgentStaffInApp,
  notifyUserTicketInApp,
  notifyAgentsTicketsCombinedInApp,
  notifyReopenReasonInApp
};
