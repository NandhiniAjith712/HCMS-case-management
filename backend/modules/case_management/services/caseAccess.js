/**
 * Case access control helpers.
 *
 * Centralizes role-based checks for HCMS case management so that role strings
 * are not scattered across route handlers. The behavior matches the current
 * business rules exactly; only the implementation is centralized.
 */

const { isSpecialCaseType } = require('./specialCaseAccessService');

const INTERNAL_STAFF_ROLES = ['hr_executive', 'hr_manager', 'system_admin', 'department_head', 'ceo'];

function normalizeUserRole(user) {
  return String(user?.role || '').trim().toLowerCase();
}

function isEmployee(user) {
  return normalizeUserRole(user) === 'employee';
}

function isDepartmentHead(user) {
  return normalizeUserRole(user) === 'department_head';
}

function isHrExecutive(user) {
  return normalizeUserRole(user) === 'hr_executive';
}

function isHrManager(user) {
  return normalizeUserRole(user) === 'hr_manager';
}

function isSystemAdmin(user) {
  return normalizeUserRole(user) === 'system_admin';
}

function isInternalStaff(user) {
  return INTERNAL_STAFF_ROLES.includes(normalizeUserRole(user));
}

function isHrOrAdmin(user) {
  return isHrExecutive(user) || isHrManager(user) || isSystemAdmin(user);
}

/**
 * Check if a user can access a specific case detail.
 * Employees can only view their own cases.
 * Department heads can view their own assigned cases and escalated cases.
 * All other staff can view cases.
 *
 * @param {object} user
 * @param {object} ticket
 * @returns {boolean}
 */
function canAccessCaseDetail(user, ticket) {
  if (isEmployee(user)) {
    return Number(ticket.created_by) === Number(user.id);
  }

  if (isDepartmentHead(user)) {
    return (
      Number(ticket.assigned_to) === Number(user.id) ||
      String(ticket.status).toLowerCase() === 'escalated' ||
      isSpecialCaseType(ticket.reporting_mode)
    );
  }

  return true;
}

/**
 * Check if a user can view internal messages or add/view notes.
 * Currently limited to internal staff: HR Executive, System Admin, Department Head.
 *
 * @param {object} user
 * @returns {boolean}
 */
function canAccessInternalContent(user) {
  return isInternalStaff(user);
}

module.exports = {
  INTERNAL_STAFF_ROLES,
  isEmployee,
  isDepartmentHead,
  isHrExecutive,
  isHrManager,
  isSystemAdmin,
  isInternalStaff,
  isHrOrAdmin,
  canAccessCaseDetail,
  canAccessInternalContent
};
