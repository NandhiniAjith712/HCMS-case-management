const { body, validationResult } = require('express-validator');

// Validation schemas for WhatsApp messages
const validateWhatsAppMessage = [
  body('phoneNumber')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^\+[1-9]\d{1,14}$/)
    .withMessage('Phone number must be in international format (e.g., +1234567890)'),
  
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters')
];

// Validation for ticket creation data
const validateTicketData = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  
  body('mobile')
    .notEmpty()
    .withMessage('Mobile number is required')
    .matches(/^\+[1-9]\d{1,14}$/)
    .withMessage('Mobile number must be in international format'),
  
  body('issueTitle')
    .notEmpty()
    .withMessage('Issue title is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Issue title must be between 5 and 200 characters'),
  
  body('issueType')
    .notEmpty()
    .withMessage('Issue type is required')
    .isIn(['Technical Support', 'Billing Issue', 'Account Access', 'Product Inquiry', 'Bug Report', 'Feature Request', 'Other'])
    .withMessage('Invalid issue type'),
  
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters')
];

// Validation for webhook verification
const validateWebhookVerification = [
  body('object')
    .equals('whatsapp_business_account')
    .withMessage('Invalid webhook object'),
  
  body('entry')
    .isArray({ min: 1 })
    .withMessage('Webhook entry must be an array with at least one item'),
  
  body('entry.*.changes')
    .isArray({ min: 1 })
    .withMessage('Webhook changes must be an array with at least one item')
];

// Custom validation functions
const validatePhoneNumber = (phoneNumber) => {
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateName = (name) => {
  const nameRegex = /^[a-zA-Z\s]{2,100}$/;
  return nameRegex.test(name.trim());
};

const validateIssueTitle = (title) => {
  return title && title.trim().length >= 5 && title.trim().length <= 200;
};

const validateDescription = (description) => {
  return description && description.trim().length >= 10 && description.trim().length <= 1000;
};

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Rate limiting for WhatsApp messages
const rateLimitWhatsApp = (req, res, next) => {
  const phoneNumber = req.body.phoneNumber;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 5; // 5 messages per minute per phone number
  
  if (!req.app.locals.whatsappRateLimit) {
    req.app.locals.whatsappRateLimit = new Map();
  }
  
  const userRequests = req.app.locals.whatsappRateLimit.get(phoneNumber) || [];
  const validRequests = userRequests.filter(time => now - time < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Please wait before sending another message.'
    });
  }
  
  validRequests.push(now);
  req.app.locals.whatsappRateLimit.set(phoneNumber, validRequests);
  next();
};

module.exports = {
  validateWhatsAppMessage,
  validateTicketData,
  validateWebhookVerification,
  handleValidationErrors,
  rateLimitWhatsApp,
  validatePhoneNumber,
  validateEmail,
  validateName,
  validateIssueTitle,
  validateDescription
}; 