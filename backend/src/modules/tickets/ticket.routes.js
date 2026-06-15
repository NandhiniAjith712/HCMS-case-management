const express = require('express');
const { body } = require('express-validator');
const ticketController = require('./ticket.controller');
const authMiddleware = require('../auth/auth.middleware');
const upload = require('../../middleware/upload');

const router = express.Router();

// Validation schemas
const createTicketValidation = [
  body('name').trim().isLength({ min: 2, max: 30 }).withMessage('Name must be between 2 and 30 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('mobile').optional().isLength({ min: 7, max: 15 }).withMessage('Mobile number must include country code and be 7-15 digits'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('issueType').optional().isLength({ max: 50 }).withMessage('Issue type must be less than 50 characters'),
  body('issueTypeOther').optional().isLength({ max: 100 }).withMessage('Other issue type must be less than 100 characters'),
  body('issueTitle').trim().isLength({ min: 5, max: 150 }).withMessage('Issue title must be between 5 and 150 characters')
];

const updateStatusValidation = [
  body('status').isIn(['new', 'in_progress', 'closed', 'escalated']).withMessage('Invalid status')
];

const assignTicketValidation = [
  body('assignedTo').isInt().withMessage('Assigned user ID must be a number')
];

// Public routes (no authentication required)
router.post('/', upload.single('attachment'), createTicketValidation, ticketController.createTicket);

// Protected routes (authentication required)
router.get('/', authMiddleware.authenticateToken, ticketController.getTickets);
router.get('/stats', authMiddleware.authenticateToken, ticketController.getTicketStats);
router.get('/:id', authMiddleware.authenticateToken, ticketController.getTicketById);
router.put('/:id/status', authMiddleware.authenticateToken, updateStatusValidation, ticketController.updateTicketStatus);
router.put('/:id/assign', authMiddleware.authenticateToken, assignTicketValidation, ticketController.assignTicket);

module.exports = router; 