const express = require('express');

const cors = require('cors');

const helmet = require('helmet');

const rateLimit = require('express-rate-limit');

const http = require('http');

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, 'config.env') });

// Global error handlers to catch crashes
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION - Server will crash:');
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  console.error('Route causing crash:', err.stack.split('\n')[1]);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED PROMISE REJECTION:');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('Stack:', reason.stack || 'No stack trace');
});



// Import database and routes

const { testConnection, initializeDatabase } = require('./database');

const ticketsRouter = require('./routes/tickets');

const repliesRouter = require('./routes/communication/replies');

const chatRouter = require('./routes/communication/chat');

const usersRouter = require('./routes/core/users');

const { router: whatsappRouter } = require('./routes/communication/whatsapp');

const whatsappMockRouter = require('./routes/communication/whatsapp-mock');

const authRouter = require('./routes/auth');

const slaRouter = require('./routes/management/sla');

const agentsRouter = require('./routes/agents');

const staffRouter = require('./routes/core/staff'); // New staff routes

const supportRouter = require('./routes/support'); // Support integration routes

const tenantsRouter = require('./routes/tenants'); // Tenant management routes

const feedbackRouter = require('./routes/feedback');

const knowledgeRouter = require('./routes/knowledge');

const settingsRouter = require('./routes/settings');

const notificationsRouter = require('./routes/notifications');

const tenantSpocRouter = require('./routes/tenantSpoc');
const departmentsRouter = require('./routes/departments');



// Import auto-escalation and inactivity workflow

const { startScheduledEscalation } = require('./scheduled-escalation');

const { startScheduledInactivity } = require('./scheduled-inactivity');



// Import incoming email service (messages only, no ticket creation)

const incomingEmailService = require('./services/incomingEmailService');



// Import WebSocket server and instance store

const WebSocketServer = require('./websocket-server');

const wsInstanceStore = require('./websocket-instance');



const app = express();

const server = http.createServer(app);

app.set('trust proxy', 1); // <-- Add this line

const PORT = process.env.PORT || 5000;



// --- PERF instrumentation (enable with PERF_LOG=1) ---

const PERF_LOG = process.env.PERF_LOG === '1';

const PERF_API_SLOW_MS = Number(process.env.PERF_API_SLOW_MS || 800);

if (PERF_LOG) {

  app.use((req, res, next) => {

    const start = process.hrtime.bigint();

    res.on('finish', () => {

      const ms = Number(process.hrtime.bigint() - start) / 1e6;

      const p = req.originalUrl || req.url || '';

      if (ms >= PERF_API_SLOW_MS) {

        console.log(`[perf][api] ${req.method} ${res.statusCode} ${ms.toFixed(1)}ms ${p}`);

      } else if (process.env.PERF_API_LOG_ALL === '1') {

        console.log(`[perf][api] ${req.method} ${res.statusCode} ${ms.toFixed(1)}ms ${p}`);

      }

    });

    next();

  });

}



// Security middleware

app.use(helmet());



// Rate limiting

// const limiter = rateLimit({

//   windowMs: 15 * 60 * 1000, // 15 minutes

//   max: 1000, // limit each IP to 1000 requests per windowMs (increased from 100)

//   message: {

//     success: false,

//     message: 'Too many requests from this IP, please try again later.'

//   }

// });

// app.use('/api/', limiter);



// CORS configuration (verbose logging only when DEBUG_CORS=1)

const debugCors = process.env.DEBUG_CORS === '1';

app.use(cors({

  origin: function (origin, callback) {

    // Allow requests with no origin (mobile apps, curl, Postman)

    if (!origin) return callback(null, true);



    const nodeEnv = process.env.NODE_ENV || 'development';

    const isProduction = nodeEnv === 'production';



    // Non-production: allow any browser origin (localhost, [::1], LAN hostname, etc.).

    // Do not use callback(Error) — cors passes that to Express and breaks the response.

    if (!isProduction) {

      if (debugCors) console.log(`CORS: Allowed (non-production) ${origin}`);

      return callback(null, true);

    }



    // Production: explicit allowlist (extend when you deploy the frontend)

    const productionOrigins = (process.env.CORS_ORIGINS || '')

      .split(',')

      .map((s) => s.trim())

      .filter(Boolean);

    if (productionOrigins.includes(origin) || origin === 'https://yourdomain.com') {

      return callback(null, true);

    }



    if (debugCors) console.log(`CORS: Rejected (production) ${origin}`);

    return callback(null, false);

  },

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Tenant-ID'],

  optionsSuccessStatus: 200

}));



// Body parsing middleware

app.use(express.json({ limit: '50mb' }));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));



// Static file serving for uploads

app.use('/uploads', express.static('uploads'));



// Health check endpoint

app.get('/health', (req, res) => {

  res.json({

    success: true,

    message: 'Tick System API is running',

    timestamp: new Date().toISOString(),

    environment: process.env.NODE_ENV || 'development'

  });

});



// Text formatting middleware for all API routes

// app.use('/api', formatAllData); // Commented out as it's not essential for basic functionality



// Import tenant middleware

const { setTenantContext } = require('./middleware/tenant');



// Skip tenant for paths that don't need it (reduces DB load and log spam)

const skipTenantPaths = ['/health', '/uploads', '/api/auth/business-dashboard', '/api/ai/health', '/api/feedback/public'];

app.use((req, res, next) => {

  if (skipTenantPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {

    return next();

  }

  setTenantContext(req, res, next);

});



// API routes

app.use('/api/auth', authRouter);

app.use('/api/tenants', tenantsRouter); // Tenant management (before other routes)

app.use('/api/tickets', ticketsRouter);

app.use('/api/replies', repliesRouter);

app.use('/api/chat', chatRouter);

app.use('/api/users', usersRouter);

app.use('/api/whatsapp', whatsappRouter);

app.use('/api/whatsapp-mock', whatsappMockRouter);

app.use('/api/sla', slaRouter);

app.use('/api/agents', agentsRouter);

app.use('/api/staff', staffRouter); // Add staff routes

app.use('/api/support', supportRouter); // Support integration routes

app.use('/api/faqs', require('./routes/faqs')); // FAQ management and help

app.use('/api/assignments', require('./routes/management/assignments')); // Assignment management routes

app.use('/api/ticket-tasks', require('./routes/management/ticketTasks')); // Multi-task workflow routes

app.use('/api/ticket-links', require('./routes/ticketLinks')); // Internal-only linked tickets workflow

app.use('/api/ai', require('./routes/ai')); // NVIDIA / OpenAI-compatible AI (health + future features)

app.use('/api/feedback', feedbackRouter);

app.use('/api/knowledge', knowledgeRouter.router);

app.use('/api/settings', settingsRouter);

app.use('/api/notifications', notificationsRouter);

app.use('/api/tenant-spoc', tenantSpocRouter);
app.use('/api/departments', departmentsRouter);

app.use('/api/product-spoc', require('./routes/productSpoc'));

app.use('/api/mail-review', require('./routes/management/mailReview'));



// Manual trigger for incoming email poll (for testing: GET or POST /api/incoming-email/poll)

app.get('/api/incoming-email/poll', async (req, res) => {

  try {

    await incomingEmailService.processInbox();

    res.json({ success: true, message: 'Incoming email poll completed. Check server logs and ticket chat.' });

  } catch (e) {

    console.error('Incoming email poll error:', e);

    res.status(500).json({ success: false, message: e.message || 'Poll failed' });

  }

});

app.post('/api/incoming-email/poll', async (req, res) => {

  try {

    await incomingEmailService.processInbox();

    res.json({ success: true, message: 'Incoming email poll completed. Check server logs and ticket chat.' });

  } catch (e) {

    console.error('Incoming email poll error:', e);

    res.status(500).json({ success: false, message: e.message || 'Poll failed' });

  }

});



// 404 handler

app.use('*', (req, res) => {

  res.status(404).json({

    success: false,

    message: 'API endpoint not found'

  });

});



// Global error handler

app.use((error, req, res, next) => {

  console.error('Global error handler:', error);

  

  // Handle specific error types

  if (error.name === 'ValidationError') {

    return res.status(400).json({

      success: false,

      message: 'Validation error',

      errors: error.errors

    });

  }

  

  if (error.name === 'MulterError') {

    return res.status(400).json({

      success: false,

      message: 'File upload error: ' + error.message

    });

  }

  

  // Default error response

  res.status(500).json({

    success: false,

    message: process.env.NODE_ENV === 'production' 

      ? 'Internal server error' 

      : error.message

  });

});



// Initialize database and start server

const startServer = async () => {

  try {

    // Test database connection

    await testConnection();

    

    // Initialize database tables

    await initializeDatabase();

    

    // Initialize WebSocket server and store for routes

    const wsServer = new WebSocketServer(server);

    wsInstanceStore.set(wsServer);



    // Start server

    server.listen(PORT, () => {

      console.log(`🚀 Server running on port ${PORT}`);

      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

      console.log(`🔗 Health check: http://localhost:${PORT}/health`);

      console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}/ws`);

      console.log(`📝 API Documentation:`);

      console.log(`   - GET    /api/tickets - Get all tickets`);

      console.log(`   - POST   /api/tickets - Create new ticket`);

      console.log(`   - GET    /api/tickets/:id - Get single ticket`);

      console.log(`   - PUT    /api/tickets/:id/status - Update ticket status`);

      console.log(`   - DELETE /api/tickets/:id - Delete ticket`);

      console.log(`   - GET    /api/replies/:ticketId - Get ticket replies`);

      console.log(`   - POST   /api/replies - Add reply to ticket`);

      console.log(`   - GET    /api/chat/messages/:ticketId - Get chat messages`);

      console.log(`   - POST   /api/chat/messages - Add chat message`);

      console.log(`   - PUT    /api/chat/messages/read/:ticketId - Mark messages as read`);

      console.log(`   - GET    /api/chat/session/:ticketId - Get chat session`);

      console.log(`   - POST   /api/chat/session - Join chat session`);

      console.log(`   - PUT    /api/chat/typing - Update typing status`);

      console.log(`   - PUT    /api/chat/session/leave - Leave chat session`);

      console.log(`   - GET    /api/chat/unread/:ticketId/:userType - Get unread count`);

    });

    

    // Start the automatic escalation system

    startScheduledEscalation();



    // Start inactivity workflow (12h, 24h, 36h reminders; 48h auto-close)

    startScheduledInactivity();



    // Start incoming email poller (stores customer email replies as messages, no ticket creation)

    incomingEmailService.startIncomingEmailPoller();



  } catch (error) {

    console.error('❌ Failed to start server:', error);

    process.exit(1);

  }

};



// Handle graceful shutdown

process.on('SIGTERM', () => {

  console.log('SIGTERM received, shutting down gracefully');

  process.exit(0);

});



process.on('SIGINT', () => {

  console.log('SIGINT received, shutting down gracefully');

  process.exit(0);

});



// Handle unhandled promise rejections

process.on('unhandledRejection', (reason, promise) => {

  console.error('Unhandled Rejection at:', promise, 'reason:', reason);

  process.exit(1);

});



// Handle uncaught exceptions

process.on('uncaughtException', (error) => {

  console.error('Uncaught Exception:', error);

  process.exit(1);

});



startServer(); 