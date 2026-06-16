/**
 * Lightweight typed error for the auth module.
 * Carries an HTTP status code so the controller can map it to a response
 * without leaking internal details.
 */
class AuthError extends Error {
  /**
   * @param {string} message - Safe, client-facing message.
   * @param {number} [statusCode=400] - HTTP status code.
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

module.exports = AuthError;
