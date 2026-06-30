const { pool } = require('../../shared/database/database');
const appNotificationService = require('./appNotificationService');
const emailService = require('./emailService');
const caseNotificationService = require('./caseNotificationService');

// Retry helper for connection errors
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

// Track sent warnings to avoid duplicates
const sentWarningsByTimer = new Map();

async function checkSLATimers() {
  try {
    await withRetry(async () => {
      const now = new Date();
      
      // Get active SLA timers that need checking
      const [timers] = await pool.execute(`
        SELECT st.id, st.ticket_id, st.sla_configuration_id, st.timer_type,
               st.start_time, st.sla_deadline, st.status,
               sc.escalation_warning_threshold_minutes, sc.escalation_breach_threshold_minutes,
               sc.escalation_level, sc.department_id,
               c.title as ticket_title, c.status as ticket_status,
               d.name as department_name
        FROM sla_timers st
        JOIN sla_configurations sc ON st.sla_configuration_id = sc.id
        JOIN cases c ON st.ticket_id = c.id
        LEFT JOIN departments d ON sc.department_id = d.id
        WHERE st.status = 'active'
          AND st.sla_deadline IS NOT NULL
      `);

      for (const timer of timers) {
        const warningKey = `${timer.id}_warning`;
        const breachKey = `${timer.id}_breach`;
        
        const deadline = new Date(timer.sla_deadline);
        const timeUntilDeadline = deadline - now;
        const minutesUntilDeadline = timeUntilDeadline / (1000 * 60);
        
        // Check warning threshold (escalation_warning_threshold_minutes from start)
        if (timer.escalation_warning_threshold_minutes && !sentWarningsByTimer.has(warningKey)) {
          const startTime = new Date(timer.start_time);
          const elapsedMinutes = (now - startTime) / (1000 * 60);
          
          if (elapsedMinutes >= timer.escalation_warning_threshold_minutes) {
            await sendWarningNotification(timer, elapsedMinutes);
            sentWarningsByTimer.set(warningKey, true);
          }
        }
        
        // Check breach threshold (escalation_breach_threshold_minutes from start)
        if (timer.escalation_breach_threshold_minutes && !sentWarningsByTimer.has(breachKey)) {
          const startTime = new Date(timer.start_time);
          const elapsedMinutes = (now - startTime) / (1000 * 60);
          
          if (elapsedMinutes >= timer.escalation_breach_threshold_minutes) {
            await handleBreachEscalation(timer);
            sentWarningsByTimer.set(breachKey, true);
          }
        }
      }
    });
  } catch (error) {
    console.error('Error checking SLA timers:', error);
  }
}

async function sendWarningNotification(timer, elapsedMinutes) {
  try {
    const tenantId = 1; // Default tenant
    
    // Get assigned agent and department head
    const [assignees] = await pool.execute(`
      SELECT a.id, a.name, a.email, a.role
      FROM ticket_allocations ta
      JOIN agents a ON ta.agent_id = a.id
      WHERE ta.ticket_id = ?
    `, [timer.ticket_id]);
    
    const [deptHead] = await pool.execute(`
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN departments d ON d.head_id = u.id
      WHERE d.id = ?
    `, [timer.department_id]);
    
    const recipients = [...assignees];
    if (deptHead.length > 0) {
      recipients.push({ ...deptHead[0], role: 'department_head' });
    }
    
    // Send in-app notification
    for (const recipient of recipients) {
      await appNotificationService.insertNotification(pool, {
        tenantId,
        recipientStaffId: recipient.id,
        recipientRole: recipient.role,
        title: `SLA Warning: ${timer.ticket_title}`,
        description: `SLA timer for ${timer.timer_type} is approaching threshold (${elapsedMinutes.toFixed(0)} minutes elapsed). Please respond soon.`,
        type: 'SLA_ALERT',
        ticketId: timer.ticket_id
      });
    }
    
    // Send email notifications
    for (const recipient of recipients) {
      if (recipient.email) {
        try {
          await emailService.sendSLAWarningNotification(
            recipient.email,
            recipient.name,
            {
              ticketId: timer.ticket_id,
              ticketTitle: timer.ticket_title,
              timerType: timer.timer_type,
              elapsedMinutes: elapsedMinutes.toFixed(0),
              departmentName: timer.department_name
            },
            emailService.getAppUrl()
          );
        } catch (emailErr) {
          console.warn(`Failed to send SLA warning email to ${recipient.email}:`, emailErr.message);
        }
      }
    }
    
    // HCMS v2 case notification
    try {
      await caseNotificationService.notifySLAWarning(timer.ticket_id);
    } catch (emailErr) {
      console.warn(`Failed to send HCMS SLA warning email for ticket ${timer.ticket_id}:`, emailErr.message);
    }

    console.log(`✅ SLA warning sent for timer ${timer.id}, ticket ${timer.ticket_id}`);
  } catch (error) {
    console.error('Error sending SLA warning notification:', error);
  }
}

async function handleBreachEscalation(timer) {
  try {
    const tenantId = 1; // Default tenant
    
    // Get department head
    const [deptHead] = await pool.execute(`
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN departments d ON d.head_id = u.id
      WHERE d.id = ?
    `, [timer.department_id]);
    
    if (deptHead.length === 0) {
      console.warn(`No department head found for department ${timer.department_id}, cannot escalate`);
      return;
    }
    
    const head = deptHead[0];
    
    // Update timer status to breached
    await pool.execute(
      `UPDATE sla_timers SET status = 'breached', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [timer.id]
    );
    
    // Create escalation record
    const [escalationResult] = await pool.execute(
      `INSERT INTO escalations (ticket_id, sla_timer_id, from_level, to_level, reason, escalated_by, escalated_at, status)
       VALUES (?, ?, 'agent', 'department_head', ?, ?, CURRENT_TIMESTAMP, 'pending')`,
      [timer.ticket_id, timer.id, `SLA breach: ${timer.timer_type} deadline exceeded`, head.id]
    );
    
    // Update ticket status to escalated
    await pool.execute(
      `UPDATE tickets SET status = 'escalated', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [timer.ticket_id]
    );
    
    // Send in-app notification to department head
    await appNotificationService.insertNotification(pool, {
      tenantId,
      recipientStaffId: head.id,
      recipientRole: 'department_head',
      title: `SLA Breach Escalation: ${timer.ticket_title}`,
      description: `SLA timer for ${timer.timer_type} has exceeded the breach threshold. Ticket has been escalated to you.`,
      type: 'MANAGER_ALERT',
      ticketId: timer.ticket_id
    });
    
    // Send email to department head
    if (head.email) {
      try {
        await emailService.sendSLABreachEscalationNotification(
          head.email,
          head.name,
          {
            ticketId: timer.ticket_id,
            ticketTitle: timer.ticket_title,
            timerType: timer.timer_type,
            departmentName: timer.department_name
          },
          emailService.getAppUrl()
        );
      } catch (emailErr) {
        console.warn(`Failed to send SLA breach email to ${head.email}:`, emailErr.message);
      }
    }
    
    // HCMS v2 case notification
    try {
      await caseNotificationService.notifySLABreach(timer.ticket_id);
    } catch (emailErr) {
      console.warn(`Failed to send HCMS SLA breach email for ticket ${timer.ticket_id}:`, emailErr.message);
    }

    console.log(`✅ SLA breach escalation created for timer ${timer.id}, ticket ${timer.ticket_id}, escalated to department head ${head.name}`);
  } catch (error) {
    console.error('Error handling SLA breach escalation:', error);
  }
}

function startSLAMonitoring() {
  console.log('🚀 Starting SLA monitoring service (runs every minute)');
  
  // Run immediately on start
  checkSLATimers();
  
  // Then run every minute
  const intervalId = setInterval(checkSLATimers, 60000);
  
  return intervalId;
}

module.exports = {
  startSLAMonitoring,
  checkSLATimers
};
