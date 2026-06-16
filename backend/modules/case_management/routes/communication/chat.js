const express = require('express');
const router = express.Router();
const { pool } = require('../../../shared/database/database');
const { authenticateToken } = require('../../../shared/middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../../../shared/middleware/tenant');
const ticketEventNotificationService = require('../../services/ticketEventNotificationService');
const ticketMessagesService = require('../../services/ticketMessagesService');

let linkSchemaEnsured = false;
async function ensureLinkSchema() {
  if (linkSchemaEnsured) return;
  try {
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
  } catch (e) {
    // If link schema can't be ensured, we simply skip fan-out behavior.
    console.warn('ensureLinkSchema(chat):', e?.message || e);
  }
}

// Apply tenant context to all routes
router.use(setTenantContext);

// Get all chat messages for a ticket
router.get('/messages/:ticketId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const conversationKey = (req.query.conversationKey || '').toString().trim();
    let tenantId = req.tenantId;
    
    // Validate ticketId
    if (!ticketId || isNaN(ticketId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    // First check if ticket exists (tenant-filtered)
    let [tickets] = await pool.execute(
      'SELECT id, name, issue_title, tenant_id, user_id, email FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );

    // Fallback for customers: ticket may have different tenant_id (e.g. tenant 1 vs 2)
    if (tickets.length === 0 && req.user && (req.user.role === 'user' || req.user.role === 'customer')) {
      [tickets] = await pool.execute(
        'SELECT id, name, issue_title, tenant_id, user_id, email FROM tickets WHERE id = ?',
        [ticketId]
      );
      if (tickets.length > 0) {
        const ticket = tickets[0];
        const isOwner = (ticket.user_id && parseInt(ticket.user_id) === parseInt(req.user.id)) ||
          (ticket.email && ticket.email.toLowerCase() === (req.user.email || '').toLowerCase());
        if (isOwner) {
          tenantId = ticket.tenant_id || tenantId || 1;
        } else {
          return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
      }
    }

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Exclude internal notes for customers (staff sees all messages including internal)
    const isCustomer = req.user && ['user', 'customer'].includes(req.user.role);
    const excludeInternal = !!isCustomer;
    // Strict participant isolation: when a conversationKey is provided,
    // always scope messages to that conversation (for staff + customer).
    const messageScopeKey = conversationKey || null;
    let rows = await ticketMessagesService.getMessages(ticketId, tenantId, excludeInternal, messageScopeKey);
    if (!isCustomer && rows.length === 0) {
      // Fallback for legacy rows that may have missing/mismatched tenant_id.
      rows = await ticketMessagesService.getMessages(ticketId, null, excludeInternal, messageScopeKey);
    }
    // Legacy merge must NOT happen when conversation scoping is active, otherwise
    // messages leak across participant conversations (agent<->user vs agent<->manager).
    if (!isCustomer && !messageScopeKey) {
      // Merge legacy chat_messages rows for older tickets not fully migrated.
      try {
        const [legacyRows] = await pool.execute(
          `SELECT
             id,
             ticket_id,
             sender_type,
             sender_id,
             sender_name,
             message,
             created_at
           FROM chat_messages
           WHERE ticket_id = ?
           ORDER BY created_at ASC`,
          [ticketId]
        );
        if (legacyRows.length > 0) {
          const existingKeys = new Set(
            rows.map((r) => `${r.sender_type}|${r.sender_name}|${String(r.message || '').trim()}|${new Date(r.created_at).getTime()}`)
          );
          for (const lr of legacyRows) {
            const normalizedType = lr.sender_type === 'customer' ? 'user' : (lr.sender_type || 'user');
            const key = `${normalizedType}|${lr.sender_name}|${String(lr.message || '').trim()}|${new Date(lr.created_at).getTime()}`;
            if (existingKeys.has(key)) continue;
            rows.push({
              id: `legacy-${lr.id}`,
              ticket_id: lr.ticket_id,
              sender_type: normalizedType,
              sender_id: lr.sender_id || null,
              sender_name: lr.sender_name || 'Unknown',
              message: lr.message || '',
              channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
              is_internal: false,
              created_at: lr.created_at
            });
          }
          rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }
      } catch (_) {
        // Legacy table may not exist; ignore.
      }
    }
    // Hide "Notify Customer" notice messages from the chat timeline.
    // These are displayed in the ticket detail page + popup acknowledgement instead.
    rows = (rows || []).filter((r) => !r || !r.requires_ack);
    const agentSenderIds = [...new Set(rows.filter(r => r.sender_type === 'agent' && r.sender_id).map(r => Number(r.sender_id)))];
    const agentRoleMap = new Map();
    if (agentSenderIds.length > 0) {
      const placeholders = agentSenderIds.map(() => '?').join(',');
      const [agentRows] = await pool.execute(
        `SELECT id, role FROM agents WHERE id IN (${placeholders})`,
        agentSenderIds
      );
      agentRows.forEach(a => agentRoleMap.set(Number(a.id), a.role || null));
    }
    const messages = rows.map(m => ({
      id: m.id,
      ticket_id: m.ticket_id,
      sender_type: m.sender_type === 'user' ? 'customer' : m.sender_type,
      sender_id: m.sender_id,
      sender_role: m.sender_type === 'agent' ? (agentRoleMap.get(Number(m.sender_id)) || null) : null,
      sender_name: m.sender_name,
      message: m.message,
      message_type: 'text',
      channel: m.channel,
      is_internal: !!m.is_internal,
      requires_ack: !!m.requires_ack,
      acknowledged_at: m.acknowledged_at || null,
      acknowledged_by: m.acknowledged_by || null,
      created_at: m.created_at,
      updated_at: m.created_at
    }));

    res.json({
      success: true,
      data: messages,
      ticket: tickets[0]
    });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch chat messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add a new chat message
router.post('/messages', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { 
      ticketId, 
      senderType, 
      senderId, 
      senderName, 
      message, 
      messageType = 'text',
      parentMessageId = null,
      conversationKey = null,
      requiresAck = false
    } = req.body;
    
    // Validate required fields
    if (!ticketId || !senderType || !senderName || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: ticketId, senderType, senderName, message'
      });
    }

    // Validate senderType
    if (!['agent', 'customer', 'system'].includes(senderType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid senderType. Must be agent, customer, or system'
      });
    }

    // Validate messageType
    if (!['text', 'system', 'status_update', 'typing_indicator'].includes(messageType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid messageType'
      });
    }

    // Check if ticket exists (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT id FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const normalizedSenderType = senderType === 'customer' ? 'user' : senderType;

    // Restrict end-users from messaging managers: customer cannot post into "manager" conversation.
    const requesterRole = String(req.user?.role || '').toLowerCase();
    const requesterIsCustomer = ['user', 'customer'].includes(requesterRole);
    const conversationKeyStr = String(conversationKey || '');
    const isManagerThread = /\bmanager:/.test(conversationKeyStr);
    if (requesterIsCustomer && normalizedSenderType === 'user' && isManagerThread) {
      return res.status(403).json({
        success: false,
        message: 'Direct communication with managers is restricted. Please contact your assigned support agent.'
      });
    }

    // Store in unified ticket_messages table
    const msg = await ticketMessagesService.addMessage({
      ticketId,
      tenantId,
      senderType: normalizedSenderType,
      senderId: senderId || null,
      senderName,
      message,
      channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
      conversationKey: conversationKey || null,
      requiresAck: !!requiresAck
    });

    if (!msg) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save message'
      });
    }

    if (messageType === 'text') {
      try {
        const [tix] = await pool.execute(
          `SELECT t.issue_title, t.user_id, t.assigned_to
           FROM tickets t WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`,
          [ticketId, tenantId]
        );
        const trow = tix?.[0];
        if (trow) {
          const appNotificationService = require('../../services/appNotificationService');
          const isCustomerReply = normalizedSenderType === 'user';
          await appNotificationService.notifyCommentAdded(pool, {
            tenantId,
            ticketId: Number(ticketId),
            isCustomerReply,
            senderName: senderName || (isCustomerReply ? 'Customer' : 'Support'),
            excerpt: String(message || '').slice(0, 200),
            assignedTo: trow.assigned_to || null,
            userId: trow.user_id || null,
            issueTitle: trow.issue_title || ''
          });
        }
      } catch (inAppErr) {
        console.warn('⚠️ In-app chat message notifications failed:', inAppErr?.message);
      }
    }

    const messages = [{
      id: msg.id,
      ticket_id: msg.ticket_id,
      sender_type: msg.sender_type === 'user' ? 'customer' : msg.sender_type,
      sender_id: msg.sender_id,
      sender_role: msg.sender_type === 'agent' ? (req.user?.role || null) : null,
      sender_name: msg.sender_name,
      message: msg.message,
      message_type: 'text',
      channel: msg.channel,
      requires_ack: !!msg.requires_ack,
      acknowledged_at: msg.acknowledged_at || null,
      created_at: msg.created_at,
      updated_at: msg.created_at
    }];

    // Notify Customer fan-out: if this message is marked as requiresAck and is sent from the
    // primary/parent ticket of a linked group, copy it to all linked tickets so all users are notified.
    // NOTE: notify-updates & notifications endpoints do not scope by conversationKey, so store fanout
    // messages without conversationKey to keep customer UX stable.
    if (normalizedSenderType === 'agent' && messageType === 'text' && !!requiresAck) {
      try {
        await ensureLinkSchema();
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, Number(ticketId)]
        );
        let groupId = Number(g?.[0]?.group_id || 0);
        // Fallback for legacy rows where tenant_id may be missing/mismatched.
        if (!groupId) {
          const [g2] = await pool.execute(
            `SELECT group_id
             FROM ticket_link_group_items
             WHERE ticket_id = ?
             LIMIT 1`,
            [Number(ticketId)]
          );
          groupId = Number(g2?.[0]?.group_id || 0);
        }
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id
             FROM ticket_link_groups
             WHERE tenant_id = ? AND id = ?
             LIMIT 1`,
            [tenantId, groupId]
          );
          let primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (!primaryId) {
            const [gr2] = await pool.execute(
              `SELECT primary_ticket_id
               FROM ticket_link_groups
               WHERE id = ?
               LIMIT 1`,
              [groupId]
            );
            primaryId = Number(gr2?.[0]?.primary_ticket_id || 0);
          }
          if (primaryId && primaryId === Number(ticketId)) {
            const [items] = await pool.execute(
              `SELECT ticket_id
               FROM ticket_link_group_items
               WHERE tenant_id = ? AND group_id = ?`,
              [tenantId, groupId]
            );
            let linkedIds = (items || [])
              .map((r) => Number(r.ticket_id))
              .filter((v) => Number.isFinite(v) && v > 0 && v !== Number(ticketId));
            if (!linkedIds.length) {
              const [items2] = await pool.execute(
                `SELECT ticket_id
                 FROM ticket_link_group_items
                 WHERE group_id = ?`,
                [groupId]
              );
              linkedIds = (items2 || [])
                .map((r) => Number(r.ticket_id))
                .filter((v) => Number.isFinite(v) && v > 0 && v !== Number(ticketId));
            }
            if (linkedIds.length) {
              // Copy message row to each linked ticket.
              // IMPORTANT: use each ticket's own tenant_id so customer-facing queries can find it.
              const placeholders = linkedIds.map(() => '?').join(', ');
              let childTickets = [];
              try {
                const [trows] = await pool.execute(
                  `SELECT id, tenant_id
                   FROM tickets
                   WHERE id IN (${placeholders})`,
                  linkedIds
                );
                childTickets = trows || [];
              } catch (_) {
                childTickets = linkedIds.map((id) => ({ id, tenant_id: tenantId }));
              }
              const tenantByTicketId = new Map(childTickets.map((t) => [Number(t.id), Number(t.tenant_id || tenantId)]));

              for (const lid of linkedIds) {
                try {
                  await ticketMessagesService.addMessage({
                    ticketId: Number(lid),
                    tenantId: tenantByTicketId.get(Number(lid)) || tenantId,
                    senderType: normalizedSenderType,
                    senderId: senderId || null,
                    senderName,
                    message,
                    channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
                    conversationKey: null,
                    requiresAck: true
                  });
                } catch (_) {}
              }
            }
          }
        }
      } catch (e) {
        // Fan-out should not block the primary notify action.
        console.warn('notify-customer fanout failed:', e?.message || e);
      }
    }

    // Centralized channel notifications for agent replies to customers.
    if (senderType === 'agent' && messageType === 'text') {
      try {
        const [ticketDetails] = await pool.execute(`
          SELECT 
            t.id,
            t.issue_title,
            t.mobile,
            t.email,
            t.name as ticket_customer_name,
            t.tenant_id,
            u.email as user_email,
            u.name as user_name
          FROM tickets t
          LEFT JOIN users u ON t.user_id = u.id
          WHERE t.id = ?
          LIMIT 1
        `, [ticketId]);

        if (ticketDetails.length > 0) {
          const ticket = ticketDetails[0];
          await ticketEventNotificationService.notifyAgentReplyToCustomer({
            ticketId: Number(ticket.id),
            tenantId: ticket.tenant_id || tenantId || 1,
            issueTitle: ticket.issue_title,
            customerEmail: ticket.user_email || ticket.email || '',
            customerName: ticket.user_name || ticket.ticket_customer_name || 'Customer',
            mobile: ticket.mobile || '',
            senderName,
            messageText: message
          });
        }
      } catch (notifyError) {
        console.error('Error sending centralized agent reply notifications:', notifyError);
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Chat message added successfully',
      data: messages[0]
    });
  } catch (error) {
    console.error('Error adding chat message:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add chat message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get unacknowledged "notify customer" messages for customer popup
router.get('/notifications/:ticketId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const conversationKey = (req.query.conversationKey || '').toString().trim();
    let tenantId = req.tenantId;
    if (!ticketId || isNaN(ticketId)) return res.status(400).json({ success: false, message: 'Invalid ticket ID' });

    // Ensure caller is the ticket owner customer
    const role = String(req.user?.role || '').toLowerCase();
    const isCustomer = ['user', 'customer'].includes(role);
    if (!isCustomer) return res.status(403).json({ success: false, message: 'Customer only.' });

    // Ownership / tenant fallback similar to GET /messages
    let [tickets] = await pool.execute(
      'SELECT id, tenant_id, user_id, email FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );
    if (tickets.length === 0) {
      [tickets] = await pool.execute('SELECT id, tenant_id, user_id, email FROM tickets WHERE id = ?', [ticketId]);
      if (tickets.length > 0) {
        const t = tickets[0];
        const isOwner = (t.user_id && Number(t.user_id) === Number(req.user.id)) ||
          (t.email && String(t.email).toLowerCase() === String(req.user.email || '').toLowerCase());
        if (!isOwner) return res.status(404).json({ success: false, message: 'Ticket not found' });
        tenantId = t.tenant_id || tenantId || 1;
      }
    }
    if (tickets.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const rows = await ticketMessagesService.getUnacknowledgedCustomerNotices({
      ticketId: Number(ticketId),
      tenantId,
      conversationKey: conversationKey || null
    });
    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error('GET /api/chat/notifications error:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});

// Get all notify-customer updates (requires_ack=true) for display in ticket detail page
router.get('/notify-updates/:ticketId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { ticketId } = req.params;
    let tenantId = req.tenantId;
    if (!ticketId || isNaN(ticketId)) return res.status(400).json({ success: false, message: 'Invalid ticket ID' });

    const role = String(req.user?.role || '').toLowerCase();
    const isCustomer = ['user', 'customer'].includes(role);

    // Ticket existence + ownership (customers) + tenant fallback (same approach as /messages)
    let [tickets] = await pool.execute(
      'SELECT id, tenant_id, user_id, email FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );
    if (tickets.length === 0 && isCustomer) {
      [tickets] = await pool.execute('SELECT id, tenant_id, user_id, email FROM tickets WHERE id = ?', [ticketId]);
      if (tickets.length > 0) {
        const t = tickets[0];
        const actorEmail = String(req.user?.email || '').trim().toLowerCase();
        const isOwner = (t.user_id && Number(t.user_id) === Number(req.user.id)) ||
          (t.email && actorEmail && String(t.email).trim().toLowerCase() === actorEmail);
        if (!isOwner) return res.status(404).json({ success: false, message: 'Ticket not found' });
        tenantId = t.tenant_id || tenantId || 1;
      }
    }
    if (tickets.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const [rows] = await pool.execute(
      `SELECT id, ticket_id, sender_type, sender_id, sender_name, message, channel,
              COALESCE(requires_ack, FALSE) as requires_ack,
              acknowledged_at, acknowledged_by, created_at
       FROM ticket_messages
       WHERE ticket_id = ?
         AND sender_type = 'agent'
         AND (is_internal IS NULL OR is_internal = FALSE)
         AND COALESCE(requires_ack, FALSE) = TRUE
       ORDER BY created_at ASC`,
      [Number(ticketId)]
    );
    return res.json({ success: true, data: rows || [] });
  } catch (e) {
    console.error('GET /api/chat/notify-updates error:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch notify updates.' });
  }
});

// Acknowledge a notify message (for auditing)
router.put('/messages/:messageId/ack', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const messageId = Number(req.params.messageId);
    if (!messageId) return res.status(400).json({ success: false, message: 'Invalid message id.' });
    const role = String(req.user?.role || '').toLowerCase();
    const isCustomer = ['user', 'customer'].includes(role);
    if (!isCustomer) return res.status(403).json({ success: false, message: 'Customer only.' });

    // ensure message belongs to a ticket the customer owns
    const [rows] = await pool.execute(
      `SELECT tm.id, tm.ticket_id, t.user_id, t.email
       FROM ticket_messages tm
       JOIN tickets t ON t.id = tm.ticket_id
       WHERE tm.id = ? AND tm.tenant_id = ?
       LIMIT 1`,
      [messageId, tenantId]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Message not found.' });
    const actorEmail = String(req.user?.email || '').trim().toLowerCase();
    const isOwner = (row.user_id && Number(row.user_id) === Number(req.user.id)) ||
      (row.email && actorEmail && String(row.email).trim().toLowerCase() === actorEmail);
    if (!isOwner) return res.status(403).json({ success: false, message: 'Access denied.' });

    const ok = await ticketMessagesService.acknowledgeMessage({
      messageId,
      tenantId,
      acknowledgedBy: req.user?.email || req.user?.id || 'customer'
    });
    return res.json({ success: true, data: { acknowledged: ok } });
  } catch (e) {
    console.error('PUT /api/chat/messages/:id/ack error:', e);
    return res.status(500).json({ success: false, message: 'Failed to acknowledge.' });
  }
});

// Mark messages as read
router.put('/messages/read/:ticketId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { ticketId } = req.params;
    const { userId, userType } = req.body;
    
    // Validate inputs
    if (!ticketId || isNaN(ticketId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    if (!userType || !['agent', 'customer'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userType. Must be agent or customer'
      });
    }

    // Check if ticket exists (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT id FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const updatedCount = await ticketMessagesService.markAsRead(ticketId, tenantId, userType);

    res.json({
      success: true,
      message: 'Messages marked as read',
      data: {
        updatedCount
      }
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark messages as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get chat session for a ticket
router.get('/session/:ticketId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { ticketId } = req.params;
    
    // Validate ticketId
    if (!ticketId || isNaN(ticketId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    // Check if ticket exists (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT id FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const [sessions] = await pool.execute(`
      SELECT 
        cs.*,
        cp.user_id,
        cp.user_type,
        cp.user_name,
        cp.is_typing,
        cp.last_typing_at
      FROM chat_sessions cs
      LEFT JOIN chat_participants cp ON cs.session_id = cp.session_id AND cp.tenant_id = ?
      WHERE cs.ticket_id = ? AND cs.tenant_id = ? AND cs.status = 'active'
      ORDER BY cp.joined_at ASC
    `, [tenantId, ticketId, tenantId]);
    
    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Error fetching chat session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch chat session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create or join chat session
router.post('/session', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { ticketId, userId, userType, userName } = req.body;
    
    // Validate inputs
    if (!ticketId || !userType || !userName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: ticketId, userType, userName'
      });
    }

    if (!['agent', 'customer'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userType. Must be agent or customer'
      });
    }

    // Check if ticket exists (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT id FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Check if active session exists (tenant-filtered)
    let [sessions] = await pool.execute(`
      SELECT session_id FROM chat_sessions 
      WHERE ticket_id = ? AND tenant_id = ? AND status = 'active'
      LIMIT 1
    `, [ticketId, tenantId]);
    
    let sessionId;
    
    if (sessions.length === 0) {
      // Create new session (with tenant_id)
      sessionId = `session_${ticketId}_${Date.now()}`;
      await pool.execute(`
        INSERT INTO chat_sessions (tenant_id, ticket_id, session_id, ${userType}_id, last_activity_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [tenantId, ticketId, sessionId, userId]);
    } else {
      sessionId = sessions[0].session_id;
      
      // Update last activity
      await pool.execute(`
        UPDATE chat_sessions 
        SET last_activity_at = NOW() 
        WHERE session_id = ? AND tenant_id = ?
      `, [sessionId, tenantId]);
    }
    
    // Add or update participant (with tenant_id)
    await pool.execute(`
      INSERT INTO chat_participants (tenant_id, session_id, user_id, user_type, user_name, joined_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        left_at = NULL,
        joined_at = NOW(),
        is_typing = FALSE
    `, [tenantId, sessionId, userId, userType, userName]);
    
    res.json({
      success: true,
      message: 'Joined chat session',
      data: { sessionId }
    });
  } catch (error) {
    console.error('Error joining chat session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to join chat session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update typing status
router.put('/typing', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { sessionId, userId, userType, isTyping } = req.body;
    
    // Validate inputs
    if (!sessionId || !userType || typeof isTyping !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, userType, isTyping'
      });
    }

    if (!['agent', 'customer'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userType. Must be agent or customer'
      });
    }

    // Check if session exists (tenant-filtered)
    const [sessions] = await pool.execute(
      'SELECT session_id FROM chat_sessions WHERE session_id = ? AND tenant_id = ? AND status = \'active\'',
      [sessionId, tenantId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found or inactive'
      });
    }
    
    await pool.execute(`
      UPDATE chat_participants 
      SET is_typing = ?, last_typing_at = ?
      WHERE session_id = ? AND tenant_id = ? AND user_id = ? AND user_type = ?
    `, [isTyping, isTyping ? new Date() : null, sessionId, tenantId, userId, userType]);
    
    res.json({
      success: true,
      message: 'Typing status updated'
    });
  } catch (error) {
    console.error('Error updating typing status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update typing status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Leave chat session
router.put('/session/leave', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { sessionId, userId, userType } = req.body;
    
    // Validate inputs
    if (!sessionId || !userType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionId, userType'
      });
    }

    if (!['agent', 'customer'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userType. Must be agent or customer'
      });
    }
    
    await pool.execute(`
      UPDATE chat_participants 
      SET left_at = NOW()
      WHERE session_id = ? AND tenant_id = ? AND user_id = ? AND user_type = ?
    `, [sessionId, tenantId, userId, userType]);
    
    res.json({
      success: true,
      message: 'Left chat session'
    });
  } catch (error) {
    console.error('Error leaving chat session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to leave chat session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get unread message count for a user
router.get('/unread/:ticketId/:userType', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { ticketId, userType } = req.params;
    
    // Validate inputs
    if (!ticketId || isNaN(ticketId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    if (!['agent', 'customer'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userType. Must be agent or customer'
      });
    }

    // Check if ticket exists (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT id FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const unreadCount = await ticketMessagesService.getUnreadCount(ticketId, tenantId, userType);

    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch unread count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 
