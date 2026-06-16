const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../shared/database/database');
const AuthError = require('../errors/AuthError');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Columns safe to return to clients (never include the password hash).
const PUBLIC_USER_COLUMNS = 'id, email, name, role, department, tenant_id';

/**
 * Shape a raw DB row into a safe public user object.
 * @param {object} row
 */
function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    department: row.department ?? null,
    tenantId: row.tenant_id ?? null
  };
}

/**
 * Sign a JWT for an authenticated user.
 * Payload uses `userId` + `role` to stay compatible with the existing
 * shared auth middleware token contract.
 * @param {{id: number, role: string}} user
 * @returns {string}
 */
function generateToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {object} decoded payload
 * @throws {AuthError} on invalid/expired tokens
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new AuthError('Invalid or expired token', 401);
  }
}

/**
 * Authenticate a user with email + password.
 * Works with the existing `users` table (password_hash column).
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{token: string, user: object}>}
 * @throws {AuthError}
 */
async function login(email, password) {
  if (!email || !password) {
    throw new AuthError('Email and password are required', 400);
  }

  const [rows] = await pool.execute(
    `SELECT id, email, name, role, password, department, tenant_id
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  const user = rows[0];

  // Use a uniform error to avoid leaking which accounts exist.
  if (!user || !user.password) {
    throw new AuthError('Invalid credentials', 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    throw new AuthError('Invalid credentials', 401);
  }

  const token = generateToken(user);

  return { token, user: toPublicUser(user) };
}

/**
 * Fetch the current user by id (used by the get-current-user API and middleware).
 * @param {number} userId
 * @returns {Promise<object|null>} public user or null if not found/inactive
 */
async function getCurrentUser(userId) {
  if (!userId) return null;

  const [rows] = await pool.execute(
    `SELECT ${PUBLIC_USER_COLUMNS}
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  return toPublicUser(rows[0]);
}

module.exports = {
  login,
  getCurrentUser,
  generateToken,
  verifyToken,
  toPublicUser
};
