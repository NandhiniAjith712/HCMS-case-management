const { pool } = require('../database');
const TicketAssignmentService = require('../utils/ticketAssignment');
const emailService = require('../services/emailService');
const ticketActivityService = require('../services/ticketActivityService');
const { maybeAutoAllocateTicket } = require('./aiAgentAllocationService');
const { 
  normalizeIssueTypeId, 
  resolveSLAForTicket, 
  applyResolvedSlaToTicket 
} = require('../services/slaResolutionService');
const { calculatePriority, generatePriorityReason } = require('../services/priorityService');
const TextFormatter = require('../utils/textFormatter');

/**
 * Core Ticket Service to handle ticket creation and management
 */
class TicketService {
  /**
   * Creates a new ticket.
   */
  async createTicket(ticketData, actor = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        tenantId = 1,
        name,
        email,
        mobile,
        product,
        module,
        description,
        issueType,
        issueTitle,
        userId,
        source = 'web',
        attachments = [],
        issueTypeOther = null,
        utm_description = null
      } = ticketData;

      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedName = String(name || '').trim();
      
      // 1. Resolve User
      let resolvedUserId = userId ? Number(userId) : null;
      if (!resolvedUserId && normalizedEmail) {
        const [rows] = await connection.execute(
          'SELECT id FROM users WHERE LOWER(email) = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1',
          [normalizedEmail, tenantId]
        );
        
        if (rows.length > 0) {
          resolvedUserId = rows[0].id;
        } else {
          const [created] = await connection.execute(
            'INSERT INTO users (tenant_id, name, email, phone, role, created_at, is_active) VALUES (?, ?, ?, ?, "user", NOW(), TRUE)',
            [tenantId, normalizedName || normalizedEmail.split('@')[0], normalizedEmail, mobile || null]
          );
          resolvedUserId = created.insertId;
        }
      }

      // 2. Resolve IDs (Product, Module, IssueType)
      const [pRows] = await connection.execute('SELECT id FROM products WHERE name = ? AND tenant_id = ? LIMIT 1', [product, tenantId]);
      const productId = pRows[0]?.id || null;
      
      const [mRows] = await connection.execute('SELECT id FROM modules WHERE name = ? AND tenant_id = ? LIMIT 1', [module, tenantId]);
      const moduleId = mRows[0]?.id || null;

      // 3. Resolve SLA
      const slaMatch = await resolveSLAForTicket({
        tenantId,
        product,
        module,
        issueType: normalizeIssueTypeId(issueType)
      });

      // 5. Calculate Priority
      const priorityResult = calculatePriority({
        description,
        issue_title: issueTitle,
        product,
        module,
        issue_type: issueType
      });

      // 4. Create Ticket
      const [ticketResult] = await connection.execute(
        `INSERT INTO tickets (
          tenant_id, user_id, name, email, mobile, 
          product, product_id, module, module_id, 
          issue_title, description, issue_type, issue_type_other,
          status, priority, priority_reason, source, utm_description,
          sla_config_id, sla_response_time_minutes, sla_resolution_time_minutes, sla_match_level,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          tenantId,
          resolvedUserId,
          normalizedName,
          normalizedEmail,
          mobile || null,
          product,
          productId,
          module,
          moduleId,
          issueTitle,
          description,
          issueType,
          issueTypeOther,
          priorityResult.priority || 'medium',
          priorityResult.reason || 'Default priority',
          source,
          utm_description,
          slaMatch.sla_config_id || null,
          slaMatch.response_time_minutes || null,
          slaMatch.resolution_time_minutes || null,
          slaMatch.match_level || 'SYSTEM_DEFAULT'
        ]
      );

      const ticketId = ticketResult.insertId;

      // 5. Apply SLA Timers
      if (slaMatch.sla_config_id) {
        await applyResolvedSlaToTicket(ticketId, slaMatch, tenantId);
      }

      // 6. Handle Attachments
      if (attachments && attachments.length > 0) {
        for (const attr of attachments) {
          await connection.execute(
            'INSERT INTO ticket_attachments (tenant_id, ticket_id, file_name, file_type, file_size, attachment) VALUES (?, ?, ?, ?, ?, ?)',
            [tenantId, ticketId, attr.fileName, attr.fileType, attr.fileSize, attr.buffer]
          );
        }
      }

      // 7. Log Activity
      const isAgent = actor && actor.role !== 'user';
      await ticketActivityService.logActivity({
        ticketId,
        tenantId,
        action: 'ticket_created',
        performedBy: isAgent ? actor.id : 1, // Fallback to Support Manager agent ID (1 - Adarsh) for system/customer actions
        performedByName: actor?.name || normalizedName,
        details: { source }
      }, connection);

      await connection.commit();

      // 10. Post-creation actions (Async)
      this.handlePostCreation(ticketId, tenantId, resolvedUserId, normalizedEmail, normalizedName, issueTitle, slaMatch);

      return {
        success: true,
        ticketId,
        userId: resolvedUserId
      };
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error creating ticket in service:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  async handlePostCreation(ticketId, tenantId, userId, email, name, title, slaMatch) {
    try {
      await maybeAutoAllocateTicket({ ticketId, tenantId });
      await emailService.sendTicketConfirmation(
        email,
        name,
        ticketId,
        title,
        null,
        { firstResponseExpectationMinutes: slaMatch.response_time_minutes }
      );
    } catch (err) {
      console.warn('Post-creation tasks failed:', err.message);
    }
  }
}

module.exports = new TicketService();
