/**
 * Auto-closure workflow for customer inactivity
 * In-progress tickets:
 * - 12h: Reminder 1 - Please respond
 * - 24h: Reminder 2 - May be closed if no response
 * - 36h: Reminder 3 - Final reminder
 * - No forced closure without customer confirmation
 *
 * Resolved (pending confirmation) tickets:
 * - 48h: Reminder to confirm resolution
 * - No forced closure without customer confirmation
 */
const { pool } = require('./database');

const CONN_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST'];
const withRetry = async (fn, maxAttempts = 3) => {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isConnError = CONN_ERROR_CODES.includes(err?.code) || err?.message?.includes('ECONNRESET');
      if (isConnError && attempt < maxAttempts) {
        console.warn(`⚠️ DB connection error (attempt ${attempt}/${maxAttempts}): ${err?.message || err}`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
};

async function processInactivityWorkflow() {
  try {
    await withRetry(async () => {
      console.log(`🕐 [${new Date().toLocaleString()}] Checking for customer inactivity...`);
      const now = new Date();

      const [tenants] = await pool.execute('SELECT id, name FROM tenants WHERE status = \'active\'');
      if (tenants.length === 0) return;

      for (const tenant of tenants) {
        const tenantId = tenant.id;

        // Tickets where agent has responded, status is open, and we haven't already closed
        const [tickets] = await pool.execute(`
          SELECT t.id, t.email, t.name, t.mobile, t.issue_title, t.first_response_at, t.resolved_at,
                 COALESCE(t.inactivity_reminder_level, 0) as level
          FROM tickets t
          WHERE t.first_response_at IS NOT NULL 
            AND t.status IN ('new', 'in_progress', 'escalated', 'resolved')
            AND t.tenant_id = ?
            AND (t.inactivity_reminder_level IS NULL OR t.inactivity_reminder_level < 4)
        `, [tenantId]);

        if (tickets.length === 0) continue;

        for (const ticket of tickets) {
          const level = ticket.level || 0;

          // Get last agent message time (non-internal)
          const [lastAgentMsg] = await pool.execute(`
            SELECT MAX(created_at) as last_at FROM ticket_messages
            WHERE ticket_id = ? AND tenant_id = ? 
              AND sender_type = 'agent' 
              AND (is_internal IS NULL OR is_internal = FALSE)
          `, [ticket.id, tenantId]);

          const baseTime = ticket.status === 'resolved'
            ? (ticket.resolved_at ? new Date(ticket.resolved_at) : null)
            : null;
          const lastAgentAt = baseTime || (lastAgentMsg[0]?.last_at
            ? new Date(lastAgentMsg[0].last_at)
            : ticket.first_response_at
              ? new Date(ticket.first_response_at)
              : null);

          if (!lastAgentAt) continue;

          const hoursSince = (now.getTime() - lastAgentAt.getTime()) / (1000 * 60 * 60);

          const closeThreshold = ticket.status === 'resolved' ? 72 : 48;
          const reminder3Threshold = ticket.status === 'resolved' ? 48 : 36;
          if (hoursSince >= closeThreshold && level < 4) {
            // Final reminder stage only (do not auto-close; wait for customer confirmation).
            await sendReminders(ticket, 3, tenantId);
            await pool.execute(
              'UPDATE tickets SET inactivity_reminder_level = 4 WHERE id = ? AND tenant_id = ?',
              [ticket.id, tenantId]
            );
            console.log(`📋 Ticket ${ticket.id} reached inactivity threshold (${closeThreshold}h) - waiting for customer confirmation (not auto-closed)`);
          } else if (hoursSince >= reminder3Threshold && level < 3) {
            // Reminder 3
            await sendReminders(ticket, 3, tenantId);
            await pool.execute('UPDATE tickets SET inactivity_reminder_level = 3 WHERE id = ? AND tenant_id = ?', [ticket.id, tenantId]);
            console.log(`📧 Inactivity reminder 3 sent for ticket ${ticket.id}`);
          } else if (hoursSince >= 24 && level < 2) {
            // Reminder 2
            await sendReminders(ticket, 2, tenantId);
            await pool.execute('UPDATE tickets SET inactivity_reminder_level = 2 WHERE id = ? AND tenant_id = ?', [ticket.id, tenantId]);
            console.log(`📧 Inactivity reminder 2 sent for ticket ${ticket.id}`);
          } else if (hoursSince >= 12 && level < 1) {
            // Reminder 1
            await sendReminders(ticket, 1, tenantId);
            await pool.execute('UPDATE tickets SET inactivity_reminder_level = 1 WHERE id = ? AND tenant_id = ?', [ticket.id, tenantId]);
            console.log(`📧 Inactivity reminder 1 sent for ticket ${ticket.id}`);
          }
        }
      }
      console.log(`✅ Inactivity workflow completed`);
    });
  } catch (error) {
    console.error('❌ Error in inactivity workflow:', error);
  }
}

async function sendReminders(ticket, level, tenantId) {
  const emailService = require('./services/emailService');
  const { sendInactivityReminder } = require('./utils/whatsapp-notifications');

  if (ticket.email) {
    await emailService.sendInactivityReminder(
      ticket.email,
      ticket.name,
      ticket.id,
      ticket.issue_title || 'Support Request',
      level
    );
  }
  if (ticket.mobile) {
    await sendInactivityReminder(
      { id: ticket.id, mobile: ticket.mobile, email: ticket.email, name: ticket.name },
      level
    );
  }
}

function startScheduledInactivity() {
  console.log('🚀 Starting scheduled inactivity workflow...');
  console.log('⏰ Will check every 30 minutes (12h, 24h, 36h, 48h reminders)');
  processInactivityWorkflow();
  setInterval(processInactivityWorkflow, 30 * 60 * 1000);
}

module.exports = {
  startScheduledInactivity,
  processInactivityWorkflow
};
