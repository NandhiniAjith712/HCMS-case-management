const { pool } = require('./database');
const ticketEventNotificationService = require('./services/ticketEventNotificationService');
const emailService = require('./services/emailService');

// Retry helper for connection errors (e.g. Aiven MySQL closes idle connections)
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

const weeklySummarySentKeyByTenant = new Map();

function getIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function sendWeeklyCeoSummaryIfDue() {
  try {
    const now = new Date();
    const day = now.getDay(); // 1=Monday
    const hour = now.getHours();
    // Weekly mail window: Monday 09:00 local hour.
    if (day !== 1 || hour !== 9) return;

    const weekKey = getIsoWeekKey(now);
    const [tenants] = await pool.execute(`SELECT id, name FROM tenants WHERE status = 'active'`);
    for (const tenant of tenants || []) {
      const tenantId = Number(tenant.id);
      const sentKey = weeklySummarySentKeyByTenant.get(tenantId);
      if (sentKey === weekKey) continue;

      const [ceoRows] = await pool.execute(
        `SELECT id, name, email
         FROM agents
         WHERE tenant_id = ? AND COALESCE(is_active, TRUE) = TRUE AND role = 'ceo'`,
        [tenantId]
      );
      if (!ceoRows.length) continue;

      const [totalsRows] = await pool.execute(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
           SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated_count,
           SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
           SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count
         FROM tickets
         WHERE tenant_id = ?`,
        [tenantId]
      );

      const [weeklyRows] = await pool.execute(
        `SELECT
           SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS created_last_7d,
           SUM(CASE WHEN status = 'closed' AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS closed_updated_last_7d,
           SUM(CASE WHEN status = 'escalated' AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS escalated_updated_last_7d,
           SUM(CASE WHEN status IN ('new','in_progress','escalated') AND LOWER(COALESCE(priority,'')) IN ('urgent','high') THEN 1 ELSE 0 END) AS critical_open_now
         FROM tickets
         WHERE tenant_id = ?`,
        [tenantId]
      );

      const summaryPayload = {
        tenantName: tenant.name,
        weekLabel: `Week ${weekKey}`,
        totals: totalsRows?.[0] || {},
        weekly: weeklyRows?.[0] || {}
      };

      for (const ceo of ceoRows) {
        if (!ceo?.email) continue;
        try {
          await emailService.sendCeoWeeklyTicketSummaryNotification(
            ceo.email,
            ceo.name || 'CEO',
            summaryPayload,
            emailService.getAppUrl()
          );
        } catch (e) {
          console.warn(`⚠️ CEO weekly summary failed (${ceo.email}):`, e?.message);
        }
      }

      weeklySummarySentKeyByTenant.set(tenantId, weekKey);
      if (weeklySummarySentKeyByTenant.size > 1000) {
        for (const [k, v] of weeklySummarySentKeyByTenant.entries()) {
          if (v !== weekKey) weeklySummarySentKeyByTenant.delete(k);
        }
      }
      console.log(`📊 Weekly CEO summary sent for tenant ${tenant.name} (${weekKey})`);
    }
  } catch (error) {
    console.error('❌ Error sending weekly CEO summary:', error?.message || error);
  }
}

// Auto-escalation function
async function autoEscalateBreachedTickets() {
  try {
    await withRetry(async () => {
    console.log(`🕐 [${new Date().toLocaleString()}] Checking for breached tickets...`);
    
    // Use MySQL NOW() for "now" so we compare same clock as created_at (avoids Node/MySQL timezone drift)
    const [rows] = await pool.execute('SELECT NOW() as now');
    const now = new Date(rows[0].now);
    
    // Get all tenants
    const [tenants] = await pool.execute('SELECT id, name FROM tenants WHERE status = \'active\'');
    
    if (tenants.length === 0) {
      console.log('✅ No active tenants found');
      return;
    }
    
    console.log(`🏢 Processing ${tenants.length} tenants`);
    
    let totalBreached = 0;
    let totalEscalated = 0;
    
    // Process each tenant separately
    for (const tenant of tenants) {
      const tenantId = tenant.id;
      console.log(`\n📋 Processing tenant: ${tenant.name} (ID: ${tenantId})`);
      
      // Get all active tickets with ticket-resolved SLA snapshot, timers, and assigned agent (for reminders)
      const [activeTickets] = await pool.execute(`
        SELECT t.*, p.name as product_name, m.name as module_name, 
               st.id as timer_id, st.timer_type, st.sla_deadline, st.status as timer_status,
               a.email as agent_email, a.name as agent_name
        FROM tickets t
        LEFT JOIN products p ON t.product_id = p.id AND p.tenant_id = t.tenant_id
        LEFT JOIN modules m ON t.module_id = m.id AND m.tenant_id = t.tenant_id
        LEFT JOIN sla_timers st ON t.id = st.ticket_id AND st.timer_type = 'response'
        LEFT JOIN agents a ON t.assigned_to = a.id AND a.tenant_id = t.tenant_id
        WHERE t.status IN ('new', 'in_progress') AND t.tenant_id = ?
        ORDER BY t.created_at ASC
      `, [tenantId]);

      if (activeTickets.length === 0) {
        console.log(`✅ No active tickets found for tenant ${tenant.name}`);
        continue;
      }

      console.log(`📋 Found ${activeTickets.length} active tickets to check for tenant ${tenant.name}`);

      // Get manager and CEO for notifications (tenant-filtered)
      const [managers] = await pool.execute(`
        SELECT id, name, email FROM agents WHERE role = 'support_manager' AND tenant_id = ? LIMIT 1
      `, [tenantId]);
      const [ceos] = await pool.execute(`
        SELECT id, name, email FROM agents WHERE role = 'ceo' AND tenant_id = ? LIMIT 1
      `, [tenantId]);

      const manager = managers.length > 0 ? managers[0] : null;
      const ceo = ceos.length > 0 ? ceos[0] : null;

      let breachedCount = 0;
      let escalatedCount = 0;
      let timerUpdatesCount = 0;

      for (const ticket of activeTickets) {
      // Avoid immediately re-escalating a ticket that was just reopened.
      // Reopen intentionally sets status=in_progress; give the assignee time to react before auto escalation.
      try {
        const reopenedAt = ticket.reopened_at ? new Date(ticket.reopened_at) : null;
        if (reopenedAt && Number.isFinite(reopenedAt.getTime())) {
          const mins = (now.getTime() - reopenedAt.getTime()) / (60 * 1000);
          if (mins >= 0 && mins < 20) {
            continue;
          }
        }
      } catch (_) {}

      // Compute separate deadlines for first response and resolution.
      // Customer reopen sets reopened_at and status=in_progress without changing created_at (reporting).
      // Breach checks must use the later of created_at vs reopened_at so stale SLAs do not immediately
      // flip the ticket back to escalated minutes after reopen.
      const responseTimeMinutes = ticket.sla_response_time_minutes || 480; // Default 8 hours response
      const resolutionTimeMinutes = ticket.sla_resolution_time_minutes || responseTimeMinutes || 480; // Default resolution
      let slaBaselineMs = new Date(ticket.created_at).getTime();
      try {
        const roMs = ticket.reopened_at ? new Date(ticket.reopened_at).getTime() : NaN;
        if (Number.isFinite(roMs)) {
          slaBaselineMs = Math.max(slaBaselineMs, roMs);
        }
      } catch (_) {}
      const ticketCreatedAt = new Date(slaBaselineMs);
      const responseDeadline = new Date(ticketCreatedAt.getTime() + (responseTimeMinutes * 60 * 1000));
      const resolutionDeadline = new Date(ticketCreatedAt.getTime() + (resolutionTimeMinutes * 60 * 1000));
      
      const isResponseBreached = now.getTime() > responseDeadline.getTime();
      const isResolutionBreached = now.getTime() > resolutionDeadline.getTime();
      const remainingResponseMinutes = Math.floor((responseDeadline.getTime() - now.getTime()) / (60 * 1000));

      // Send reminder to assigned agent when RESPONSE deadline is approaching (only if no first response yet)
      if (!ticket.first_response_at && ticket.agent_email && remainingResponseMinutes > 0 && !isResponseBreached) {
        const emailService = require('./services/emailService');
        const reminder30Sent = ticket.sla_reminder_30_sent === 1 || ticket.sla_reminder_30_sent === true;
        const reminder15Sent = ticket.sla_reminder_15_sent === 1 || ticket.sla_reminder_15_sent === true;

        if (remainingResponseMinutes <= 30 && remainingResponseMinutes > 15 && !reminder30Sent) {
          try {
            await emailService.sendAgentSLAReminderNotification(
              ticket.agent_email,
              ticket.agent_name,
              ticket.id,
              ticket.issue_title || 'Support Request',
              remainingResponseMinutes,
              false
            );
            await pool.execute('UPDATE tickets SET sla_reminder_30_sent = 1 WHERE id = ? AND tenant_id = ?', [ticket.id, tenantId]);
            console.log(`📧 SLA reminder (30min) sent to agent for ticket ${ticket.id}`);
          } catch (remErr) {
            console.warn(`⚠️ SLA reminder failed for ticket ${ticket.id}:`, remErr?.message);
          }
        } else if (remainingResponseMinutes <= 15 && !reminder15Sent) {
          try {
            await emailService.sendAgentSLAReminderNotification(
              ticket.agent_email,
              ticket.agent_name,
              ticket.id,
              ticket.issue_title || 'Support Request',
              remainingResponseMinutes,
              true
            );
            await pool.execute('UPDATE tickets SET sla_reminder_15_sent = 1 WHERE id = ? AND tenant_id = ?', [ticket.id, tenantId]);
            console.log(`📧 SLA URGENT reminder (15min) sent to agent for ticket ${ticket.id}`);
          } catch (remErr) {
            console.warn(`⚠️ SLA urgent reminder failed for ticket ${ticket.id}:`, remErr?.message);
          }
        }
      }

      // Update SLA timer status for RESPONSE SLA if it exists.
      // DB enum supports only: active | paused | completed | breached.
      // Keep "warning" as a computed/logged state, do not persist it as status.
      if (ticket.timer_id) {
        try {
          let newTimerStatus = 'active';
          if (isResponseBreached) {
            newTimerStatus = 'breached';
          } else if (now.getTime() > (responseDeadline.getTime() - (30 * 60 * 1000))) { // 30 minutes before response deadline
            if (process.env.INCOMING_EMAIL_DEBUG === '1') {
              console.log(`⏳ Timer ${ticket.timer_id} is in warning window (kept as 'active' in DB)`);
            }
          }
          
          if (newTimerStatus !== ticket.timer_status) {
            await pool.execute(`
              UPDATE sla_timers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?
            `, [newTimerStatus, ticket.timer_id, tenantId]);
            timerUpdatesCount++;
            console.log(`🔄 Updated timer ${ticket.timer_id} status to: ${newTimerStatus}`);
          }
        } catch (timerError) {
          console.error(`❌ Error updating timer ${ticket.timer_id}:`, timerError.message);
        }
      }
      
      // Escalate when response SLA is breached (before first response),
      // resolution SLA is breached, OR agent ETA is breached.
      const shouldEscalateForResponse = !ticket.first_response_at && isResponseBreached;
      const shouldEscalateForResolution = isResolutionBreached;
      const etaDueAt = ticket.eta_due_at ? new Date(ticket.eta_due_at) : null;
      const isEtaBreached = Boolean(etaDueAt && Number.isFinite(etaDueAt.getTime()) && now.getTime() > etaDueAt.getTime());
      const shouldEscalateForEta = isEtaBreached;
      if (shouldEscalateForResponse || shouldEscalateForResolution || shouldEscalateForEta) {
        breachedCount++;
        const breachReason = shouldEscalateForEta
          ? 'ETA exceeded (ticket not completed within committed ETA)'
          : (shouldEscalateForResponse
              ? 'SLA response time exceeded'
              : 'SLA resolution time exceeded');
        
        // Update ticket status to escalated (tenant-filtered)
        // Keep compatibility with deployments that may not yet have escalation_type.
        try {
          await pool.execute(`
            UPDATE tickets SET status = 'escalated', escalation_type = 'automatic' WHERE id = ? AND tenant_id = ?
          `, [ticket.id, tenantId]);
        } catch (updateError) {
          if (updateError?.code === 'ER_BAD_FIELD_ERROR') {
            await pool.execute(`
              UPDATE tickets SET status = 'escalated' WHERE id = ? AND tenant_id = ?
            `, [ticket.id, tenantId]);
          } else {
            throw updateError;
          }
        }
        
        escalatedCount++;

        try {
          const previousStatus = String(ticket.status || 'in_progress');
          await ticketEventNotificationService.notifySlaAutoEscalated({
            ticket: { ...ticket, status: 'escalated', status_before_escalation: previousStatus },
            tenantId,
            reason: breachReason,
            previousStatus
          });
        } catch (err) {
          console.warn(`⚠️ SLA escalation notifications failed for ticket ${ticket.id}:`, err?.message);
        }

        // Log escalation details
        console.log(`🚨 Auto-escalated ticket ${ticket.id}:`);
        console.log(`   - Product: ${ticket.product_name || ticket.product || 'Unknown'}`);
        console.log(`   - Module: ${ticket.module_name || ticket.module || 'Unknown'}`);
        console.log(`   - Response SLA: ${responseTimeMinutes} minutes`);
        console.log(`   - Resolution SLA: ${resolutionTimeMinutes} minutes`);
        if (etaDueAt && Number.isFinite(etaDueAt.getTime())) {
          console.log(`   - ETA due at: ${etaDueAt.toLocaleString()}`);
        }
        console.log(`   - Priority: ${ticket.priority_level || 'P2'}`);
        console.log(`   - Created: ${ticketCreatedAt.toLocaleString()}`);
        console.log(`   - Response deadline: ${responseDeadline.toLocaleString()}`);
        console.log(`   - Resolution deadline: ${resolutionDeadline.toLocaleString()}`);
        console.log(`   - Escalated to: ${manager ? manager.name : 'No manager found'}`);
        console.log(`   - CEO notified: ${ceo ? ceo.name : 'No CEO found'}`);
        console.log('   ---');
        }
      }

      // Send notification to CEO if available
      if (ceo && escalatedCount > 0) {
        console.log(`📧 CEO notification sent to: ${ceo.name} (${ceo.email})`);
        console.log(`📋 Summary: ${escalatedCount} tickets escalated due to SLA breach for tenant ${tenant.name}`);
      }

      console.log(`✅ Tenant ${tenant.name}: ${escalatedCount} tickets escalated out of ${breachedCount} breached`);
      console.log(`🔄 Timer status updates: ${timerUpdatesCount} timers updated`);
      
      totalBreached += breachedCount;
      totalEscalated += escalatedCount;
    }
    
    console.log(`\n✅ Auto-escalation completed for all tenants: ${totalEscalated} tickets escalated out of ${totalBreached} breached`);

    });
  } catch (error) {
    console.error('❌ Error in auto-escalation:', error);
  }
}

// Run auto-escalation and SLA reminders every 1 minute (so short SLAs e.g. 5 min get reminders before breach)
function startScheduledEscalation() {
  console.log('🚀 Starting scheduled auto-escalation system...');
  console.log('⏰ Will check for SLA reminders and breached tickets every 1 minute');
  console.log('🔄 Will update SLA timer statuses automatically');
  
  // Run immediately
  autoEscalateBreachedTickets();
  
  // Then run every 1 minute (catches 5-min SLA window for 30/15 min reminders)
  setInterval(autoEscalateBreachedTickets, 1 * 60 * 1000);

  // Weekly CEO summary check every hour (sends Monday 09:00 local, once/week/tenant).
  setInterval(sendWeeklyCeoSummaryIfDue, 60 * 60 * 1000);
  sendWeeklyCeoSummaryIfDue();
}

// Export the function for use in main server
module.exports = {
  startScheduledEscalation,
  autoEscalateBreachedTickets
}; 