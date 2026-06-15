// Ticket Status Constants
const TICKET_STATUS = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
  ESCALATED: 'escalated'
};

// Priority Levels
const PRIORITY_LEVELS = {
  P0: 'P0', // Critical
  P1: 'P1', // High
  P2: 'P2', // Medium
  P3: 'P3'  // Low
};

// User Roles
const USER_ROLES = {
  CUSTOMER: 'customer',
  AGENT: 'agent',
  MANAGER: 'manager',
  CEO: 'ceo',
  ADMIN: 'admin'
};

// SLA Time Constants (in minutes)
const SLA_TIMES = {
  RESPONSE: {
    P0: 30,   // 30 minutes
    P1: 120,  // 2 hours
    P2: 480,  // 8 hours
    P3: 1440  // 24 hours
  },
  RESOLUTION: {
    P0: 240,  // 4 hours
    P1: 1440, // 24 hours
    P2: 2880, // 48 hours
    P3: 4320  // 72 hours
  }
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

// File Upload Constants
const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'],
  UPLOAD_PATH: './uploads'
};

// Notification Types
const NOTIFICATION_TYPES = {
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  SMS: 'sms',
  IN_APP: 'in_app'
};

module.exports = {
  TICKET_STATUS,
  PRIORITY_LEVELS,
  USER_ROLES,
  SLA_TIMES,
  HTTP_STATUS,
  UPLOAD_CONFIG,
  NOTIFICATION_TYPES
}; 