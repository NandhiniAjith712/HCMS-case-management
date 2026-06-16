const { pool } = require('../database/database');
const emailService = require('../../case_management/services/emailService');
const { syncExecutiveAgentLevelsToNull } = require('./agentLevelSync');

const SUPPORT_LEVELS = ['L1', 'L2', 'L3', 'MANAGER'];

/** New tickets must only go to frontline support accounts — not CEO/manager rows (they often have NULL level, which COALESCE would treat as L1). */
// NOTE: Do not use a table alias here: some queries don't alias `agents` as `a`.
const AUTO_ASSIGN_ROLE_SQL = `AND LOWER(COALESCE(role, '')) IN ('support_agent', 'agent')`;

let assignmentSchemaEnsured = false;
const ensureAssignmentSchema = async (connection) => {
  if (!assignmentSchemaEnsured) {
  try {
    await connection.execute(
      "ALTER TABLE agents ADD COLUMN level ENUM('L1','L2','L3') NULL DEFAULT NULL AFTER role"
    );
  } catch (schemaErr) {
    if (schemaErr.code !== 'ER_DUP_FIELDNAME') {
      console.warn('⚠️ Could not ensure agents.level column:', schemaErr.message);
    }
  }
  try {
    await connection.execute(
      "ALTER TABLE agents MODIFY COLUMN level ENUM('L1','L2','L3','MANAGER') NULL DEFAULT NULL"
    );
  } catch (e) {
    console.warn('⚠️ Could not widen agents.level for migration:', e?.message || e);
  }
  try {
    await connection.execute(`UPDATE agents SET level = 'L1' WHERE level = 'MANAGER'`);
  } catch (e) {
    console.warn('⚠️ Could not remap agents.level MANAGER:', e?.message || e);
  }
  try {
    await connection.execute(
      "ALTER TABLE agents MODIFY COLUMN level ENUM('L1','L2','L3') NULL DEFAULT NULL"
    );
  } catch (e) {
    console.warn('⚠️ Could not finalize agents.level enum:', e?.message || e);
  }
  try {
    await connection.execute(`
      UPDATE agents SET level = 'L1'
      WHERE level IS NULL
        AND LOWER(COALESCE(role, '')) NOT IN ('support_manager', 'manager', 'ceo', 'admin')
    `);
  } catch (e) {
    console.warn('⚠️ Could not backfill agents.level for line agents:', e?.message || e);
  }
  try {
    await connection.execute(
      "ALTER TABLE tickets ADD COLUMN current_level ENUM('L1','L2','L3','MANAGER') NOT NULL DEFAULT 'L1' AFTER assigned_to"
    );
  } catch (schemaErr) {
    if (schemaErr.code !== 'ER_DUP_FIELDNAME') {
      console.warn('⚠️ Could not ensure tickets.current_level column:', schemaErr.message);
    }
  }
  try {
    await connection.execute(
      'ALTER TABLE tickets ADD COLUMN current_owner_id INT NULL AFTER current_level'
    );
  } catch (schemaErr) {
    if (schemaErr.code !== 'ER_DUP_FIELDNAME') {
      console.warn('⚠️ Could not ensure tickets.current_owner_id column:', schemaErr.message);
    }
  }
  try {
    await connection.execute(
      `UPDATE tickets
       SET current_owner_id = COALESCE(current_owner_id, assigned_to),
           current_level = COALESCE(current_level, 'L1')
       WHERE current_owner_id IS NULL OR current_level IS NULL`
    );
  } catch (e) {
    console.warn('⚠️ Could not backfill tickets current owner/level:', e?.message || e);
  }
  assignmentSchemaEnsured = true;
  }
  await syncExecutiveAgentLevelsToNull();
};

/**
 * Equal Ticket Assignment System
 *
 * This system ensures that tickets are distributed equally among all active agents.
 * When a new ticket is created, it's automatically assigned to the agent with the least number of active tickets.
 * This ensures fair workload distribution and scales automatically when new agents are added.
 *
 * IMPORTANT: Workload count uses tickets.assigned_to (not ticket_assignments) because
 * ticket_assignments may have FK constraints that reference users(id) while assignments
 * use agents.id - causing inserts to fail and workload counts to be wrong.
 */

class TicketAssignmentService {

  /**
   * Get the agent with the least number of active tickets (equal distribution)
   * Counts from tickets.assigned_to - the source of truth that is always updated.
   * @param {number} tenantId - The tenant ID for filtering
   * @param {string} level - Support level L1, L2, L3
   * @param {number} departmentId - Optional department ID to match agent primary department
   * @returns {Promise<Object|null>} Agent object or null if no agent found
   */
  static async getAgentWithLeastTickets(tenantId, level = 'L1', departmentId = null) {
    const connection = await pool.getConnection();

    try {
      await ensureAssignmentSchema(connection);
      try {
        await connection.execute(
          "ALTER TABLE agents ADD COLUMN availability_status ENUM('available', 'unavailable', 'on_leave') NOT NULL DEFAULT 'available' AFTER is_active"
        );
      } catch (schemaErr) {
        if (schemaErr.code !== 'ER_DUP_FIELDNAME') {
          console.warn('⚠️ Could not ensure agents.availability_status column:', schemaErr.message);
        }
      }

      const targetLevel = SUPPORT_LEVELS.includes(String(level || '').toUpperCase())
        ? String(level).toUpperCase()
        : 'L1';
      // Count active tickets from effective owner (current_owner_id fallback assigned_to)
      // This is the source of truth - ticket_assignments can fail to insert due to agents vs users FK mismatch
      console.log(`🎯 Selecting ${targetLevel} agent with the fewest active tickets (department: ${departmentId})...`);

      let [agents] = [];
      try {
        let sql = `
          SELECT
            a.id,
            a.name,
            a.email,
            a.role,
            a.is_active,
            COALESCE(workload_counts.active_tickets, 0) as active_tickets
          FROM agents a
          LEFT JOIN (
            SELECT
              COALESCE(t.current_owner_id, t.assigned_to) as agent_id,
              COUNT(*) as active_tickets
            FROM tickets t
            WHERE COALESCE(t.current_owner_id, t.assigned_to) IS NOT NULL
              AND t.status IN ('new', 'in_progress', 'escalated')
              AND (t.tenant_id = ? OR t.tenant_id IS NULL)
            GROUP BY COALESCE(t.current_owner_id, t.assigned_to)
          ) workload_counts ON a.id = workload_counts.agent_id
          WHERE a.is_active = TRUE
            AND COALESCE(a.level, 'L1') = ?
            AND COALESCE(a.availability_status, 'available') = 'available'
            AND (a.tenant_id = ? OR a.tenant_id IS NULL)
            ${AUTO_ASSIGN_ROLE_SQL}
        `;
        const params = [tenantId, targetLevel, tenantId];
        if (departmentId) {
          sql += ` AND a.primary_department_id = ?`;
          params.push(departmentId);
        }
        sql += ` ORDER BY active_tickets ASC, a.id ASC LIMIT 1`;

        [agents] = await connection.execute(sql, params);
      } catch (colErr) {
        // Fallback: agents table may not have tenant_id (older schema)
        if (colErr.code === 'ER_BAD_FIELD_ERROR' && colErr.message && colErr.message.includes('tenant_id')) {
          console.log('⚠️ agents.tenant_id missing, using tenant-agnostic query');
          let sql = `
            SELECT a.id, a.name, a.email, a.role, a.is_active,
                   COALESCE((SELECT COUNT(*) FROM tickets t
                            WHERE COALESCE(t.current_owner_id, t.assigned_to) = a.id AND t.status IN ('new', 'in_progress', 'escalated')
                             AND (t.tenant_id = ? OR t.tenant_id IS NULL)), 0) as active_tickets
            FROM agents a
            WHERE a.is_active = TRUE
              AND COALESCE(a.level, 'L1') = ?
              AND COALESCE(a.availability_status, 'available') = 'available'
              ${AUTO_ASSIGN_ROLE_SQL}
          `;
          const params = [tenantId, targetLevel];
          if (departmentId) {
            sql += ` AND a.primary_department_id = ?`;
            params.push(departmentId);
          }
          sql += ` ORDER BY active_tickets ASC, a.id ASC LIMIT 1`;
          [agents] = await connection.execute(sql, params);
        } else if (colErr.code === 'ER_BAD_FIELD_ERROR' && colErr.message && colErr.message.includes('availability_status')) {
          console.log('⚠️ agents.availability_status missing, using legacy assignment query');
          let sql = `
            SELECT a.id, a.name, a.email, a.role, a.is_active,
                   COALESCE((SELECT COUNT(*) FROM tickets t
                            WHERE COALESCE(t.current_owner_id, t.assigned_to) = a.id AND t.status IN ('new', 'in_progress', 'escalated')
                             AND (t.tenant_id = ? OR t.tenant_id IS NULL)), 0) as active_tickets
            FROM agents a
            WHERE a.is_active = TRUE AND COALESCE(a.level, 'L1') = ?
              ${AUTO_ASSIGN_ROLE_SQL}
          `;
          const params = [tenantId, targetLevel];
          if (departmentId) {
            sql += ` AND a.primary_department_id = ?`;
            params.push(departmentId);
          }
          sql += ` ORDER BY active_tickets ASC, a.id ASC LIMIT 1`;
          [agents] = await connection.execute(sql, params);
        } else {
          throw colErr;
        }
      }

      if (agents.length === 0) {
        console.log(`⚠️ No active ${targetLevel} agents found for tenant ${tenantId}.`);
        return null;
      }

      const selectedAgent = agents[0];
      console.log(`🎯 Selected agent: ${selectedAgent.name} (ID: ${selectedAgent.id}) with ${selectedAgent.active_tickets} active tickets`);
      return selectedAgent;

    } catch (error) {
      console.error('❌ Error getting agent with least tickets:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Fallback: get any support agent with least tickets (ignores tenant)
   * Used when no tenant-matched agents exist. Counts from tickets.assigned_to.
   */
  static async _getAnyAgentWithLeastTickets(connection, level = 'L1', departmentId = null) {
    try {
      const targetLevel = SUPPORT_LEVELS.includes(String(level || '').toUpperCase())
        ? String(level).toUpperCase()
        : 'L1';
      const ticketCountSubquery = '(SELECT COUNT(*) FROM tickets t WHERE COALESCE(t.current_owner_id, t.assigned_to) = a.id AND t.status IN (\'new\', \'in_progress\', \'escalated\'))';
      
      let sql = `
            SELECT a.id, a.name, a.email, a.role, a.is_active,
                   COALESCE(${ticketCountSubquery}, 0) as active_tickets
            FROM agents a
            WHERE a.is_active = TRUE
              AND COALESCE(a.level, 'L1') = ?
              AND COALESCE(a.availability_status, 'available') = 'available'
              ${AUTO_ASSIGN_ROLE_SQL}
      `;
      const params = [targetLevel];
      if (departmentId) {
        sql += ` AND a.primary_department_id = ?`;
        params.push(departmentId);
      }
      sql += ` ORDER BY active_tickets ASC, a.id ASC LIMIT 1`;

      const [agents] = await connection.execute(sql, params);
      if (agents.length > 0) {
        console.log(`🎯 Fallback: selected agent ${agents[0].name} (ID: ${agents[0].id}) across all tenants`);
        return agents[0];
      }
      return null;
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR' && e.message && e.message.includes('availability_status')) {
        try {
          const targetLevel = SUPPORT_LEVELS.includes(String(level || '').toUpperCase())
            ? String(level).toUpperCase()
            : 'L1';
          const ticketCountSubquery = '(SELECT COUNT(*) FROM tickets t WHERE COALESCE(t.current_owner_id, t.assigned_to) = a.id AND t.status IN (\'new\', \'in_progress\', \'escalated\'))';
          
          let sql = `
            SELECT a.id, a.name, a.email, a.role, a.is_active,
                   COALESCE(${ticketCountSubquery}, 0) as active_tickets
            FROM agents a
            WHERE a.is_active = TRUE AND COALESCE(a.level, 'L1') = ?
              ${AUTO_ASSIGN_ROLE_SQL}
          `;
          const params = [targetLevel];
          if (departmentId) {
            sql += ` AND a.primary_department_id = ?`;
            params.push(departmentId);
          }
          sql += ` ORDER BY active_tickets ASC, a.id ASC LIMIT 1`;

          const [legacyAgents] = await connection.execute(sql, params);
          return legacyAgents[0] || null;
        } catch (_) {
          // fall through to original warning below
        }
      }
      console.warn('⚠️ _getAnyAgentWithLeastTickets failed:', e.message);
      return null;
    }
  }

  /**
   * Assign a ticket to an agent using equal distribution
   * @param {number} ticketId - The ticket ID to assign
   * @param {number} assignedBy - The ID of the user/agent making the assignment
   * @param {number} tenantId - The tenant ID for filtering
   * @returns {Promise<Object>} Assignment result
   */
  static async assignTicketEqually(ticketId, assignedBy = null, tenantId = 1) {
    const connection = await pool.getConnection();
    
    try {
      await ensureAssignmentSchema(connection);
      // assigned_by has FK to agents.id; ensure non-agent values never break assignment
      let safeAssignedBy = null;
      if (assignedBy !== null && assignedBy !== undefined) {
        const [agentRows] = await connection.execute(
          'SELECT id FROM agents WHERE id = ? LIMIT 1',
          [assignedBy]
        );
        safeAssignedBy = agentRows.length > 0 ? assignedBy : null;
      }

      // Retrieve the ticket's department_id to route strictly
      const [ticketRows] = await connection.execute(
        'SELECT department_id FROM tickets WHERE id = ? LIMIT 1',
        [ticketId]
      );
      const ticketDeptId = ticketRows.length > 0 ? ticketRows[0].department_id : null;

      // All new tickets start at L1 by policy; only support_agent / agent rows (never CEO/manager).
      let agent = await this.getAgentWithLeastTickets(tenantId, 'L1', ticketDeptId);
      if (!agent && ticketDeptId) {
        // Fallback: try finding L1 agent without strict department filter
        console.log(`⚠️ No L1 agent found in department ${ticketDeptId}, falling back to general L1`);
        agent = await this.getAgentWithLeastTickets(tenantId, 'L1', null);
      }
      if (!agent && tenantId !== 1) {
        console.log(`⚠️ No L1 support executive for tenant ${tenantId}, falling back to tenant 1`);
        agent = await this.getAgentWithLeastTickets(1, 'L1', ticketDeptId);
        if (!agent && ticketDeptId) {
          agent = await this.getAgentWithLeastTickets(1, 'L1', null);
        }
      }
      if (!agent) {
        for (const lvl of ['L2', 'L3']) {
          agent = await this.getAgentWithLeastTickets(tenantId, lvl, ticketDeptId);
          if (!agent && ticketDeptId) {
            agent = await this.getAgentWithLeastTickets(tenantId, lvl, null);
          }
          if (agent) break;
        }
      }
      if (!agent && tenantId !== 1) {
        for (const lvl of ['L2', 'L3']) {
          agent = await this.getAgentWithLeastTickets(1, lvl, ticketDeptId);
          if (!agent && ticketDeptId) {
            agent = await this.getAgentWithLeastTickets(1, lvl, null);
          }
          if (agent) break;
        }
      }
      if (!agent) {
        agent = await this._getAnyAgentWithLeastTickets(connection, 'L1', ticketDeptId);
        if (!agent && ticketDeptId) {
          agent = await this._getAnyAgentWithLeastTickets(connection, 'L1', null);
        }
      }
      if (!agent) {
        for (const lvl of ['L2', 'L3']) {
          agent = await this._getAnyAgentWithLeastTickets(connection, lvl, ticketDeptId);
          if (!agent && ticketDeptId) {
            agent = await this._getAnyAgentWithLeastTickets(connection, lvl, null);
          }
          if (agent) break;
        }
      }
      if (!agent) {
        throw new Error('No active support executive (L1–L3) available for ticket assignment.');
      }
      const assignedLevel = ['L1', 'L2', 'L3'].includes(String(agent.level || '').toUpperCase())
        ? String(agent.level).toUpperCase()
        : 'L1';
      
      // Update the ticket with the selected agent (tenant-filtered when ticket has tenant_id)
      let [result] = await connection.execute(
        `UPDATE tickets
         SET assigned_to = ?, assigned_by = ?, current_owner_id = ?, current_level = ?
         WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
        [agent.id, safeAssignedBy || null, agent.id, assignedLevel || 'L1', ticketId || null, tenantId || 1]

      );
      // Fallback: if ticket has NULL tenant_id, update by id only
      if (result.affectedRows === 0) {
        [result] = await connection.execute(
          `UPDATE tickets
           SET assigned_to = ?, assigned_by = ?, current_owner_id = ?, current_level = ?
           WHERE id = ?`,
          [agent.id, safeAssignedBy || null, agent.id, assignedLevel || 'L1', ticketId || null]

        );
      }
      if (result.affectedRows === 0) {
        const [t] = await connection.execute('SELECT id, tenant_id FROM tickets WHERE id = ?', [ticketId]);
        const tinfo = t.length ? `tenant_id=${t[0].tenant_id}` : 'not found';
        throw new Error(`Ticket not found or tenant mismatch (ticket ${ticketId} ${tinfo}, filter tenant=${tenantId})`);
      }
      
      // Create assignment record in ticket_assignments (non-fatal: agents table vs users FK may differ)
      try {
        const [cols] = await connection.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_assignments' AND COLUMN_NAME = 'tenant_id'`
        );
        if (cols.length > 0) {
          await connection.execute(
            `INSERT INTO ticket_assignments (
              tenant_id, ticket_id, agent_id, assigned_by, assignment_reason, is_active
            ) VALUES (?, ?, ?, ?, ?, TRUE)`,
            [tenantId, ticketId, agent.id, safeAssignedBy || agent.id, 'Automatic equal distribution assignment']
          );
        } else {
          await connection.execute(
            `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_reason, is_active)
             VALUES (?, ?, ?, ?, TRUE)`,
            [ticketId, agent.id, safeAssignedBy || agent.id, 'Automatic equal distribution assignment']
          );
        }
      } catch (insertErr) {
        // Don't fail assignment - tickets.assigned_to is what agents use; ticket_assignments is audit
        console.warn(`⚠️ ticket_assignments insert skipped (assignment still applied):`, insertErr.message);
      }
      
      console.log(`✅ Ticket ${ticketId} assigned to ${agent.name} (ID: ${agent.id}) using equal distribution`);
      
      // Send email notification to the assigned agent + WhatsApp to customer
      try {
        // Get ticket details for notifications (include mobile for WhatsApp)
        const [ticketDetails] = await connection.execute(
          'SELECT id, name, issue_title, mobile FROM tickets WHERE id = ?',
          [ticketId]
        );
        
        if (ticketDetails.length > 0) {
          const ticket = ticketDetails[0];
          const customerName = ticket.name || 'Customer';
          const ticketTitle = ticket.issue_title || 'Support Request';
          
          // Send WhatsApp to customer when ticket is assigned
          if (ticket.mobile) {
            try {
              const { sendAssignmentNotification } = require('../utils/whatsapp-notifications');
              await sendAssignmentNotification(
                { id: ticketId, mobile: ticket.mobile, issue_title: ticketTitle },
                agent.name
              );
            } catch (waErr) {
              console.warn('⚠️ WhatsApp assignment notification failed:', waErr?.message);
            }
          }
          
          // Send email notification to agent
          const emailResult = await emailService.sendAgentAssignmentNotification(
            agent.email,
            agent.name,
            ticketId,
            customerName,
            ticketTitle
          );
          
          if (emailResult.success) {
            console.log(`✅ Agent assignment email sent successfully to ${agent.email} for ticket #${ticketId}`);
          } else {
            console.log(`⚠️ Failed to send agent assignment email to ${agent.email}:`, emailResult.error);
          }
        }
      } catch (emailError) {
        console.error('⚠️ Error sending agent assignment email:', emailError);
        // Don't fail the assignment if email fails
      }
      
      return {
        success: true,
        message: `Ticket assigned to ${agent.name} using equal distribution`,
        data: {
          ticket_id: ticketId,
          assigned_to: agent.id,
          assigned_to_name: agent.name,
          assigned_to_email: agent.email,
          assignment_method: 'equal_distribution',
          current_level: assignedLevel,
          active_tickets_count: agent.active_tickets + 1
        }
      };
      
    } catch (error) {
      console.error('❌ Error assigning ticket equally:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Assign a ticket to a specific agent using the existing assignment mechanism.
   * Additive helper used by AI / manager workflows; does not change ticket lifecycle fields.
   */
  static async assignTicketToAgent(ticketId, agentId, assignedBy = null, tenantId = 1, assignmentReason = null) {
    const connection = await pool.getConnection();
    try {
      await ensureAssignmentSchema(connection);

      // Validate agent exists and is a frontline support account.
      const [agentRows] = await connection.execute(
        `SELECT id, name, email, level
         FROM agents
         WHERE id = ?
           AND is_active = TRUE
           AND COALESCE(availability_status, 'available') = 'available'
           ${AUTO_ASSIGN_ROLE_SQL}
         LIMIT 1`,
        [agentId]
      );
      if (!agentRows.length) {
        throw new Error('Target agent not found or unavailable.');
      }
      const agent = agentRows[0];
      const assignedLevel = ['L1', 'L2', 'L3'].includes(String(agent.level || '').toUpperCase())
        ? String(agent.level).toUpperCase()
        : 'L1';

      // assigned_by has FK to agents.id; ensure non-agent values never break assignment
      let safeAssignedBy = null;
      if (assignedBy !== null && assignedBy !== undefined) {
        const [abRows] = await connection.execute(
          'SELECT id FROM agents WHERE id = ? LIMIT 1',
          [assignedBy]
        );
        safeAssignedBy = abRows.length > 0 ? assignedBy : null;
      }

      // Update the ticket assignment (tenant-filtered when ticket has tenant_id)
      let [result] = await connection.execute(
        `UPDATE tickets
         SET assigned_to = ?, assigned_by = ?, current_owner_id = ?, current_level = ?
         WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
        [agent.id, safeAssignedBy, agent.id, assignedLevel, ticketId, tenantId]
      );
      if (result.affectedRows === 0) {
        [result] = await connection.execute(
          `UPDATE tickets
           SET assigned_to = ?, assigned_by = ?, current_owner_id = ?, current_level = ?
           WHERE id = ?`,
          [agent.id, safeAssignedBy, agent.id, assignedLevel, ticketId]
        );
      }
      if (result.affectedRows === 0) {
        throw new Error(`Ticket not found (id=${ticketId}).`);
      }

      // Best-effort audit trail (do not fail assignment if it errors).
      try {
        const reasonText = String(assignmentReason || '').trim() || 'Assignment updated';
        const [cols] = await connection.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_assignments' AND COLUMN_NAME = 'tenant_id'`
        );
        if (cols.length > 0) {
          await connection.execute(
            `INSERT INTO ticket_assignments (
              tenant_id, ticket_id, agent_id, assigned_by, assignment_reason, is_active
            ) VALUES (?, ?, ?, ?, ?, TRUE)`,
            [tenantId, ticketId, agent.id, safeAssignedBy || agent.id, reasonText]
          );
        } else {
          await connection.execute(
            `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_reason, is_active)
             VALUES (?, ?, ?, ?, TRUE)`,
            [ticketId, agent.id, safeAssignedBy || agent.id, reasonText]
          );
        }
      } catch (insertErr) {
        console.warn(`⚠️ ticket_assignments insert skipped (assignment still applied):`, insertErr.message);
      }

      // Notifications: keep behavior consistent with assignTicketEqually (best-effort).
      try {
        const [ticketDetails] = await connection.execute(
          'SELECT id, name, issue_title, mobile FROM tickets WHERE id = ?',
          [ticketId]
        );
        if (ticketDetails.length > 0) {
          const ticket = ticketDetails[0];
          const customerName = ticket.name || 'Customer';
          const ticketTitle = ticket.issue_title || 'Support Request';

          if (ticket.mobile) {
            try {
              const { sendAssignmentNotification } = require('../utils/whatsapp-notifications');
              await sendAssignmentNotification(
                { id: ticketId, mobile: ticket.mobile, issue_title: ticketTitle },
                agent.name
              );
            } catch (waErr) {
              console.warn('⚠️ WhatsApp assignment notification failed:', waErr?.message);
            }
          }

          const emailResult = await emailService.sendAgentAssignmentNotification(
            agent.email,
            agent.name,
            ticketId,
            customerName,
            ticketTitle
          );
          if (!emailResult.success) {
            console.log(`⚠️ Failed to send agent assignment email to ${agent.email}:`, emailResult.error);
          }
        }
      } catch (notifyErr) {
        console.warn('⚠️ Assignment notifications failed:', notifyErr?.message || notifyErr);
      }

      try {
        const appNotificationService = require('../../case_management/services/appNotificationService');
        const [tix] = await connection.execute(
          'SELECT tenant_id, issue_title FROM tickets WHERE id = ? LIMIT 1',
          [ticketId]
        );
        const tnt = tix[0]?.tenant_id != null ? Number(tix[0].tenant_id) : tenantId;
        await appNotificationService.notifyTicketAssigned(pool, {
          tenantId: tnt,
          ticketId,
          assigneeAgentId: agent.id,
          issueTitle: tix[0]?.issue_title || ''
        });
      } catch (inAppErr) {
        console.warn('⚠️ In-app assignment notifications failed:', inAppErr?.message || inAppErr);
      }

      return {
        success: true,
        message: `Ticket assigned to ${agent.name}`,
        data: {
          ticket_id: ticketId,
          assigned_to: agent.id,
          assigned_to_name: agent.name,
          assigned_to_email: agent.email,
          assignment_method: 'direct',
          current_level: assignedLevel
        }
      };
    } finally {
      connection.release();
    }
  }
  
  /**
   * Get assignment statistics for the single support executive
   * @param {number} tenantId - The tenant ID for filtering
   * @returns {Promise<Array>} Array with single agent and their ticket counts
   */
  static async getAssignmentStatistics(tenantId) {
    const connection = await pool.getConnection();
    
    try {
      // Get stats for all active agents (tenant-filtered)
      const [agents] = await connection.execute(`
        SELECT 
          u.id,
          u.name,
          u.email,
          u.role,
          u.is_active,
          COALESCE(new_tickets.count, 0) as new_tickets,
          COALESCE(in_progress_tickets.count, 0) as in_progress_tickets,
          COALESCE(closed_tickets.count, 0) as closed_tickets,
          COALESCE(total_tickets.count, 0) as total_tickets
        FROM agents u
        LEFT JOIN (
          SELECT assigned_to, COUNT(*) as count
          FROM tickets 
          WHERE status = 'new' AND assigned_to IS NOT NULL AND tenant_id = ?
          GROUP BY assigned_to
        ) new_tickets ON u.id = new_tickets.assigned_to
        LEFT JOIN (
          SELECT assigned_to, COUNT(*) as count
          FROM tickets 
          WHERE status = 'in_progress' AND assigned_to IS NOT NULL AND tenant_id = ?
          GROUP BY assigned_to
        ) in_progress_tickets ON u.id = in_progress_tickets.assigned_to
        LEFT JOIN (
          SELECT assigned_to, COUNT(*) as count
          FROM tickets 
          WHERE status = 'closed' AND assigned_to IS NOT NULL AND tenant_id = ?
          GROUP BY assigned_to
        ) closed_tickets ON u.id = closed_tickets.assigned_to
        LEFT JOIN (
          SELECT assigned_to, COUNT(*) as count
          FROM tickets 
          WHERE assigned_to IS NOT NULL AND tenant_id = ?
          GROUP BY assigned_to
        ) total_tickets ON u.id = total_tickets.assigned_to
        WHERE u.is_active = TRUE AND u.role IN ('support_agent') AND u.tenant_id = ?
        ORDER BY total_tickets.count DESC, u.name ASC
      `, [tenantId, tenantId, tenantId, tenantId, tenantId]);
      
      return agents;
      
    } catch (error) {
      console.error('❌ Error getting assignment statistics:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  /**
   * Rebalance ticket assignments to ensure equal distribution
   * @param {number} tenantId - The tenant ID for filtering
   * @returns {Promise<Object>} Rebalancing result
   */
  static async rebalanceAssignments(tenantId) {
    const connection = await pool.getConnection();
    
    try {
      console.log('🔄 Starting ticket assignment rebalancing...');

      // Get all unassigned tickets (tickets.assigned_to IS NULL is source of truth)
      const [unassignedTickets] = await connection.execute(`
        SELECT t.id, t.name, t.email, t.created_at, t.tenant_id
        FROM tickets t
        WHERE t.assigned_to IS NULL AND t.status IN ('new', 'in_progress') AND t.tenant_id = ?
        ORDER BY t.created_at ASC
      `, [tenantId]);
      
      if (unassignedTickets.length === 0) {
        console.log('✅ No unassigned tickets found');
        return {
          success: true,
          message: 'No unassigned tickets to rebalance',
          data: { rebalanced_tickets: 0 }
        };
      }
      
      console.log(`📋 Found ${unassignedTickets.length} unassigned tickets to rebalance`);
      
      let rebalancedCount = 0;
      
      for (const ticket of unassignedTickets) {
        try {
          await this.assignTicketEqually(ticket.id, null, ticket.tenant_id || tenantId);
          rebalancedCount++;
        } catch (error) {
          console.error(`❌ Failed to rebalance ticket ${ticket.id}:`, error.message);
        }
      }
      
      console.log(`✅ Rebalancing completed: ${rebalancedCount} tickets reassigned`);
      
      return {
        success: true,
        message: `Rebalancing completed: ${rebalancedCount} tickets reassigned`,
        data: {
          rebalanced_tickets: rebalancedCount,
          total_unassigned: unassignedTickets.length
        }
      };
      
    } catch (error) {
      console.error('❌ Error rebalancing assignments:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = TicketAssignmentService;
