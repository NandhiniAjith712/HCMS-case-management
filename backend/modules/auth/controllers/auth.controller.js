const authService = require('../services/auth.service');
const { pool } = require('../../shared/database/database');
const bcrypt = require('bcrypt');

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

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Requires authenticate middleware.
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const user = req.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    // Get current password hash from database
    const [rows] = await pool.execute(
      'SELECT password FROM users WHERE id = ?',
      [user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.execute(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, user.id]
    );

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('[auth.controller] changePassword error:', err);
    return res.status(500).json({ success: false, message: 'Failed to change password' });
  }
}

module.exports = {
  login,
  getCurrentUser,
  changePassword
};
