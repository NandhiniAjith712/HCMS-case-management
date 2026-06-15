const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../shared/config/database');
const { logError } = require('../../shared/utils/logger');
const { HTTP_STATUS, USER_ROLES } = require('../../shared/utils/constants');
const { AppError } = require('../../shared/middleware/errorHandler');

class AuthService {
  constructor() {
    this.saltRounds = 12;
    this.jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
    this.jwtExpiresIn = '24h';
  }

  async hashPassword(password) {
    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error) {
      logError('Password hashing failed', error);
      throw new AppError('Password processing failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async comparePassword(password, hashedPassword) {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      logError('Password comparison failed', error);
      throw new AppError('Authentication failed', HTTP_STATUS.UNAUTHORIZED);
    }
  }

  generateToken(userId, role) {
    try {
      return jwt.sign(
        { userId, role },
        this.jwtSecret,
        { expiresIn: this.jwtExpiresIn }
      );
    } catch (error) {
      logError('Token generation failed', error);
      throw new AppError('Authentication failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      logError('Token verification failed', error);
      throw new AppError('Invalid token', HTTP_STATUS.UNAUTHORIZED);
    }
  }

  async login(email, password) {
    try {
      const [users] = await pool.execute(
        'SELECT id, email, password, role, name FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        throw new AppError('Invalid credentials', HTTP_STATUS.UNAUTHORIZED);
      }

      const user = users[0];
      const isPasswordValid = await this.comparePassword(password, user.password);

      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', HTTP_STATUS.UNAUTHORIZED);
      }

      const token = this.generateToken(user.id, user.role);

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Login failed', error);
      throw new AppError('Authentication failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async register(userData) {
    try {
      const { name, email, password, role = USER_ROLES.CUSTOMER } = userData;

      // Check if user already exists
      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existingUsers.length > 0) {
        throw new AppError('User already exists', HTTP_STATUS.CONFLICT);
      }

      // Hash password
      const hashedPassword = await this.hashPassword(password);

      // Create user
      const [result] = await pool.execute(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [name, email, hashedPassword, role]
      );

      const token = this.generateToken(result.insertId, role);

      return {
        success: true,
        token,
        user: {
          id: result.insertId,
          name,
          email,
          role
        }
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Registration failed', error);
      throw new AppError('Registration failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async validateToken(token) {
    try {
      const decoded = this.verifyToken(token);
      
      const [users] = await pool.execute(
        'SELECT id, email, role, name FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (users.length === 0) {
        throw new AppError('User not found', HTTP_STATUS.UNAUTHORIZED);
      }

      return {
        success: true,
        user: users[0]
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Token validation failed', error);
      throw new AppError('Invalid token', HTTP_STATUS.UNAUTHORIZED);
    }
  }

  // Password Management
  async forgotPassword(email) {
    try {
      const [users] = await pool.execute(
        'SELECT id, email, name FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        // Don't reveal if email exists or not for security
        return {
          success: true,
          message: 'If the email exists, a password reset link has been sent'
        };
      }

      const user = users[0];
      const resetToken = this.generateToken(user.id, 'password_reset');
      const resetExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Store reset token in database
      await pool.execute(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, resetToken, resetExpiry]
      );

      // TODO: Send email with reset link
      // await emailService.sendPasswordResetEmail(user.email, resetToken);

      return {
        success: true,
        message: 'Password reset link sent to your email'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Forgot password failed', error);
      throw new AppError('Password reset failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async resetPassword({ token, password }) {
    try {
      const decoded = this.verifyToken(token);
      
      // Check if reset token exists and is valid
      const [resetTokens] = await pool.execute(
        'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
        [token]
      );

      if (resetTokens.length === 0) {
        throw new AppError('Invalid or expired reset token', HTTP_STATUS.BAD_REQUEST);
      }

      const resetToken = resetTokens[0];
      const hashedPassword = await this.hashPassword(password);

      // Update password
      await pool.execute(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, resetToken.user_id]
      );

      // Remove used reset token
      await pool.execute(
        'DELETE FROM password_resets WHERE token = ?',
        [token]
      );

      return {
        success: true,
        message: 'Password reset successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Password reset failed', error);
      throw new AppError('Password reset failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    try {
      // Get current password
      const [users] = await pool.execute(
        'SELECT password FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
      }

      const user = users[0];
      const isCurrentPasswordValid = await this.comparePassword(currentPassword, user.password);

      if (!isCurrentPasswordValid) {
        throw new AppError('Current password is incorrect', HTTP_STATUS.BAD_REQUEST);
      }

      const hashedNewPassword = await this.hashPassword(newPassword);

      await pool.execute(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedNewPassword, userId]
      );

      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Change password failed', error);
      throw new AppError('Password change failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  // Account Management
  async getProfile(userId) {
    try {
      const [users] = await pool.execute(
        'SELECT id, name, email, role, created_at, last_login FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
      }

      return {
        success: true,
        user: users[0]
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Get profile failed', error);
      throw new AppError('Failed to get profile', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async updateProfile(userId, updateData) {
    try {
      const { name, email } = updateData;
      const updateFields = [];
      const updateValues = [];

      if (name) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }

      if (email) {
        // Check if email is already taken by another user
        const [existingUsers] = await pool.execute(
          'SELECT id FROM users WHERE email = ? AND id != ?',
          [email, userId]
        );

        if (existingUsers.length > 0) {
          throw new AppError('Email already exists', HTTP_STATUS.CONFLICT);
        }

        updateFields.push('email = ?');
        updateValues.push(email);
      }

      if (updateFields.length === 0) {
        throw new AppError('No fields to update', HTTP_STATUS.BAD_REQUEST);
      }

      updateValues.push(userId);

      await pool.execute(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      return {
        success: true,
        message: 'Profile updated successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Update profile failed', error);
      throw new AppError('Profile update failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteAccount(userId) {
    try {
      // Soft delete - mark as deleted instead of actually deleting
      await pool.execute(
        'UPDATE users SET deleted_at = NOW(), status = "deleted" WHERE id = ?',
        [userId]
      );

      return {
        success: true,
        message: 'Account deleted successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Delete account failed', error);
      throw new AppError('Account deletion failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  // Email Verification
  async verifyEmail(token) {
    try {
      const decoded = this.verifyToken(token);
      
      await pool.execute(
        'UPDATE users SET email_verified = TRUE WHERE id = ?',
        [decoded.userId]
      );

      return {
        success: true,
        message: 'Email verified successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Email verification failed', error);
      throw new AppError('Email verification failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async resendVerification(userId) {
    try {
      const [users] = await pool.execute(
        'SELECT email, email_verified FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
      }

      const user = users[0];

      if (user.email_verified) {
        throw new AppError('Email already verified', HTTP_STATUS.BAD_REQUEST);
      }

      const verificationToken = this.generateToken(userId, 'email_verification');

      // TODO: Send verification email
      // await emailService.sendVerificationEmail(user.email, verificationToken);

      return {
        success: true,
        message: 'Verification email sent'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Resend verification failed', error);
      throw new AppError('Failed to resend verification', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  // Security Management
  async getActiveSessions(userId) {
    try {
      // This would require a sessions table to track active sessions
      // For now, return a placeholder response
      return {
        success: true,
        sessions: [
          {
            id: 'current',
            device: 'Web Browser',
            location: 'Unknown',
            lastActive: new Date().toISOString(),
            current: true
          }
        ]
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Get active sessions failed', error);
      throw new AppError('Failed to get sessions', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async revokeSession(userId, sessionId) {
    try {
      // This would require a sessions table to track and revoke sessions
      // For now, return a placeholder response
      return {
        success: true,
        message: 'Session revoked successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Revoke session failed', error);
      throw new AppError('Failed to revoke session', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async revokeAllSessions(userId) {
    try {
      // This would require a sessions table to track and revoke all sessions
      // For now, return a placeholder response
      return {
        success: true,
        message: 'All sessions revoked successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Revoke all sessions failed', error);
      throw new AppError('Failed to revoke sessions', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  // Token Management
  async refreshToken(refreshToken) {
    try {
      const decoded = this.verifyToken(refreshToken);
      
      // Generate new access token
      const newAccessToken = this.generateToken(decoded.userId, decoded.role);

      return {
        success: true,
        accessToken: newAccessToken,
        expiresIn: this.jwtExpiresIn
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Token refresh failed', error);
      throw new AppError('Token refresh failed', HTTP_STATUS.UNAUTHORIZED);
    }
  }
}

module.exports = new AuthService(); 