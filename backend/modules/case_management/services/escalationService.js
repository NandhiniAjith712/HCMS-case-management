const { pool } = require('../../shared/database/database');
const ticketActivityService = require('./ticketActivityService');
const { validateLevelAssignment, getNextEscalationLevel } = require('./assignmentService');
const { notifyTicketAssigned } = require('./appNotificationService');

// Default fallback levels if configuration is not set up
const DEFAULT_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];

/**
 * Fetch configured escalation levels for a tenant from the database.
 * Falls back to default L1-L5 if no configuration exists.
 *
 * @param {number} tenantId - The tenant ID
 * @returns {Promise<string[]>} - Array of level values in order (e.g., ['L1', 'L2', 'L3', 'L4', 'L5'])
 */
async function getConfiguredLevels(tenantId = 1) {
  try {
    const [levels] = await pool.execute(
      `SELECT level FROM escalation_levels 
       WHERE tenant_id = ? AND is_active = TRUE 
       ORDER BY FIELD(level, 'L1', 'L2', 'L3', 'L4', 'L5')`,
      [tenantId]
    );

    if (levels.length === 0) {
      console.log('[escalationService] No configured levels found for tenant', tenantId, ', using defaults');
      return DEFAULT_LEVELS;
    }

    return levels.map(row => row.level);
  } catch (error) {
    console.error('[escalationService] Failed to fetch configured levels, using defaults:', error.message);
    return DEFAULT_LEVELS;
  }
}

/**
 * Escalate a case to the next level sequentially (L1 -> L2 -> L3 -> L4 -> L5).
 * Prevents skipping levels, backward movement, or escalation beyond the maximum configured level.
 * Uses configured escalation levels from the database, falling back to default L1-L5.
 * Updates assigned_to, escalation_level, escalation_count, last_escalated_at, and is_escalated.
 *
 * @param {number} caseId - The case ID
 * @param {number} tenantId - The tenant ID
 * @param {object} actor - Optional actor info { id, name } for activity logging
 * @param {string} reason - Optional escalation reason
 * @returns {Promise<object>} - { success, case, message, currentLevel, previousLevel, escalationCount }
 */
async function escalateCase(caseId, tenantId = 1, actor = null, reason = '') {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Fetch configured levels for this tenant
    const configuredLevels = await getConfiguredLevels(tenantId);

    // Fetch current case (including metadata needed for intent-based assignment)
    const [cases] = await connection.execute(
      `SELECT id, assigned_to, escalation_level, escalation_count, is_escalated, status,
              tenant_id, category, subcategory, title, description, reporting_mode, created_by
       FROM cases
       WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [caseId, tenantId]
    );

    if (cases.length === 0) {
      throw new Error('Case not found');
    }

    const caseData = cases[0];
    const currentLevel = caseData.escalation_level || configuredLevels[0];
    const previousAssignee = caseData.assigned_to || null;

    // Prevent escalation of cases in terminal states
    const terminalStatuses = ['resolved', 'closed', 'rejected'];
    if (terminalStatuses.includes(String(caseData.status).toLowerCase())) {
      throw new Error(`Cannot escalate a case that is already ${caseData.status}. Reopen or create a new case instead.`);
    }

    // Determine next escalation level (reuse already-fetched configuration)
    const { nextLevel } = await getNextEscalationLevel(tenantId, currentLevel, configuredLevels);
    if (!nextLevel) {
      throw new Error(`Case is already at the maximum escalation level (${configuredLevels[configuredLevels.length - 1]})`);
    }

    // Resolve assignee for the next level using intent-based context
    const assignmentContext = {
      category: caseData.category || null,
      subcategory: caseData.subcategory || null,
      title: caseData.title || null,
      description: caseData.description || null,
      reportingMode: caseData.reporting_mode || null,
      selectedDepartment: caseData.department || null,
      createdById: caseData.created_by || null
    };
    const nextLevelValidation = await validateLevelAssignment(tenantId, nextLevel, assignmentContext);
    if (!nextLevelValidation.valid) {
      throw new Error(nextLevelValidation.reason);
    }
    const newAssignee = nextLevelValidation.assignee;

    const newEscalationCount = (caseData.escalation_count || 0) + 1;

    // Update case
    const reasonText = String(reason || '').trim();
    const ticketType = String(caseData.reporting_mode || '').toLowerCase();
    const isSpecialCase = ['confidential', 'sensitive', 'anonymous'].includes(ticketType);
    console.log('[escalationService] Updating case', caseId, 'to level', nextLevel, 'assignee', newAssignee.user_id, 'role', newAssignee.user_role, 'with reason:', reasonText);
    await connection.execute(
      `UPDATE cases SET
        assigned_to = ?,
        escalation_level = ?,
        escalation_count = ?,
        last_escalated_at = NOW(),
        is_escalated = TRUE,
        status = 'escalated',
        escalation_reason = ?,
        dept_review_status = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [newAssignee.user_id, nextLevel, newEscalationCount, reasonText || null, isSpecialCase ? 'pending_approval' : null, caseId]
    );

    // Insert escalation history record
    try {
      await connection.execute(
        `INSERT INTO case_escalation_history
         (case_id, from_level, to_level, reason, escalated_by, escalated_by_name, tenant_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          caseId,
          currentLevel,
          nextLevel,
          reasonText || null,
          actor?.id || null,
          actor?.name || null,
          caseData.tenant_id || tenantId
        ]
      );
    } catch (historyErr) {
      console.log('[escalationService] Failed to insert escalation history (non-fatal):', historyErr.message);
    }

    // Fetch updated case
    const [updatedCases] = await connection.execute(
      'SELECT * FROM cases WHERE id = ?',
      [caseId]
    );

    // Log escalation activity
    try {
      await ticketActivityService.logActivity({
        ticketId: caseId,
        tenantId: caseData.tenant_id || tenantId,
        action: 'escalated',
        performedBy: actor?.id || null,
        performedByName: actor?.name || 'System',
        details: {
          previous_level: currentLevel,
          new_level: nextLevel,
          escalation_count: newEscalationCount,
          reason: reasonText || 'Sequential escalation'
        }
      }, connection);
    } catch (activityError) {
      console.log('[escalationService] Escalation activity log failed (non-fatal):', activityError.message);
    }

    // Log assignment activity
    try {
      await ticketActivityService.logActivity({
        ticketId: caseId,
        tenantId: caseData.tenant_id || tenantId,
        action: 'assigned',
        performedBy: actor?.id || null,
        performedByName: actor?.name || 'System',
        details: {
          previous_assignee: previousAssignee,
          new_assignee: newAssignee.user_id,
          new_assignee_name: newAssignee.user_name,
          previous_level: currentLevel,
          new_level: nextLevel,
          assignment_type: 'escalation',
          reason: reasonText || 'Sequential escalation'
        }
      }, connection);
    } catch (assignActivityError) {
      console.log('[escalationService] Assignment activity log failed (non-fatal):', assignActivityError.message);
    }

    await connection.commit();

    // Notify newly assigned user (outside transaction)
    try {
      await notifyTicketAssigned(pool, {
        tenantId: caseData.tenant_id || tenantId,
        ticketId: caseId,
        assigneeAgentId: newAssignee.user_id
      });
    } catch (notifyError) {
      console.log('[escalationService] Assignee notification failed (non-fatal):', notifyError.message);
    }

    return {
      success: true,
      case: updatedCases[0],
      message: `Case escalated from ${currentLevel} to ${nextLevel}`,
      previousLevel: currentLevel,
      currentLevel: nextLevel,
      escalationCount: newEscalationCount
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  escalateCase,
  getConfiguredLevels,
  DEFAULT_LEVELS
};
