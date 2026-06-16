const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Public: authenticate with email + password.
router.post('/login', authController.login);

// Protected: return the currently authenticated user.
router.get('/me', authenticate, authController.getCurrentUser);

module.exports = router;
