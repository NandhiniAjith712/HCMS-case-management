const authService = require('./auth.service');
const { HTTP_STATUS, USER_ROLES } = require('../../shared/utils/constants');
const { AppError } = require('../../shared/middleware/errorHandler');

class AuthMiddleware {
  authenticateToken(req, res, next) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        throw new AppError('Access token required', HTTP_STATUS.UNAUTHORIZED);
      }

      const decoded = authService.verifyToken(token);
      req.user = decoded;
      next();
    } catch (error) {
      next(new AppError('Invalid or expired token', HTTP_STATUS.UNAUTHORIZED));
    }
  }

  authorizeRole(...roles) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
        }

        if (!roles.includes(req.user.role)) {
          throw new AppError('Insufficient permissions', HTTP_STATUS.FORBIDDEN);
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  authorizeAgent(req, res, next) {
    return this.authorizeRole(USER_ROLES.AGENT, USER_ROLES.MANAGER, USER_ROLES.CEO, USER_ROLES.ADMIN)(req, res, next);
  }

  authorizeManager(req, res, next) {
    return this.authorizeRole(USER_ROLES.MANAGER, USER_ROLES.CEO, USER_ROLES.ADMIN)(req, res, next);
  }

  authorizeCEO(req, res, next) {
    return this.authorizeRole(USER_ROLES.CEO, USER_ROLES.ADMIN)(req, res, next);
  }

  authorizeAdmin(req, res, next) {
    return this.authorizeRole(USER_ROLES.ADMIN)(req, res, next);
  }

  // Optional authentication - doesn't throw error if no token
  optionalAuth(req, res, next) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        const decoded = authService.verifyToken(token);
        req.user = decoded;
      }
      
      next();
    } catch (error) {
      // Continue without authentication
      next();
    }
  }
}

module.exports = new AuthMiddleware(); 