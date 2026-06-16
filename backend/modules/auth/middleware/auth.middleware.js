const authService = require('../services/auth.service');
const { isValidRole } = require('../constants/roles');

/**
 * Extract a Bearer token from the Authorization header.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  const header = req.headers['authorization'] || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return token.trim();
  return null;
}

/**
 * Authenticate the request via JWT and attach the live user to req.user.
 * Re-validates the user against the DB so disabled/deleted accounts are rejected.
 */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const decoded = authService.verifyToken(token);
    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    const user = await authService.getCurrentUser(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer active' });
    }

    req.user = user;
    return next();
  } catch (err) {
    const status = err.statusCode || 401;
    return res.status(status).json({ success: false, message: err.message || 'Unauthorized' });
  }
}

/**
 * Restrict a route to one or more roles.
 * Usage: router.get('/x', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.HR), handler)
 * @param {...string} allowedRoles
 */
function authorizeRoles(...allowedRoles) {
  const normalized = allowedRoles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const role = String(req.user.role || '').toLowerCase();
    if (!normalized.includes(role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    return next();
  };
}

module.exports = {
  authenticate,
  authorizeRoles,
  isValidRole
};
