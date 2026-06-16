/**
 * Example: How to integrate multitenancy into server.js
 * 
 * This file shows the changes needed in your server.js file
 * DO NOT replace your server.js - use this as a reference
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
require('dotenv').config({ path: './config.env' });

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
const staffRouter = require('./routes/core/staff');
const supportRouter = require('./routes/support');
const knowledgeRouter = require('./routes/knowledge');

// ✅ ADD THIS: Import tenant routes
const tenantsRouter = require('./routes/tenants');

// Import auto-escalation functionality
const { startScheduledEscalation } = require('./scheduled-escalation');

// Import WebSocket server
const WebSocketServer = require('./websocket-server');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration (update to support subdomains)
app.use(cors({
  origin: function (origin, callback) {
    console.log(`🔍 CORS Check - Origin: ${origin}, NODE_ENV: ${process.env.NODE_ENV}`);
    
    // Allow requests with no origin
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow localhost origins in development
    if (process.env.NODE_ENV === 'development') {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:5000',
        // ✅ ADD: Support subdomains
        /^http:\/\/.*\.localhost:\d+$/, // e.g., company1.localhost:3000
        'null'
      ];
      
      // Check if origin matches subdomain pattern
      const isSubdomain = /^http:\/\/.*\.localhost:\d+$/.test(origin);
      
      if (allowedOrigins.includes(origin) || isSubdomain) {
        console.log(`✅ CORS: Origin ${origin} is allowed`);
        return callback(null, true);
      }
    }
    
    // ✅ ADD: In production, allow tenant subdomains
    if (process.env.NODE_ENV === 'production') {
      // Allow your main domain and all subdomains
      if (origin.includes('yourdomain.com') || origin.includes('tick-system.com')) {
        return callback(null, true);
      }
    }
    
    console.log(`❌ CORS: Origin ${origin} rejected`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Tenant-ID'], // ✅ ADD: X-Tenant-ID header
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

// ✅ ADD: Tenant routes (before other routes, but after auth)
// Note: Tenant routes might need authentication, so they're placed here
app.use('/api/tenants', tenantsRouter);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/replies', repliesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/users', usersRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/whatsapp-mock', whatsappMockRouter);
app.use('/api/sla', slaRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/staff', staffRouter);
app.use('/api/support', supportRouter);
app.use('/api/knowledge', knowledgeRouter.router);
app.use('/api/assignments', require('./routes/management/assignments'));

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
    
    // Initialize WebSocket server
    const wsServer = new WebSocketServer(server);
    
    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}/ws`);
      console.log(`\n🏢 Multitenancy Features:`);
      console.log(`   - Tenant management: /api/tenants`);
      console.log(`   - Subdomain routing: company1.localhost:${PORT}`);
      console.log(`   - Header routing: X-Tenant-ID header`);
      console.log(`\n📝 API Documentation:`);
      console.log(`   - GET    /api/tickets - Get all tickets (tenant-filtered)`);
      console.log(`   - POST   /api/tickets - Create new ticket (tenant-scoped)`);
      console.log(`   - GET    /api/tenants - List all tenants (admin only)`);
      console.log(`   - POST   /api/tenants - Create new tenant (admin only)`);
    });
    
    // Start the automatic escalation system
    startScheduledEscalation();

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

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();

