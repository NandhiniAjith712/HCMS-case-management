const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: '../config.env' });

// Import shared components
const { testConnection } = require('./shared/config/database');
const { errorHandler, notFound } = require('./shared/middleware/errorHandler');
const { logInfo } = require('./shared/utils/logger');

// Import modules
const authRoutes = require('./modules/auth/auth.routes');
const ticketRoutes = require('./modules/tickets/ticket.routes');
const agentRoutes = require('../routes/core/agents');
const knowledgeRoutes = require('../routes/knowledge');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost origins in development
    if (process.env.NODE_ENV === 'production') {
      return callback(null, process.env.FRONTEND_URL || false);
    }
    
    // Development environment - allow multiple localhost ports
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5000'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Tick System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/knowledge', knowledgeRoutes.router);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Initialize and start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Start server
    app.listen(PORT, () => {
      logInfo(`🚀 Server running on port ${PORT}`);
      logInfo(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logInfo(`🔗 Health check: http://localhost:${PORT}/health`);
      logInfo(`📝 API Documentation:`);
      logInfo(`   - POST   /api/auth/login - User login`);
      logInfo(`   - POST   /api/auth/register - User registration`);
      logInfo(`   - GET    /api/tickets - Get all tickets`);
      logInfo(`   - POST   /api/tickets - Create new ticket`);
      logInfo(`   - GET    /api/tickets/:id - Get single ticket`);
      logInfo(`   - PUT    /api/tickets/:id/status - Update ticket status`);
      logInfo(`   - PUT    /api/tickets/:id/assign - Assign ticket`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = { app, startServer }; 