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
  ADMIN: 'system_admin'
};

const ALL_ROLES = Object.values(ROLES);

/**
 * Returns true if the provided value is one of the supported HCMS roles.
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return ALL_ROLES.includes(String(role || '').toLowerCase());
}

module.exports = {
  ROLES,
  ALL_ROLES,
  isValidRole
};
