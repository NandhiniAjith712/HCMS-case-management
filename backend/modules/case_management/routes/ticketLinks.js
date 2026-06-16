const express = require('express');
const { pool } = require('../../shared/database/database');
const { authenticateToken } = require('../../shared/middleware/auth');
const { verifyTenantAccess } = require('../../shared/middleware/tenant');
const ticketMessagesService = require('../services/ticketMessagesService');
const ticketEventNotificationService = require('../services/ticketEventNotificationService');

const router = express.Router();

const STAFF_ROLES = new Set(['support_manager', 'manager', 'ceo', 'admin', 'support_agent', 'agent']);
const MANAGER_ROLES = new Set(['support_manager', 'manager', 'ceo', 'admin']);

function assertStaff(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (STAFF_ROLES.has(role)) return next();
  return res.status(403).json({ success: false, message: 'Staff only.' });
}

function assertManager(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (MANAGER_ROLES.has(role)) return next();
  return res.status(403).json({ success: false, message: 'Managers only.' });
}

const ALLOWED_LINK_STATUSES = new Set(['new', 'in_progress']);

function buildConversationKeyForManagerAgent({ ticketId, managerId, agentId }) {
  // Must match frontend SupportTicketChatTabs.buildConversationKey() for manager<->agent thread.
  // This thread is intentionally shared per ticket (not per agent assignment).
  const a = { side: 'manager', id: 'manager' };
  const b = { side: 'agent', id: 'agent' };
  const ordered = [a, b].sort((x, y) => `${x.side}:${x.id}`.localeCompare(`${y.side}:${y.id}`));
  return `tk:${ticketId}::${ordered[0].side}:${ordered[0].id}__${ordered[1].side}:${ordered[1].id}`;
}

let linkSchemaEnsured = false;
async function ensureLinkSchema() {
  if (linkSchemaEnsured) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ticket_link_groups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      label VARCHAR(255) NULL,
      primary_ticket_id INT NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_tlg_tenant_created (tenant_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Backfill column for older installs
  try {
    await pool.execute(`ALTER TABLE ticket_link_groups ADD COLUMN primary_ticket_id INT NULL`);
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') {
      console.warn('ticket_link_groups.primary_ticket_id:', e?.message || e);
    }
  }
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ticket_link_group_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      group_id INT NOT NULL,
      ticket_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_tlgi (tenant_id, group_id, ticket_id),
      KEY idx_tlgi_ticket (tenant_id, ticket_id),
      KEY idx_tlgi_group (tenant_id, group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  linkSchemaEnsured = true;
}

async function getLinkedGroupForTicket({ tenantId, ticketId }) {
  await ensureLinkSchema();
  const [rows] = await pool.execute(
    `SELECT group_id FROM ticket_link_group_items WHERE tenant_id = ? AND ticket_id = ? LIMIT 1`,
    [tenantId, ticketId]
  );
  const groupId = Number(rows?.[0]?.group_id || 0);
  if (!groupId) return null;
  const [groupRows] = await pool.execute(
    `SELECT id, label, primary_ticket_id, created_by, created_at FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, groupId]
  );
  const group = groupRows?.[0] || null;
  if (!group) return null;
  const [items] = await pool.execute(
    `SELECT ticket_id FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ? ORDER BY ticket_id ASC`,
    [tenantId, groupId]
  );
  const ticketIds = (items || []).map((r) => Number(r.ticket_id)).filter(Boolean);
  return { ...group, ticket_ids: ticketIds };
}

router.post('/groups', authenticateToken, verifyTenantAccess, assertManager, async (req, res) => {
  try {
    await ensureLinkSchema();
    const tenantId = req.tenantId || 1;
    const actorId = Number(req.user?.id || req.user?.userId || 0) || null;
    const label = req.body?.label != null ? String(req.body.label).trim().slice(0, 255) : null;
    const ticketIds = Array.isArray(req.body?.ticket_ids)
      ? req.body.ticket_ids.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    const uniqueIds = [...new Set(ticketIds)];
    if (uniqueIds.length < 2) {
      return res.status(400).json({ success: false, message: 'Select at least 2 tickets to link.' });
    }

    // Only allow linking when all selected tickets are in new/in_progress.
    try {
      const placeholders = uniqueIds.map(() => '?').join(', ');
      const [rows] = await pool.execute(
        `SELECT id, status FROM tickets WHERE tenant_id = ? AND id IN (${placeholders})`,
        [tenantId, ...uniqueIds]
      );
      const statusMap = new Map((rows || []).map((r) => [Number(r.id), String(r.status || '').toLowerCase()]));
      for (const tid of uniqueIds) {
        const st = statusMap.get(Number(tid)) || '';
        if (!ALLOWED_LINK_STATUSES.has(st)) {
          return res.status(409).json({
            success: false,
            message: `Ticket #${tid} is in '${st || 'unknown'}' state. Similar-ticket linking is allowed only for new/in_progress tickets.`
          });
        }
      }
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Failed to validate ticket statuses for linking.' });
    }
    const [ins] = await pool.execute(
      `INSERT INTO ticket_link_groups (tenant_id, label, primary_ticket_id, created_by) VALUES (?, ?, ?, ?)`,
      [tenantId, label || null, uniqueIds[0], actorId]
    );
    const groupId = Number(ins.insertId);
    const values = [];
    const params = [];
    for (const tid of uniqueIds) {
      values.push('(?,?,?)');
      params.push(tenantId, groupId, tid);
    }
    await pool.execute(
      `INSERT IGNORE INTO ticket_link_group_items (tenant_id, group_id, ticket_id) VALUES ${values.join(',')}`,
      params
    );
    return res.status(201).json({ success: true, data: { group_id: groupId, label: label || null, ticket_ids: uniqueIds } });
  } catch (e) {
    console.error('POST /api/ticket-links/groups error:', e?.message || e);
    return res.status(500).json({ success: false, message: 'Failed to create link group.' });
  }
});

// --- Link group CRUD for ticket detail ---
router.get('/ticket/:ticketId', authenticateToken, verifyTenantAccess, assertStaff, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.ticketId);
    if (!ticketId) return res.status(400).json({ success: false, message: 'Invalid ticket id.' });
    const group = await getLinkedGroupForTicket({ tenantId, ticketId });
    if (!group) return res.json({ success: true, data: { group: null, linked: [] } });
    const ids = (group.ticket_ids || []).filter((id) => id !== ticketId);
    if (!ids.length) return res.json({ success: true, data: { group, linked: [] } });
    const placeholders = ids.map(() => '?').join(', ');
    const [tickets] = await pool.execute(
      `SELECT id, issue_title, status, updated_at, name
       FROM tickets
       WHERE tenant_id = ? AND id IN (${placeholders})
       ORDER BY id ASC`,
      [tenantId, ...ids]
    );
    return res.json({ success: true, data: { group, linked: tickets || [] } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to fetch linked tickets.' });
  }
});

router.post('/ticket/:ticketId/link', authenticateToken, verifyTenantAccess, assertManager, async (req, res) => {
  try {
    await ensureLinkSchema();
    const tenantId = req.tenantId || 1;
    const actorId = Number(req.user?.id || req.user?.userId || 0) || null;
    const ticketId = Number(req.params.ticketId);
    const targetId = Number(req.body?.target_ticket_id);
    const label = req.body?.label != null ? String(req.body.label).trim().slice(0, 255) : null;
    if (!ticketId || !targetId || ticketId === targetId) {
      return res.status(400).json({ success: false, message: 'Invalid link request.' });
    }

    // Once a ticket is in a linked group, it cannot be linked again or expanded with new links.
    // Also, prevent linking a target ticket that already belongs to any linked group.
    const existingSrcGroup = await getLinkedGroupForTicket({ tenantId, ticketId });
    if (existingSrcGroup?.id) {
      return res.status(409).json({
        success: false,
        message: `Ticket #${ticketId} is already part of a linked group. Linked tickets cannot be linked again.`
      });
    }
    const existingTgtGroup = await getLinkedGroupForTicket({ tenantId, ticketId: targetId });
    if (existingTgtGroup?.id) {
      return res.status(409).json({
        success: false,
        message: `Ticket #${targetId} is already part of a linked group. Linked tickets cannot be linked again.`
      });
    }

    // Only allow linking from new/in_progress tickets (and only link to new/in_progress targets).
    try {
      const [rows] = await pool.execute(
        `SELECT id, status FROM tickets WHERE tenant_id = ? AND id IN (?, ?)`,
        [tenantId, ticketId, targetId]
      );
      const m = new Map((rows || []).map((r) => [Number(r.id), String(r.status || '').toLowerCase()]));
      const src = m.get(ticketId) || '';
      const tgt = m.get(targetId) || '';
      if (!ALLOWED_LINK_STATUSES.has(src)) {
        return res.status(409).json({
          success: false,
          message: `This ticket is in '${src || 'unknown'}' state. Similar-ticket linking is allowed only for new/in_progress tickets.`
        });
      }
      if (!ALLOWED_LINK_STATUSES.has(tgt)) {
        return res.status(409).json({
          success: false,
          message: `Ticket #${targetId} is in '${tgt || 'unknown'}' state. Similar-ticket linking is allowed only for new/in_progress tickets.`
        });
      }
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Failed to validate ticket statuses for linking.' });
    }
    let group = await getLinkedGroupForTicket({ tenantId, ticketId });
    if (!group) {
      const [ins] = await pool.execute(
        `INSERT INTO ticket_link_groups (tenant_id, label, primary_ticket_id, created_by) VALUES (?, ?, ?, ?)`,
        [tenantId, label || null, ticketId, actorId]
      );
      const groupId = Number(ins.insertId);
      await pool.execute(
        `INSERT INTO ticket_link_group_items (tenant_id, group_id, ticket_id) VALUES (?, ?, ?), (?, ?, ?)`,
        [tenantId, groupId, ticketId, tenantId, groupId, targetId]
      );
      group = await getLinkedGroupForTicket({ tenantId, ticketId });
    } else {
      if (label && String(group.label || '').trim() !== label) {
        await pool.execute(
          `UPDATE ticket_link_groups SET label = ? WHERE tenant_id = ? AND id = ?`,
          [label, tenantId, group.id]
        );
      }
      // Ensure primary is set for older groups.
      if (!group.primary_ticket_id) {
        await pool.execute(
          `UPDATE ticket_link_groups SET primary_ticket_id = ? WHERE tenant_id = ? AND id = ? AND primary_ticket_id IS NULL`,
          [ticketId, tenantId, group.id]
        );
      }
      await pool.execute(
        `INSERT IGNORE INTO ticket_link_group_items (tenant_id, group_id, ticket_id) VALUES (?, ?, ?)`,
        [tenantId, group.id, targetId]
      );
      group = await getLinkedGroupForTicket({ tenantId, ticketId });
    }
    return res.json({ success: true, data: { group } });
  } catch (e) {
    console.error('link error', e?.message || e);
    return res.status(500).json({ success: false, message: 'Failed to link ticket.' });
  }
});

router.post('/ticket/:ticketId/unlink', authenticateToken, verifyTenantAccess, assertManager, async (req, res) => {
  try {
    await ensureLinkSchema();
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.ticketId);
    const targetId = Number(req.body?.target_ticket_id);
    if (!ticketId || !targetId) return res.status(400).json({ success: false, message: 'Invalid unlink request.' });
    const group = await getLinkedGroupForTicket({ tenantId, ticketId });
    if (!group?.id) return res.json({ success: true, data: { group: null } });
    await pool.execute(
      `DELETE FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ? AND ticket_id = ?`,
      [tenantId, group.id, targetId]
    );
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ?`,
      [tenantId, group.id]
    );
    const remaining = Number(countRows?.[0]?.c || 0);
    if (remaining < 2) {
      await pool.execute(`DELETE FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ?`, [tenantId, group.id]);
      await pool.execute(`DELETE FROM ticket_link_groups WHERE tenant_id = ? AND id = ?`, [tenantId, group.id]);
      return res.json({ success: true, data: { group: null } });
    }
    const nextGroup = await getLinkedGroupForTicket({ tenantId, ticketId });
    return res.json({ success: true, data: { group: nextGroup } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to unlink.' });
  }
});

router.post('/groups/:groupId/share-note', authenticateToken, verifyTenantAccess, assertManager, async (req, res) => {
  try {
    await ensureLinkSchema();
    const tenantId = req.tenantId || 1;
    const groupId = Number(req.params.groupId);
    const note = String(req.body?.note || '').trim();
    if (!groupId || !note) return res.status(400).json({ success: false, message: 'note is required.' });
    const [items] = await pool.execute(
      `SELECT ticket_id FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ?`,
      [tenantId, groupId]
    );
    const ticketIds = (items || []).map((r) => Number(r.ticket_id)).filter(Boolean);
    const senderName = req.user?.name || req.user?.email || 'Agent';
    for (const tid of ticketIds) {
      // Store internal note only in manager<->agent thread (never in agent<->user thread).
      // IMPORTANT: conversationKey is per-ticket and must match frontend SupportTicketChatTabs.buildConversationKey().
      const conversationKey = buildConversationKeyForManagerAgent({
        ticketId: Number(tid)
      });
      await ticketMessagesService.addMessage({
        ticketId: tid,
        tenantId,
        senderType: ticketMessagesService.SENDER_TYPES.AGENT,
        senderName,
        senderId: Number(req.user?.id || req.user?.userId || 0) || null,
        message: note,
        channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
        isInternal: true,
        conversationKey
      });
    }
    return res.json({ success: true, data: { ticket_ids: ticketIds } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to share note.' });
  }
});

router.post('/groups/:groupId/bulk-close', authenticateToken, verifyTenantAccess, assertStaff, async (req, res) => {
  try {
    await ensureLinkSchema();
    const tenantId = req.tenantId || 1;
    const groupId = Number(req.params.groupId);
    const resolutionStatus = String(req.body?.resolution_status || 'Resolved').trim();
    const template = String(req.body?.resolution_message || '').trim();
    if (!groupId || !template) return res.status(400).json({ success: false, message: 'resolution_message is required.' });
    // Agents can bulk-close only from the primary ticket (to match parent-only workflow).
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id || req.user?.userId || 0) || 0;
    const isManagerRole = MANAGER_ROLES.has(actorRole);
    if (!isManagerRole) {
      const [gr] = await pool.execute(
        `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, groupId]
      );
      const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
      if (!primaryId) {
        return res.status(404).json({ success: false, message: 'Linked group not found.' });
      }
      const [trows] = await pool.execute(
        `SELECT assigned_to, current_owner_id FROM tickets WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, primaryId]
      );
      const assignedTo = Number(trows?.[0]?.assigned_to || 0);
      const ownerId = Number(trows?.[0]?.current_owner_id || 0);
      if (actorId <= 0 || (actorId !== assignedTo && actorId !== ownerId)) {
        return res.status(403).json({ success: false, message: `Bulk close is allowed only from the parent ticket #${primaryId}.` });
      }
    }
    const [items] = await pool.execute(
      `SELECT ticket_id FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ?`,
      [tenantId, groupId]
    );
    const ticketIds = (items || []).map((r) => Number(r.ticket_id)).filter(Boolean);
    if (!ticketIds.length) return res.json({ success: true, data: { closed: [] } });
    const placeholders = ticketIds.map(() => '?').join(', ');
    const [tickets] = await pool.execute(
      `SELECT * FROM tickets WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...ticketIds]
    );
    const senderName = req.user?.name || req.user?.email || 'Support';
    const actorIdForMsg = Number(req.user?.id || req.user?.userId || 0) || null;
    const closed = [];
    for (const t of tickets || []) {
      const prevStatus = String(t.status || 'new').toLowerCase();
      const msg = template.replace(/\{user_name\}/g, String(t.name || 'Customer'));
      // Post user-visible resolution message (per ticket, individually).
      await ticketMessagesService.addMessage({
        ticketId: Number(t.id),
        tenantId,
        senderType: ticketMessagesService.SENDER_TYPES.AGENT,
        senderName,
        senderId: actorIdForMsg,
        message: msg,
        channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
        isInternal: false
      });
      await pool.execute(
        `UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
        [tenantId, Number(t.id)]
      );
      try {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: { ...t, status: 'closed' },
          tenantId,
          previousStatus: prevStatus,
          newStatus: 'closed',
          actorId: actorIdForMsg,
          actorName: senderName
        });
      } catch (_) {}
      closed.push(Number(t.id));
    }
    // If everything closed, keep group but UI can grey it out.
    return res.json({ success: true, data: { closed, resolution_status: resolutionStatus } });
  } catch (e) {
    console.error('bulk-close error', e?.message || e);
    return res.status(500).json({ success: false, message: 'Failed to bulk close.' });
  }
});

module.exports = router;

