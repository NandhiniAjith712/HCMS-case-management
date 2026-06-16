/**
 * HCMS frontend auth constants.
 * Values must match the backend roles in modules/auth/constants/roles.js
 */

export const ROLES = {
  EMPLOYEE: 'employee',
  HR: 'hr_executive',
  DEPARTMENT_HEAD: 'department_head',
  ADMIN: 'system_admin'
};

/** All valid HCMS role values. */
export const ALL_ROLES = Object.values(ROLES);

/** Human-friendly labels for display. */
export const ROLE_LABELS = {
  [ROLES.EMPLOYEE]: 'Employee',
  [ROLES.HR]: 'HR Executive',
  [ROLES.DEPARTMENT_HEAD]: 'Department Head',
  [ROLES.ADMIN]: 'System Admin'
};

/** Dashboard route per role (after login redirect). */
export const ROLE_DASHBOARD_ROUTE = {
  [ROLES.EMPLOYEE]: '/hcms/employee',
  [ROLES.HR]: '/hcms/hr',
  [ROLES.DEPARTMENT_HEAD]: '/hcms/department-head',
  [ROLES.ADMIN]: '/hcms/admin'
};

/** Which roles can access a given route path.
 *  Used by the RoleGuard to enforce authorization. */
export const ROUTE_ROLE_MAP = {
  '/hcms/employee': [ROLES.EMPLOYEE, ROLES.HR, ROLES.DEPARTMENT_HEAD, ROLES.ADMIN],
  '/hcms/hr': [ROLES.HR, ROLES.ADMIN],
  '/hcms/department-head': [ROLES.DEPARTMENT_HEAD, ROLES.ADMIN],
  '/hcms/admin': [ROLES.ADMIN]
};

/** localStorage / sessionStorage key names (prefixed to avoid collision with ITSM keys). */
export const STORAGE_KEYS = {
  USER: 'hcmsUser',
  TOKEN: 'hcmsToken',
  LOGIN_TIMESTAMP: 'hcmsLoginAt'
};

/** Returns the first allowed role for a route, or null if unrestricted. */
export function getRequiredRoles(path) {
  const exact = ROUTE_ROLE_MAP[path];
  if (exact) return exact;
  // Support nested routes (e.g. /hcms/admin/settings → /hcms/admin)
  const prefix = Object.keys(ROUTE_ROLE_MAP)
    .filter((k) => path.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? ROUTE_ROLE_MAP[prefix] : null;
}

/** True if the given role value is a recognized HCMS role. */
export function isValidHcmsRole(role) {
  return ALL_ROLES.includes(String(role || '').toLowerCase());
}
