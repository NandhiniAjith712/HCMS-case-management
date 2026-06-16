const authService = require('../services/auth.service');

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { success, token, user }
 */
async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    const { token, user } = await authService.login(email, password);
    return res.status(200).json({ success: true, token, user });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('[auth.controller] login error:', err);
      return res.status(500).json({ success: false, message: 'Authentication failed' });
    }
    return res.status(status).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/auth/me
 * Requires authenticate middleware (req.user populated).
 * Returns: { success, user }
 */
async function getCurrentUser(req, res) {
  try {
    // req.user is already the live, validated public user from the middleware.
    return res.status(200).json({ success: true, user: req.user });
  } catch (err) {
    console.error('[auth.controller] getCurrentUser error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load current user' });
  }
}

module.exports = {
  login,
  getCurrentUser
};
