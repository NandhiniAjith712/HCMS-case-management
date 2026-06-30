const { pool } = require('../../shared/database/database');

const SPECIAL_CASE_TYPES = ['confidential', 'sensitive', 'anonymous'];
const DEFAULT_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function isSpecialCaseType(reportingMode) {
  return SPECIAL_CASE_TYPES.includes(String(reportingMode || '').toLowerCase());
}

function isAnonymousTicketType(reportingMode) {
  return String(reportingMode || '').toLowerCase() === 'anonymous';
}

function isAnonymousCase(caseData) {
  return isAnonymousTicketType(caseData?.reporting_mode);
}

function getSpecialCaseTypes() {
  return [...SPECIAL_CASE_TYPES];
}

function isSystemAdmin(user) {
  return normalizeRole(user?.role) === 'system_admin';
}

function isCaseCreator(user, caseData) {
  return Number(user?.id) && Number(caseData?.created_by) && Number(user.id) === Number(caseData.created_by);
}

function isCaseAssignee(user, caseData) {
  return Number(user?.id) && Number(caseData?.assigned_to) && Number(user.id) === Number(caseData.assigned_to);
}

function getCaseTicketType(caseData) {
  return String(caseData?.reporting_mode || '').toLowerCase() || null;
}

function getCaseLevel(caseData) {
  return caseData?.escalation_level || 'L1';
}

function getCaseTenantId(caseData) {
  return Number(caseData?.tenant_id || 1) || 1;
}

/**
 * Build a SQL WHERE clause fragment that restricts confidential/sensitive/anonymous
 * tickets to users who have explicit view permission at the ticket's current escalation level,
 * are the ticket creator, or are the current assignee. System admins bypass this.
 *
 * Returns { sql, params } which should be appended to the query. Caller must decide whether
 * to apply it (e.g., skip for system_admin).
 */
function getVisibilityFilter(alias, userId) {
  const sql = ` AND (
    ${alias}.reporting_mode = 'normal'
    OR ${alias}.reporting_mode IS NULL
    OR ${alias}.created_by = ?
    OR ${alias}.assigned_to = ?
    OR EXISTS (
      SELECT 1 FROM special_case_access_permissions scap
      WHERE scap.tenant_id = ${alias}.tenant_id
        AND scap.escalation_level = ${alias}.escalation_level
        AND scap.ticket_type = ${alias}.reporting_mode
        AND scap.user_id = ?
        AND scap.can_view = 1
    )
  )`;
  return { sql, params: [userId, userId, userId] };
}

/**
 * Get all active users assigned to a specific escalation level.
 */
async function getLevelUsers(tenantId, level) {
  const [rows] = await pool.execute(
    `SELECT ela.user_id, u.name as user_name, u.email as user_email, u.role as user_role
     FROM escalation_level_assignments ela
     JOIN escalation_levels el ON ela.escalation_level_id = el.id
     JOIN users u ON ela.user_id = u.id
     WHERE el.tenant_id = ? AND el.level = ? AND el.is_active = TRUE
       AND ela.tenant_id = ? AND ela.is_active = TRUE
       AND u.is_active = TRUE
     ORDER BY ela.assigned_at ASC, ela.id ASC`,
    [tenantId, level, tenantId]
  );
  return rows;
}

/**
 * Get stored permissions for a level + ticket type combination.
 * Returns a map keyed by user_id.
 */
async function getPermissions(tenantId, level, ticketType) {
  const [rows] = await pool.execute(
    `SELECT user_id, can_view, can_view_employee_details, can_edit, can_comment,
            can_perform_actions, can_resolve, can_close
     FROM special_case_access_permissions
     WHERE tenant_id = ? AND escalation_level = ? AND ticket_type = ?`,
    [tenantId, level, ticketType]
  );
  const map = {};
  for (const row of rows) {
    map[row.user_id] = row;
  }
  return map;
}

/**
 * Get all stored permissions for a ticket type grouped by level.
 */
async function getPermissionsByTicketType(tenantId, ticketType) {
  const [rows] = await pool.execute(
    `SELECT escalation_level, user_id, can_view, can_view_employee_details, can_edit, can_comment,
            can_perform_actions, can_resolve, can_close
     FROM special_case_access_permissions
     WHERE tenant_id = ? AND ticket_type = ?
     ORDER BY escalation_level, user_id`,
    [tenantId, ticketType]
  );
  const result = {};
  for (const row of rows) {
    if (!result[row.escalation_level]) result[row.escalation_level] = {};
    result[row.escalation_level][row.user_id] = row;
  }
  return result;
}

/**
 * Get a specific user's permission for a level + ticket type.
 */
async function getUserPermission(tenantId, userId, level, ticketType) {
  const [rows] = await pool.execute(
    `SELECT can_view, can_view_employee_details, can_edit, can_comment,
            can_perform_actions, can_resolve, can_close
     FROM special_case_access_permissions
     WHERE tenant_id = ? AND escalation_level = ? AND ticket_type = ? AND user_id = ?`,
    [tenantId, level, ticketType, userId]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

/**
 * Get all users authorized to view a special case at a given level.
 * Only returns users who are active at the level AND have can_view permission.
 */
async function getAuthorizedUsers(tenantId, level, ticketType) {
  const levelUsers = await getLevelUsers(tenantId, level);
  if (levelUsers.length === 0) return [];
  const permissions = await getPermissions(tenantId, level, ticketType);
  return levelUsers.filter(u => {
    const perm = permissions[u.user_id];
    return perm && perm.can_view === 1;
  });
}

/**
 * Check whether a user can view a special case.
 */
async function canViewCase(user, caseData) {
  if (!user || !caseData) return false;
  if (!isSpecialCaseType(caseData.reporting_mode)) return true;
  if (isSystemAdmin(user)) return true;
  if (isCaseCreator(user, caseData)) return true;
  if (isCaseAssignee(user, caseData)) return true;

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  return !!(perm && perm.can_view === 1);
}

/**
 * Check whether a user can view employee details on a special case.
 * Anonymous tickets never expose employee identity to anyone.
 */
async function canViewEmployeeDetails(user, caseData) {
  if (!user || !caseData) return false;
  if (isAnonymousCase(caseData)) return false;
  if (!isSpecialCaseType(caseData.reporting_mode)) return true;
  if (isSystemAdmin(user)) return true;
  if (isCaseCreator(user, caseData)) return true;
  if (isCaseAssignee(user, caseData)) return true;

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  return !!(perm && perm.can_view_employee_details === 1);
}

/**
 * Check whether a user can edit a special case.
 */
async function canEditCase(user, caseData) {
  if (!user || !caseData) return false;
  if (!isSpecialCaseType(caseData.reporting_mode)) return true;
  if (isSystemAdmin(user)) return true;

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  return !!(perm && perm.can_edit === 1);
}

/**
 * Check whether a user can add comments / internal notes on a special case.
 */
async function canComment(user, caseData) {
  if (!user || !caseData) return false;
  if (!isSpecialCaseType(caseData.reporting_mode)) return true;
  if (isSystemAdmin(user)) return true;
  if (isCaseCreator(user, caseData)) return true;
  if (isCaseAssignee(user, caseData)) return true;

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  return !!(perm && perm.can_comment === 1);
}

/**
 * Check whether a user can perform generic actions on a special case.
 */
async function canPerformActions(user, caseData) {
  if (!user || !caseData) return false;
  if (!isSpecialCaseType(caseData.reporting_mode)) return true;
  if (isSystemAdmin(user)) return true;
  if (isCaseAssignee(user, caseData)) return true;

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  return !!(perm && perm.can_perform_actions === 1);
}

/**
 * Check whether a user can mark a special case resolved.
 */
async function canResolveCase(user, caseData) {
  if (!user || !caseData) return false;
  if (!isSpecialCaseType(caseData.reporting_mode)) return true;
  if (isSystemAdmin(user)) return true;
  if (isCaseAssignee(user, caseData)) return true;

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  return !!(perm && perm.can_resolve === 1);
}

/**
 * Check whether a user can close a special case.
 */
async function canCloseCase(user, caseData) {
  if (!user || !caseData) return false;
  if (!isSpecialCaseType(caseData.reporting_mode)) return true;
  if (isSystemAdmin(user)) return true;
  if (isCaseAssignee(user, caseData)) return true;

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  return !!(perm && perm.can_close === 1);
}

/**
 * Get all effective permissions for a user against a case.
 */
async function getCasePermissions(user, caseData) {
  if (!user || !caseData) {
    return {
      can_view: false,
      can_view_employee_details: false,
      can_edit: false,
      can_comment: false,
      can_perform_actions: false,
      can_resolve: false,
      can_close: false
    };
  }

  if (!isSpecialCaseType(caseData.reporting_mode)) {
    return {
      can_view: true,
      can_view_employee_details: true,
      can_edit: true,
      can_comment: true,
      can_perform_actions: true,
      can_resolve: true,
      can_close: true
    };
  }

  const isAnonymous = isAnonymousCase(caseData);

  if (isSystemAdmin(user)) {
    return {
      can_view: true,
      can_view_employee_details: !isAnonymous,
      can_edit: true,
      can_comment: true,
      can_perform_actions: true,
      can_resolve: true,
      can_close: true
    };
  }

  const tenantId = getCaseTenantId(caseData);
  const level = getCaseLevel(caseData);
  const ticketType = getCaseTicketType(caseData);
  const perm = await getUserPermission(tenantId, user.id, level, ticketType);
  const isCreator = isCaseCreator(user, caseData);
  const isAssignee = isCaseAssignee(user, caseData);

  return {
    can_view: !!(perm && perm.can_view === 1) || isCreator || isAssignee,
    can_view_employee_details: !isAnonymous && (!!(perm && perm.can_view_employee_details === 1) || isCreator || isAssignee),
    can_edit: !!(perm && perm.can_edit === 1),
    can_comment: !!(perm && perm.can_comment === 1) || isCreator || isAssignee,
    can_perform_actions: !!(perm && perm.can_perform_actions === 1) || isAssignee,
    can_resolve: !!(perm && perm.can_resolve === 1) || isAssignee,
    can_close: !!(perm && perm.can_close === 1) || isAssignee
  };
}

const ANONYMOUS_MASK_LABELS = {
  reporter_id: '******',
  reporter_name: 'Anonymous Employee',
  reporter_email: '********',
  employee_id: '******',
  employee_name: 'Anonymous Employee',
  employee_email: '********',
  employee_phone: '********',
  created_by: null
};

/**
 * Mask employee details on a case when the requesting user lacks permission.
 * Anonymous tickets are always masked regardless of user or permission.
 */
async function maskCaseData(caseData, user) {
  if (!caseData || !isSpecialCaseType(caseData.reporting_mode)) return caseData;
  if (isAnonymousCase(caseData)) {
    return { ...caseData, ...ANONYMOUS_MASK_LABELS };
  }
  if (!user) return caseData;
  if (await canViewEmployeeDetails(user, caseData)) return caseData;

  const masked = { ...caseData };
  masked.reporter_id = null;
  masked.reporter_name = null;
  masked.reporter_email = null;
  masked.employee_id = null;
  masked.employee_name = null;
  masked.employee_email = null;
  masked.employee_phone = null;
  masked.created_by = null;
  return masked;
}

/**
 * Mask a person's name for anonymous tickets.
 */
function maskAnonymousName(caseData, name) {
  if (!isAnonymousCase(caseData)) return name;
  return 'Anonymous Employee';
}

/**
 * Bulk save permissions for a ticket type and level.
 * permissions: array of { user_id, can_view, can_view_employee_details, can_edit, can_comment, can_perform_actions, can_resolve, can_close }
 */
async function savePermissions(tenantId, ticketType, level, permissions) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      `DELETE FROM special_case_access_permissions
       WHERE tenant_id = ? AND escalation_level = ? AND ticket_type = ?`,
      [tenantId, level, ticketType]
    );

    for (const p of permissions) {
      const userId = Number(p.user_id);
      if (!userId) continue;
      await connection.execute(
        `INSERT INTO special_case_access_permissions
         (tenant_id, escalation_level, ticket_type, user_id, can_view, can_view_employee_details, can_edit, can_comment, can_perform_actions, can_resolve, can_close)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           can_view = VALUES(can_view),
           can_view_employee_details = VALUES(can_view_employee_details),
           can_edit = VALUES(can_edit),
           can_comment = VALUES(can_comment),
           can_perform_actions = VALUES(can_perform_actions),
           can_resolve = VALUES(can_resolve),
           can_close = VALUES(can_close)`,
        [
          tenantId,
          level,
          ticketType,
          userId,
          p.can_view ? 1 : 0,
          p.can_view_employee_details ? 1 : 0,
          p.can_edit ? 1 : 0,
          p.can_comment ? 1 : 0,
          p.can_perform_actions ? 1 : 0,
          p.can_resolve ? 1 : 0,
          p.can_close ? 1 : 0
        ]
      );
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  isSpecialCaseType,
  isAnonymousTicketType,
  isAnonymousCase,
  isCaseCreator,
  getSpecialCaseTypes,
  isSystemAdmin,
  getCaseTicketType,
  getCaseLevel,
  getCaseTenantId,
  getVisibilityFilter,
  getLevelUsers,
  getPermissions,
  getPermissionsByTicketType,
  getUserPermission,
  getAuthorizedUsers,
  canViewCase,
  canViewEmployeeDetails,
  canEditCase,
  canComment,
  canPerformActions,
  canResolveCase,
  canCloseCase,
  getCasePermissions,
  maskCaseData,
  maskAnonymousName,
  savePermissions,
  DEFAULT_LEVELS
};
