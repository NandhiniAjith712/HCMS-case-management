/**
 * Ticket Activity Service - Log manager override actions
 */
const { pool } = require('../database');

const ACTIONS = Object.freeze({
  STATUS_OVERRIDE: 'status_override',
  REASSIGN: 'reassign',
  INTERNAL_NOTE: 'internal_note',
  REPLY: 'reply',
  PRIORITY_CHANGE: 'priority_change',
  /** Structured lifecycle / notification events (single source of truth for ticket comms) */
  TICKET_LIFECYCLE_EVENT: 'ticket_lifecycle_event'
});

async function logActivity({ ticketId, tenantId, action, performedBy, performedByName, details = {} }, connection = null) {
  try {
    const db = connection || pool;
    const [result] = await db.execute(
      `INSERT INTO ticket_activity (tenant_id, ticket_id, action, performed_by, performed_by_name, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId || 1, ticketId || null, action || null, performedBy || null, performedByName || null, details ? JSON.stringify(details) : null]
    );
    return result.insertId;
  } catch (error) {
    console.error('ticketActivityService.logActivity error:', error);
    return null;
  }
}

async function getActivity(ticketId, tenantId = null) {
  try {
    let query = 'SELECT * FROM ticket_activity WHERE ticket_id = ?';
    const params = [ticketId];
    if (tenantId != null) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('ticketActivityService.getActivity error:', error);
    return [];
  }
}

module.exports = {
  logActivity,
  getActivity,
  ACTIONS
};
