const express = require('express');
const { body } = require('express-validator');
const authController = require('./auth.controller');
const authMiddleware = require('./auth.middleware');

const router = express.Router();

// Validation schemas
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['customer', 'agent', 'manager', 'ceo', 'admin']).withMessage('Invalid role')
];

const passwordResetValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
];

const passwordUpdateValidation = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
];

const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required')
];

// Authentication Routes
router.post('/login', loginValidation, authController.login);
router.post('/register', registerValidation, authController.register);
router.post('/validate', authMiddleware.authenticateToken, authController.validateToken);
router.post('/logout', authMiddleware.authenticateToken, authController.logout);

// Password Management Routes
router.post('/forgot-password', passwordResetValidation, authController.forgotPassword);
router.post('/reset-password', passwordUpdateValidation, authController.resetPassword);
router.post('/change-password', authMiddleware.authenticateToken, changePasswordValidation, authController.changePassword);

// Account Management Routes
router.get('/profile', authMiddleware.authenticateToken, authController.getProfile);
router.put('/profile', authMiddleware.authenticateToken, updateProfileValidation, authController.updateProfile);
router.delete('/account', authMiddleware.authenticateToken, authController.deleteAccount);

// Email Verification Routes
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authMiddleware.authenticateToken, authController.resendVerification);

// Security Routes
router.get('/sessions', authMiddleware.authenticateToken, authController.getActiveSessions);
router.post('/revoke-session', authMiddleware.authenticateToken, authController.revokeSession);
router.post('/revoke-all-sessions', authMiddleware.authenticateToken, authController.revokeAllSessions);

// Refresh Token Routes
router.post('/refresh', authController.refreshToken);

module.exports = router; 