/**
 * Unified Ticket Messages Service
 * All ticket communications (WhatsApp, Email, platform chat) are stored here.
 * Channel indicates origin: 'email' | 'whatsapp' | 'platform_chat'
 */
const { pool } = require('../../shared/database/database');

const CHANNELS = Object.freeze({ EMAIL: 'email', WHATSAPP: 'whatsapp', PLATFORM_CHAT: 'platform_chat' });
const SENDER_TYPES = Object.freeze({ USER: 'user', AGENT: 'agent', SYSTEM: 'system' });

/**
 * Add a message to the unified ticket conversation
 * @param {Object} opts
 * @param {number} opts.ticketId
 * @param {number} opts.tenantId
 * @param {string} opts.senderType - 'user' | 'agent' | 'system'
 * @param {string} opts.senderName
 * @param {string} opts.message
 * @param {string} opts.channel - 'email' | 'whatsapp' | 'platform_chat'
 * @param {number} [opts.senderId]
 * @param {string} [opts.externalId] - e.g. WhatsApp message ID
 * @returns {Promise<Object|null>} Inserted message or null
 */
async function addMessage({
  ticketId,
  tenantId,
  senderType,
  senderName,
  message,
  channel,
  senderId = null,
  externalId = null,
  isInternal = false,
  conversationKey = null,
  requiresAck = false
}) {
  try {
    if (!ticketId || !tenantId || !senderType || !senderName || !message || !channel) {
      console.error('ticketMessagesService.addMessage: missing required fields', { ticketId, tenantId, senderType, senderName, channel });
      return null;
    }
    if (!Object.values(CHANNELS).includes(channel)) {
      console.error('ticketMessagesService.addMessage: invalid channel', channel);
      return null;
    }
    if (!Object.values(SENDER_TYPES).includes(senderType)) {
      console.error('ticketMessagesService.addMessage: invalid senderType', senderType);
      return null;
    }

    const [result] = await pool.execute(
      `INSERT INTO ticket_messages (
         tenant_id, ticket_id, sender_type, sender_id, sender_name, message, channel, external_id,
         is_internal, conversation_key, requires_ack, acknowledged_at, acknowledged_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        tenantId,
        ticketId,
        senderType,
        senderId,
        senderName,
        message,
        channel,
        externalId || null,
        !!isInternal,
        conversationKey || null,
        !!requiresAck
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM ticket_messages WHERE id = ?', [result.insertId]);

    // Best-effort: track last agent reply timestamp for customer escalation trigger.
    if (senderType === SENDER_TYPES.AGENT) {
      try {
        await pool.execute(
          'UPDATE tickets SET last_agent_reply_at = NOW(), updated_at = updated_at WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)',
          [ticketId, tenantId]
        );
      } catch (e) {
        // Column may not exist yet on older DBs; ignore.
        if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('ticketMessagesService.addMessage: last_agent_reply_at update failed:', e?.message);
        }
      }
    }
    return rows[0] || null;
  } catch (error) {
    console.error('ticketMessagesService.addMessage error:', error);
    return null;
  }
}

/**
 * Get all messages for a ticket in chronological order (unified thread)
 * @param {number} ticketId
 * @param {number} [tenantId] - optional for tenant filtering
 * @returns {Promise<Array>}
 */
async function getMessages(ticketId, tenantId = null, excludeInternal = false, conversationKey = null) {
  try {
    let query = `
      SELECT id, ticket_id, sender_type, sender_id, sender_name, message, channel, external_id,
             COALESCE(is_internal, FALSE) as is_internal,
             COALESCE(requires_ack, FALSE) as requires_ack,
             acknowledged_at,
             acknowledged_by,
             created_at
      FROM ticket_messages
      WHERE ticket_id = ?
    `;
    const params = [ticketId];
    if (tenantId != null) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    if (excludeInternal) {
      query += ' AND (is_internal IS NULL OR is_internal = FALSE)';
    }
    if (conversationKey) {
      // General messages (null or empty conversation_key) represent emails, WhatsApp,
      // and standard platform messages. They should be visible in customer-facing threads.
      if (conversationKey.includes('user:')) {
        query += ` AND (conversation_key = ? OR conversation_key IS NULL OR conversation_key = '')`;
      } else {
        // Staff-only internal chat (e.g. Agent<->Manager): strict isolation
        query += ` AND conversation_key = ?`;
      }
      params.push(conversationKey);
    }
    query += ' ORDER BY created_at ASC';

    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('ticketMessagesService.getMessages error:', error);
    return [];
  }
}

async function getUnacknowledgedCustomerNotices({ ticketId, tenantId, conversationKey = null }) {
  try {
    let query = `
      SELECT id, ticket_id, sender_type, sender_id, sender_name, message, channel,
             COALESCE(requires_ack, FALSE) as requires_ack,
             acknowledged_at,
             acknowledged_by,
             created_at
      FROM ticket_messages
      WHERE ticket_id = ?
        AND tenant_id = ?
        AND sender_type = 'agent'
        AND (is_internal IS NULL OR is_internal = FALSE)
        AND COALESCE(requires_ack, FALSE) = TRUE
        AND acknowledged_at IS NULL
    `;
    const params = [ticketId, tenantId];
    if (conversationKey) {
      query += ` AND (conversation_key = ? OR (conversation_key IS NULL OR conversation_key = ''))`;
      params.push(conversationKey);
    }
    query += ' ORDER BY created_at ASC';
    const [rows] = await pool.execute(query, params);
    return rows || [];
  } catch (e) {
    console.error('ticketMessagesService.getUnacknowledgedCustomerNotices error:', e);
    return [];
  }
}

async function acknowledgeMessage({ messageId, tenantId, acknowledgedBy }) {
  try {
    const [result] = await pool.execute(
      `UPDATE ticket_messages
       SET acknowledged_at = NOW(), acknowledged_by = ?
       WHERE id = ? AND tenant_id = ? AND COALESCE(requires_ack, FALSE) = TRUE AND acknowledged_at IS NULL`,
      [String(acknowledgedBy || '').slice(0, 255) || null, messageId, tenantId]
    );
    return result.affectedRows > 0;
  } catch (e) {
    console.error('ticketMessagesService.acknowledgeMessage error:', e);
    return false;
  }
}

/**
 * Update a message by id
 */
async function updateMessage(id, tenantId, { senderName, message }) {
  try {
    const [result] = await pool.execute(
      'UPDATE ticket_messages SET sender_name = ?, message = ? WHERE id = ? AND tenant_id = ?',
      [senderName, message, id, tenantId]
    );
    if (result.affectedRows === 0) return null;
    const [rows] = await pool.execute('SELECT * FROM ticket_messages WHERE id = ?', [id]);
    return rows[0] || null;
  } catch (error) {
    console.error('ticketMessagesService.updateMessage error:', error);
    return null;
  }
}

/**
 * Mark messages as read for a ticket (from other users' perspective)
 */
async function markAsRead(ticketId, tenantId, excludeSenderType) {
  try {
    const [result] = await pool.execute(
      `UPDATE ticket_messages SET is_read = TRUE, read_at = NOW()
       WHERE ticket_id = ? AND tenant_id = ? AND sender_type != ? AND (is_read IS NULL OR is_read = FALSE)`,
      [ticketId, tenantId, excludeSenderType === 'customer' ? 'user' : excludeSenderType]
    );
    return result.affectedRows;
  } catch (error) {
    console.error('ticketMessagesService.markAsRead error:', error);
    return 0;
  }
}

/**
 * Get unread message count for a ticket
 */
async function getUnreadCount(ticketId, tenantId, excludeSenderType) {
  try {
    const st = excludeSenderType === 'customer' ? 'user' : excludeSenderType;
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM ticket_messages
       WHERE ticket_id = ? AND tenant_id = ? AND sender_type != ? AND (is_read IS NULL OR is_read = FALSE)`,
      [ticketId, tenantId, st]
    );
    return rows[0]?.count || 0;
  } catch (error) {
    console.error('ticketMessagesService.getUnreadCount error:', error);
    return 0;
  }
}

/**
 * Delete a message by id
 */
async function deleteMessage(id, tenantId) {
  try {
    const [result] = await pool.execute(
      'DELETE FROM ticket_messages WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('ticketMessagesService.deleteMessage error:', error);
    return false;
  }
}

/**
 * Map legacy sender_type 'customer' to 'user' for compatibility
 */
function normalizeSenderType(senderType) {
  if (senderType === 'customer') return SENDER_TYPES.USER;
  if (Object.values(SENDER_TYPES).includes(senderType)) return senderType;
  return SENDER_TYPES.USER;
}

module.exports = {
  addMessage,
  getMessages,
  updateMessage,
  deleteMessage,
  markAsRead,
  getUnreadCount,
  getUnacknowledgedCustomerNotices,
  acknowledgeMessage,
  CHANNELS,
  SENDER_TYPES,
  normalizeSenderType
};
