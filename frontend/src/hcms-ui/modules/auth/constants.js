/**
 * HCMS frontend auth constants.
 * Values must match the backend roles in modules/auth/constants/roles.js
 */

export const ROLES = {
  EMPLOYEE: 'employee',
  HR: 'hr_executive',
  DEPARTMENT_HEAD: 'department_head',
  ADMIN: 'system_admin',
  HR_MANAGER: 'hr_manager',
  CEO: 'ceo'
};

/** All valid HCMS role values. */
export const ALL_ROLES = Object.values(ROLES);

/** Human-friendly labels for display. */
export const ROLE_LABELS = {
  [ROLES.EMPLOYEE]: 'Employee',
  [ROLES.HR]: 'HR Executive',
  [ROLES.DEPARTMENT_HEAD]: 'Department Head',
  [ROLES.ADMIN]: 'System Admin',
  [ROLES.HR_MANAGER]: 'HR Manager',
  [ROLES.CEO]: 'CEO'
};

/** Dashboard route per role (after login redirect). */
export const ROLE_DASHBOARD_ROUTE = {
  [ROLES.EMPLOYEE]: '/hcms/dashboard',
  [ROLES.HR]: '/hcms/dashboard',
  [ROLES.DEPARTMENT_HEAD]: '/hcms/dept-dashboard',
  [ROLES.ADMIN]: '/hcms/admin-dashboard',
  [ROLES.HR_MANAGER]: '/hcms/hr-manager-dashboard',
  [ROLES.CEO]: '/hcms/ceo-dashboard'
};

/** Which roles can access a given route path.
 *  Used by the RoleGuard to enforce authorization. */
export const ROUTE_ROLE_MAP = {
  '/hcms/dashboard': [ROLES.EMPLOYEE, ROLES.HR, ROLES.ADMIN],
  '/hcms/dept-dashboard': [ROLES.DEPARTMENT_HEAD, ROLES.ADMIN],
  '/hcms/dept-escalations': [ROLES.DEPARTMENT_HEAD, ROLES.ADMIN],
  '/hcms/dept-investigations': [ROLES.DEPARTMENT_HEAD, ROLES.ADMIN],
  '/hcms/dept-decisions': [ROLES.DEPARTMENT_HEAD, ROLES.ADMIN],
  '/hcms/dept-returned': [ROLES.DEPARTMENT_HEAD, ROLES.ADMIN],
  '/hcms/admin-dashboard': [ROLES.ADMIN],
  '/hcms/admin-users': [ROLES.ADMIN],
  '/hcms/admin-roles': [ROLES.ADMIN],
  '/hcms/admin-departments': [ROLES.ADMIN],
  '/hcms/admin-policies': [ROLES.ADMIN],
  '/hcms/admin-routing': [ROLES.ADMIN],
  '/hcms/admin-activity': [ROLES.ADMIN],
  '/hcms/admin-tenant': [ROLES.ADMIN],
  '/hcms/admin-escalation-levels': [ROLES.ADMIN],
  '/hcms/admin-case-access': [ROLES.ADMIN],
  '/hcms/admin-tickets': [ROLES.ADMIN],
  '/hcms/admin-tickets/:id': [ROLES.ADMIN],
  '/hcms/tickets': [ROLES.EMPLOYEE, ROLES.HR, ROLES.ADMIN],
  '/hcms/tickets/new': [ROLES.EMPLOYEE],
  '/hcms/assigned': [ROLES.HR, ROLES.ADMIN],
  '/hcms/escalations': [ROLES.HR, ROLES.ADMIN],
  '/hcms/employees': [ROLES.HR, ROLES.ADMIN],
  '/hcms/employees/:id': [ROLES.HR, ROLES.ADMIN],
  '/hcms/hr-manager-dashboard': [ROLES.HR_MANAGER, ROLES.ADMIN],
  '/hcms/hr-manager-tickets': [ROLES.HR_MANAGER, ROLES.ADMIN],
  '/hcms/hr-manager-tickets/:id': [ROLES.HR_MANAGER, ROLES.ADMIN],
  '/hcms/ceo-dashboard': [ROLES.CEO, ROLES.ADMIN],
  '/hcms/ceo-tickets': [ROLES.CEO, ROLES.ADMIN],
  '/hcms/ceo-tickets/:id': [ROLES.CEO, ROLES.ADMIN],
  '/hcms/notifications': [ROLES.EMPLOYEE, ROLES.HR, ROLES.DEPARTMENT_HEAD, ROLES.HR_MANAGER, ROLES.CEO, ROLES.ADMIN],
  '/hcms/settings': [ROLES.EMPLOYEE, ROLES.HR, ROLES.HR_MANAGER, ROLES.CEO, ROLES.ADMIN],
  '/hcms/employee': [ROLES.EMPLOYEE, ROLES.HR, ROLES.DEPARTMENT_HEAD, ROLES.HR_MANAGER, ROLES.CEO, ROLES.ADMIN],
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

/** True if the given role value is a recognized HCMS role.
 *  Since roles can now be created dynamically by System Administrators,
 *  any non-empty role value returned by the backend is accepted.
 */
export function isValidHcmsRole(role) {
  return !!String(role || '').trim();
}
