const { pool } = require('../../shared/database/database');
const { resolvePreferredRole } = require('./intentResolver');
const { resolveFallbackRole } = require('./fallbackRoleResolver');
const { isSpecialCaseType, getAuthorizedUsers } = require('./specialCaseAccessService');

const DEFAULT_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Find the first active assigned user for a given escalation level.
 * Deterministic ordering: earliest assignment first, then by assignment id.
 *
 * @param {number} tenantId
 * @param {string} level - Escalation level (L1-L5)
 * @returns {Promise<{user_id: number, user_name: string, user_email: string, user_role: string}|null>}
 */
async function getAssigneeForLevel(tenantId, level) {
  const assignments = await getAllAssigneesForLevel(tenantId, level);
  return assignments.length > 0 ? assignments[0] : null;
}

/**
 * Find all active assigned users for a given escalation level.
 * Deterministic ordering: earliest assignment first, then by assignment id.
 *
 * @param {number} tenantId
 * @param {string} level - Escalation level (L1-L5)
 * @returns {Promise<Array<{user_id, user_name, user_email, user_role, user_department, level, level_id, assignment_id, assigned_at}>>}
 */
async function getAllAssigneesForLevel(tenantId, level) {
  const [assignments] = await pool.execute(
    `SELECT ela.user_id, u.name as user_name, u.email as user_email, u.role as user_role,
            u.department as user_department, el.level as level, el.id as level_id,
            ela.id as assignment_id, ela.assigned_at
     FROM escalation_level_assignments ela
     JOIN escalation_levels el ON ela.escalation_level_id = el.id
     JOIN users u ON ela.user_id = u.id
     WHERE el.tenant_id = ? AND el.level = ? AND el.is_active = TRUE
       AND ela.tenant_id = ? AND ela.is_active = TRUE
       AND u.is_active = TRUE
     ORDER BY ela.assigned_at ASC, ela.id ASC`,
    [tenantId, level, tenantId]
  );

  console.log('[assignmentService] getAllAssigneesForLevel:', {
    tenantId,
    level,
    matchCount: assignments.length
  });

  return assignments;
}

/**
 * Select the best assignee for a level.
 * Uses intent-based selection first, then broad-keyword fallback role resolution,
 * then falls back to the earliest configured assignee.
 *
 * @param {number} tenantId
 * @param {string} level
 * @param {object|null} context - Ticket context { category, subcategory, title, description, reportingMode, selectedDepartment, createdById }
 * @returns {Promise<object|null>} Best assignee or null if none configured.
 */
async function getBestAssigneeForLevel(tenantId, level, context) {
  let candidates = await getAllAssigneesForLevel(tenantId, level);
  if (candidates.length === 0) return null;

  // For special-case types (confidential, sensitive, anonymous), only users with
  // explicit view permission for this ticket type and level may receive the assignment.
  const ticketType = context?.reportingMode ? String(context.reportingMode).toLowerCase() : null;
  if (ticketType && isSpecialCaseType(ticketType)) {
    const authorized = await getAuthorizedUsers(tenantId, level, ticketType);
    if (authorized.length === 0) {
      console.log('[assignmentService] getBestAssigneeForLevel:', {
        tenantId,
        level,
        ticketType,
        selectionMode: 'no-authorized-users'
      });
      return null;
    }
    const authorizedIds = new Set(authorized.map(u => u.user_id));
    candidates = candidates.filter(c => authorizedIds.has(c.user_id));
    if (candidates.length === 0) {
      console.log('[assignmentService] getBestAssigneeForLevel:', {
        tenantId,
        level,
        ticketType,
        selectionMode: 'level-users-not-authorized'
      });
      return null;
    }
  }

  if (!context) return candidates[0];
  if (candidates.length === 1) return candidates[0];

  // Intent-first assignment: resolve the preferred role from ticket content,
  // then select the earliest configured user on this level that matches that role.
  const preferredRole = resolvePreferredRole(context);
  if (preferredRole) {
    const roleMatches = candidates.filter(c => normalizeRole(c.user_role) === preferredRole);
    if (roleMatches.length > 0) {
      console.log('[assignmentService] getBestAssigneeForLevel:', {
        tenantId,
        level,
        candidateCount: candidates.length,
        selectionMode: 'intent',
        preferredRole,
        matchedCount: roleMatches.length,
        selected: { user_id: roleMatches[0].user_id, user_name: roleMatches[0].user_name, user_role: roleMatches[0].user_role }
      });
      return roleMatches[0];
    }
  }

  // Fallback role resolver: broad keyword matching across all ticket fields.
  const fallbackRole = resolveFallbackRole(context);
  if (fallbackRole) {
    const roleMatches = candidates.filter(c => normalizeRole(c.user_role) === fallbackRole);
    if (roleMatches.length > 0) {
      console.log('[assignmentService] getBestAssigneeForLevel:', {
        tenantId,
        level,
        candidateCount: candidates.length,
        selectionMode: 'fallback',
        fallbackRole,
        matchedCount: roleMatches.length,
        selected: { user_id: roleMatches[0].user_id, user_name: roleMatches[0].user_name, user_role: roleMatches[0].user_role }
      });
      return roleMatches[0];
    }
  }

  // Final fallback: earliest configured assignee.
  console.log('[assignmentService] getBestAssigneeForLevel:', {
    tenantId,
    level,
    candidateCount: candidates.length,
    selectionMode: 'earliest-assigned',
    selected: { user_id: candidates[0].user_id, user_name: candidates[0].user_name, user_role: candidates[0].user_role }
  });
  return candidates[0];
}

/**
 * Check whether a level is configured and has an active assignee.
 * If context is provided, uses intent-based selection first, then falls back to
 * broad-keyword fallback role resolution, then to the earliest configured assignee.
 *
 * @param {number} tenantId
 * @param {string} level
 * @param {object|null} context - Optional ticket context { category, subcategory, title, description, reportingMode, selectedDepartment, createdById }
 * @returns {Promise<{valid: boolean, reason?: string, assignee?: object, levelId?: number}>}
 */
async function validateLevelAssignment(tenantId, level, context = null) {
  const [levels] = await pool.execute(
    `SELECT id, level, name, description
     FROM escalation_levels
     WHERE tenant_id = ? AND level = ? AND is_active = TRUE`,
    [tenantId, level]
  );

  console.log('[assignmentService] validateLevelAssignment levels found:', {
    tenantId,
    level,
    levelCount: levels.length,
    levels: levels.map(l => ({ id: l.id, level: l.level, name: l.name, is_active: true }))
  });

  if (levels.length === 0) {
    return { valid: false, reason: `Escalation level ${level} is not configured for this tenant` };
  }

  const assignee = context
    ? await getBestAssigneeForLevel(tenantId, level, context)
    : await getAssigneeForLevel(tenantId, level);
  if (!assignee) {
    const ticketType = context?.reportingMode ? String(context.reportingMode).toLowerCase() : null;
    const isSpecial = ticketType && isSpecialCaseType(ticketType);
    return {
      valid: false,
      reason: isSpecial
        ? `No authorized user is configured for ${ticketType} cases at escalation level ${level}. Please configure Special Case Access before creating or escalating this ticket type.`
        : `No active user is assigned to escalation level ${level}. Please configure an assignee before creating or escalating cases.`,
      levelId: levels[0].id
    };
  }

  return { valid: true, assignee, levelId: levels[0].id };
}

/**
 * Get the next escalation level in sequence.
 * Uses the configured active levels when available; otherwise falls back to L1-L5.
 *
 * @param {number} tenantId
 * @param {string} currentLevel
 * @param {string[]|null} knownLevels - Optional pre-fetched active levels to avoid a second DB query
 * @returns {Promise<{nextLevel: string|null, levels: string[]}>}
 */
async function getNextEscalationLevel(tenantId, currentLevel, knownLevels = null) {
  let levels;
  if (knownLevels && Array.isArray(knownLevels) && knownLevels.length > 0) {
    levels = knownLevels;
  } else {
    const [configuredLevels] = await pool.execute(
      `SELECT level FROM escalation_levels
       WHERE tenant_id = ? AND is_active = TRUE
       ORDER BY FIELD(level, 'L1', 'L2', 'L3', 'L4', 'L5')`,
      [tenantId]
    );

    levels = configuredLevels.length > 0
      ? configuredLevels.map(row => row.level)
      : DEFAULT_LEVELS;
  }

  const currentIndex = levels.indexOf(currentLevel);
  if (currentIndex === -1 || currentIndex === levels.length - 1) {
    return { nextLevel: null, levels };
  }

  return { nextLevel: levels[currentIndex + 1], levels };
}

module.exports = {
  getAssigneeForLevel,
  getAllAssigneesForLevel,
  getBestAssigneeForLevel,
  validateLevelAssignment,
  getNextEscalationLevel,
  DEFAULT_LEVELS
};
