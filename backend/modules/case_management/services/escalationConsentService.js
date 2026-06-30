const { pool } = require('../../shared/database/database');
const { getNextEscalationLevel } = require('./assignmentService');
const { notifyUserTicketInApp } = require('./appNotificationService');
const ticketActivityService = require('./ticketActivityService');

const TICKET_TYPES = ['normal', 'confidential', 'sensitive', 'anonymous'];

function normalizeTicketType(reportingMode) {
  const mode = String(reportingMode || 'normal').toLowerCase();
  return TICKET_TYPES.includes(mode) ? mode : 'normal';
}

async function getConsentConfig(tenantId, reportingMode) {
  const ticketType = normalizeTicketType(reportingMode);
  const [rows] = await pool.execute(
    `SELECT require_consent, override_roles FROM case_escalation_consent_config
     WHERE tenant_id = ? AND ticket_type = ?`,
    [tenantId, ticketType]
  );
  if (rows.length === 0) {
    return { require_consent: false, override_roles: [] };
  }
  const config = rows[0];
  let overrideRoles = [];
  try {
    overrideRoles = config.override_roles ? JSON.parse(config.override_roles) : [];
  } catch (e) {
    overrideRoles = (config.override_roles || '').split(',').map(r => r.trim()).filter(Boolean);
  }
  return {
    require_consent: config.require_consent === 1,
    override_roles: overrideRoles
  };
}

async function isConsentRequired(tenantId, reportingMode) {
  const config = await getConsentConfig(tenantId, reportingMode);
  return config.require_consent === true;
}

function canBypassConsent(user, config) {
  if (!user || !user.role) return false;
  const userRole = String(user.role).toLowerCase();
  const overrideRoles = Array.isArray(config.override_roles) ? config.override_roles : [];
  return overrideRoles.some(r => String(r).toLowerCase() === userRole);
}

async function getPendingConsentRequest(connection, caseId, tenantId) {
  const [rows] = await connection.execute(
    `SELECT * FROM case_escalation_consent
     WHERE case_id = ? AND tenant_id = ? AND status = 'pending'
     ORDER BY requested_at DESC
     LIMIT 1`,
    [caseId, tenantId]
  );
  return rows[0] || null;
}

async function getApprovedConsentRequestForLevel(connection, caseId, tenantId, currentLevel, requestedLevel) {
  const [rows] = await connection.execute(
    `SELECT * FROM case_escalation_consent
     WHERE case_id = ? AND tenant_id = ? AND status = 'approved'
       AND current_level = ? AND requested_level = ?
     ORDER BY responded_at DESC
     LIMIT 1`,
    [caseId, tenantId, currentLevel, requestedLevel]
  );
  return rows[0] || null;
}

async function createConsentRequest(connection, { caseId, tenantId, currentLevel, requestedLevel, requestedBy, requestedByName, reason }) {
  const [existing] = await connection.execute(
    `SELECT id FROM case_escalation_consent
     WHERE case_id = ? AND tenant_id = ? AND status = 'pending'`,
    [caseId, tenantId]
  );
  if (existing.length > 0) {
    throw new Error('A pending escalation consent request already exists for this case');
  }

  const reasonText = String(reason || '').trim() || null;
  const [result] = await connection.execute(
    `INSERT INTO case_escalation_consent
     (tenant_id, case_id, current_level, requested_level, reason, requested_by, requested_by_name, requested_at, employee_response, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'pending', 'pending')`,
    [tenantId, caseId, currentLevel, requestedLevel, reasonText, requestedBy || null, requestedByName || null]
  );

  const requestId = result.insertId;

  // Log activity
  try {
    await ticketActivityService.logActivity({
      ticketId: caseId,
      tenantId,
      action: 'escalation_consent_requested',
      performedBy: requestedBy || null,
      performedByName: requestedByName || 'System',
      details: {
        current_level: currentLevel,
        requested_level: requestedLevel,
        reason: reason || 'Sequential escalation',
        consent_request_id: requestId
      }
    }, connection);
  } catch (activityError) {
    console.log('[escalationConsentService] escalation_consent_requested activity log failed (non-fatal):', activityError.message);
  }

  return requestId;
}

async function notifyEmployeeOfConsentRequest(pool, caseId, tenantId, requestId, reason) {
  try {
    const [caseRows] = await pool.execute(
      `SELECT title, created_by FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [caseId, tenantId]
    );
    const caseData = caseRows[0];
    if (!caseData || !caseData.created_by) return;

    await notifyUserTicketInApp(pool, {
      tenantId,
      userId: caseData.created_by,
      ticketId: caseId,
      title: 'Escalation consent requested',
      description: `Your case "${caseData.title || 'Support request'}" requires escalation to the next support level. Do you agree to proceed?`,
      dedupeKey: `escalation_consent:${tenantId}:${caseId}:${requestId}`
    });

    try {
      await ticketActivityService.logActivity({
        ticketId: caseId,
        tenantId,
        action: 'employee_notified',
        performedBy: null,
        performedByName: 'System',
        details: {
          notification_type: 'escalation_consent_request',
          consent_request_id: requestId,
          reason: reason || null,
          notified_user_id: caseData.created_by
        }
      });
    } catch (logErr) {
      console.log('[escalationConsentService] employee_notified activity log failed (non-fatal):', logErr.message);
    }
  } catch (notifError) {
    console.log('[escalationConsentService] notify employee failed (non-fatal):', notifError.message);
  }
}

async function notifyHandlerOfConsentResponse(pool, request, response, comments) {
  try {
    const { case_id, tenant_id, requested_by } = request;
    if (!requested_by) return;
    const [caseRows] = await pool.execute(
      `SELECT title FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [case_id, tenant_id]
    );
    const caseData = caseRows[0] || {};
    const title = response === 'approved' ? 'Escalation approved by employee' : 'Escalation declined by employee';
    const description = response === 'approved'
      ? `Employee approved escalation for "${caseData.title || 'Support request'}".`
      : `Employee declined escalation for "${caseData.title || 'Support request'}". ${comments ? `Comments: ${comments}` : ''}`;

    await notifyUserTicketInApp(pool, {
      tenantId: tenant_id,
      userId: requested_by,
      ticketId: case_id,
      title,
      description,
      dedupeKey: `escalation_consent_response:${tenant_id}:${case_id}:${request.id}:${response}`
    });
  } catch (notifError) {
    console.log('[escalationConsentService] notify handler response failed (non-fatal):', notifError.message);
  }
}

async function respondToConsentRequest(pool, { requestId, userId, response, comments }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT * FROM case_escalation_consent WHERE id = ?`,
      [requestId]
    );
    if (rows.length === 0) {
      throw new Error('Consent request not found');
    }

    const request = rows[0];
    if (request.status !== 'pending') {
      throw new Error('This consent request has already been responded to');
    }

    const normalizedResponse = response === 'approved' ? 'approved' : 'rejected';
    const status = normalizedResponse === 'approved' ? 'approved' : 'rejected';

    await connection.execute(
      `UPDATE case_escalation_consent
       SET employee_response = ?, employee_comments = ?, responded_at = NOW(), response_timestamp = NOW(), status = ?
       WHERE id = ?`,
      [normalizedResponse, comments || null, status, requestId]
    );

    // Log activity
    try {
      await ticketActivityService.logActivity({
        ticketId: request.case_id,
        tenantId: request.tenant_id,
        action: `escalation_consent_${normalizedResponse}`,
        performedBy: userId || null,
        performedByName: 'Employee',
        details: {
          current_level: request.current_level,
          requested_level: request.requested_level,
          consent_request_id: requestId,
          employee_comments: comments || null
        }
      }, connection);
    } catch (activityError) {
      console.log('[escalationConsentService] escalation_consent response activity log failed (non-fatal):', activityError.message);
    }

    await connection.commit();

    // Notify the handler (requester) outside the transaction
    await notifyHandlerOfConsentResponse(pool, request, normalizedResponse, comments);

    return { request: { ...request, employee_response: normalizedResponse, status, employee_comments: comments || null }, approved: normalizedResponse === 'approved' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getPendingConsentRequestsForEmployee(pool, userId, tenantId) {
  const [rows] = await pool.execute(
    `SELECT ec.*, c.title, c.ticket_code, c.reporting_mode
     FROM case_escalation_consent ec
     JOIN cases c ON ec.case_id = c.id
     WHERE ec.tenant_id = ? AND c.created_by = ? AND ec.status = 'pending'
     ORDER BY ec.requested_at DESC`,
    [tenantId, userId]
  );
  return rows;
}

async function getConsentHistoryForCase(pool, caseId, tenantId) {
  const [rows] = await pool.execute(
    `SELECT * FROM case_escalation_consent
     WHERE case_id = ? AND tenant_id = ?
     ORDER BY requested_at DESC`,
    [caseId, tenantId]
  );
  return rows;
}

async function getUnacknowledgedConsentResponse(pool, caseId, tenantId) {
  const [rows] = await pool.execute(
    `SELECT * FROM case_escalation_consent
     WHERE case_id = ? AND tenant_id = ? AND status IN ('approved', 'rejected') AND (acknowledged_by IS NULL OR acknowledged_at IS NULL)
     ORDER BY responded_at DESC
     LIMIT 1`,
    [caseId, tenantId]
  );
  return rows[0] || null;
}

async function acknowledgeConsentRequest(pool, { requestId, userId, caseId, tenantId, actor = null }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT * FROM case_escalation_consent WHERE id = ? AND case_id = ? AND tenant_id = ?`,
      [requestId, caseId, tenantId]
    );
    if (rows.length === 0) {
      throw new Error('Consent request not found');
    }

    const request = rows[0];
    if (request.status !== 'approved' && request.status !== 'rejected') {
      throw new Error('Consent request cannot be acknowledged');
    }
    if (request.acknowledged_by && request.acknowledged_at) {
      throw new Error('Consent response already acknowledged');
    }

    await connection.execute(
      `UPDATE case_escalation_consent
       SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = NOW()
       WHERE id = ?`,
      [userId, requestId]
    );

    await ticketActivityService.logActivity({
      ticketId: caseId,
      tenantId,
      action: 'escalation_consent_acknowledged',
      performedBy: userId || null,
      performedByName: actor?.name || 'Handler',
      details: {
        consent_request_id: requestId,
        employee_response: request.employee_response,
        employee_comments: request.employee_comments || null,
        requested_level: request.requested_level,
        current_level: request.current_level
      }
    }, connection);

    await connection.commit();

    let escalationResult = null;
    if (request.status === 'approved') {
      const { escalateCase } = require('./escalationService');
      escalationResult = await escalateCase(caseId, tenantId, actor, request.reason);
    }

    return { request: { ...request, status: 'acknowledged', acknowledged_by: userId, acknowledged_at: new Date() }, escalationResult };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveConsentConfig(tenantId, ticketType, { require_consent, override_roles }) {
  const normalizedType = normalizeTicketType(ticketType);
  const require = require_consent === true || require_consent === 1 || require_consent === '1' ? 1 : 0;
  const rolesJson = Array.isArray(override_roles) ? JSON.stringify(override_roles) : JSON.stringify([]);

  await pool.execute(
    `INSERT INTO case_escalation_consent_config (tenant_id, ticket_type, require_consent, override_roles)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       require_consent = VALUES(require_consent),
       override_roles = VALUES(override_roles)`,
    [tenantId, normalizedType, require, rolesJson]
  );
}

async function getAllConsentConfigs(tenantId) {
  const configs = {};
  for (const type of TICKET_TYPES) {
    configs[type] = await getConsentConfig(tenantId, type);
  }
  return configs;
}

module.exports = {
  TICKET_TYPES,
  normalizeTicketType,
  getConsentConfig,
  isConsentRequired,
  canBypassConsent,
  getPendingConsentRequest,
  getApprovedConsentRequestForLevel,
  createConsentRequest,
  notifyEmployeeOfConsentRequest,
  respondToConsentRequest,
  getPendingConsentRequestsForEmployee,
  getConsentHistoryForCase,
  getUnacknowledgedConsentResponse,
  acknowledgeConsentRequest,
  saveConsentConfig,
  getAllConsentConfigs,
  getNextEscalationLevel
};
