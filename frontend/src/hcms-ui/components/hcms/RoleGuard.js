import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRequiredRoles, ROLE_DASHBOARD_ROUTE } from '../../modules/auth/constants';

/**
 * RoleGuard — wraps a route and enforces:
 * 1. User must be authenticated (redirect → /hcms/login)
 * 2. User's role must be in the allowed set for this path (redirect → their dashboard)
 *
 * Usage:
 *   <Route path="/hcms/admin" element={
 *     <RoleGuard>
 *       <AdminDashboard />
 *     </RoleGuard>
 *   } />
 */
function RoleGuard({ children }) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading session…</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/hcms/login" replace />;
  }

  const path = window.location.pathname;
  const requiredRoles = getRequiredRoles(path);

  // If route has no role restriction, allow through.
  if (!requiredRoles || requiredRoles.length === 0) {
    return children;
  }

  const userRole = String(user.role || '').toLowerCase();
  const isAllowed = requiredRoles.includes(userRole);

  if (!isAllowed) {
    // Redirect to the user's own dashboard instead of showing an error page.
    const fallback = ROLE_DASHBOARD_ROUTE[userRole] || '/hcms/login';
    return <Navigate to={fallback} replace />;
  }

  return children;
}

export default RoleGuard;
