/**
 * Canonical role identifiers supported by the HCMS authentication module.
 * Values MUST match the live `users.role` ENUM:
 *   ('employee','hr_executive','department_head','system_admin')
 *
 * Friendly aliases map to the DB values:
 *   HR    -> 'hr_executive'
 *   ADMIN -> 'system_admin'
 */
const ROLES = {
  EMPLOYEE: 'employee',
  HR: 'hr_executive',
  DEPARTMENT_HEAD: 'department_head',
  ADMIN: 'system_admin',
  HR_MANAGER: 'hr_manager',
  CEO: 'ceo'
};

const ALL_ROLES = Object.values(ROLES);

/**
 * Returns true if the provided value is a non-empty role string.
 * Roles are now dynamic and stored in the `roles` table, so the backend
 * accepts any non-empty role value rather than an ENUM list.
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return typeof role === 'string' && role.trim().length > 0;
}

/**
 * Convert any role string into canonical lowercase snake_case.
 * "HR Manager" -> "hr_manager", "CEO" -> "ceo", "hr_executive" -> "hr_executive".
 * @param {string} role
 * @returns {string}
 */
function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

module.exports = {
  ROLES,
  ALL_ROLES,
  isValidRole,
  normalizeRole
};
