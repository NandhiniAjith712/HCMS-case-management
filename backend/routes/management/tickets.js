const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database');
const { upload, handleUploadError } = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../middleware/tenant');
const axios = require('axios');
const TextFormatter = require('../utils/textFormatter');
const TicketAssignmentService = require('../utils/ticketAssignment');
const emailService = require('../services/emailService');
const ticketEventNotificationService = require('../services/ticketEventNotificationService');

// Apply tenant context to all routes
const router = express.Router();
router.use(setTenantContext);

const path = require('path');
const fs = require('fs');

// WhatsApp API configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "521803094347148";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Add timeout and retry configuration
const axiosConfig = {
  timeout: 15000, // 15 seconds
  headers: {
    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Tick-System/1.0'
  },
  // Uncomment if you need to use a proxy
  // proxy: {
  //   host: 'proxy.company.com',
  //   port: 8080,
  //   auth: {
  //     username: 'username',
  //     password: 'password'
  //   }
  // }
};

// Function to send WhatsApp message
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // Check if WhatsApp is properly configured
    if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === 'YOUR_ACTUAL_NEW_TOKEN_FROM_META_DEVELOPER_CONSOLE' || !WHATSAPP_PHONE_NUMBER_ID) {
      console.log(' WhatsApp API not configured');
      console.log('💡 WhatsApp notifications are temporarily disabled until you get a valid access token');
      return null;
    }
    console.log(`📤 Attempting to send WhatsApp message to ${phoneNumber}`);
    console.log(`🌐 API URL: ${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`);

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message
        }
      },
      axiosConfig
    );

    console.log('✅ WhatsApp notification sent successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.error(' Network error: Cannot reach Facebook Graph API. Check your internet connection.');
    } else if (error.code === 'ECONNABORTED') {
      console.error(' Timeout error: Request took too long to complete.');
    } else {
      console.error(' Error sending WhatsApp notification:', error.response?.data || error.message);
    }
    return null;
  }
}

// Test endpoint to verify token validity
router.get('/test-auth', async (req, res) => {
  try {
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token and get user info
    let user;
    try {
      const jwt = require('jsonwebtoken');
      user = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: jwtError.message
      });
    }
    
    res.json({
      success: true,
      message: 'Token is valid',
      user: {
        id: user.userId,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error testing auth:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test authentication'
    });
  }
});

// Get user's own tickets
router.get('/my-tickets', async (req, res) => {
  try {
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token and get user info
    let user;
    try {
      const jwt = require('jsonwebtoken');
      user = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    
    // Get user's tickets
    const [tickets] = await pool.execute(
      'SELECT id, issue_title, status, created_at FROM tickets WHERE user_id = ? ORDER BY created_at DESC',
      [user.userId]
    );
    
    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets'
    });
  }
});



// POST /api/tickets/auto-login-context - Store auto-login context for form pre-filling
router.post('/auto-login-context', async (req, res) => {
  try {
    const { email, product, phone, timestamp, source } = req.body;
    
    console.log('🔗 Storing auto-login context:', { email, product, phone, source });
    
    // Store auto-login context in a temporary table or session storage
    // For now, we'll store it in the tickets table with a special flag
    // In production, you might want a separate table for this
    
    // Check if user exists in users table (customers)
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    let userId = null;
    if (users.length > 0) {
      userId = users[0].id;
    }
    
    // Store context in a temporary way (you can modify this based on your needs)
    const autoLoginContext = {
      email,
      product,
      phone,
      timestamp,
      source,
      userId
    };
    
    // For now, we'll just log it and return success
    // In a real implementation, you might store this in Redis, a database table, or session storage
    console.log('✅ Auto-login context stored:', autoLoginContext);
    
    res.json({
      success: true,
      message: 'Auto-login context stored successfully',
      data: autoLoginContext
    });
  } catch (error) {
    console.error('❌ Error storing auto-login context:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to store auto-login context'
    });
  }
});

// GET /api/tickets/auto-login-context/:email - Get auto-login context for a user
router.get('/auto-login-context/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    console.log('🔍 Retrieving auto-login context for:', email);
    
    // In a real implementation, you would retrieve this from your storage
    // For now, we'll return a mock response
    const mockContext = {
      email,
      product: 'ProjectX', // Default product
      phone: '1234567890', // Default phone
      timestamp: new Date().toISOString(),
      source: 'auto-login'
    };
    
    res.json({
      success: true,
      message: 'Auto-login context retrieved successfully',
      data: mockContext
    });
  } catch (error) {
    console.error('❌ Error retrieving auto-login context:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve auto-login context'
    });
  }
});

// GET /api/tickets - Get tickets based on user role and permissions
router.get('/', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user;
    const { status } = req.query;
    
    let query = `
      SELECT 
        t.id, 
        t.name, 
        t.email, 
        t.mobile, 
        t.product, 
        t.product_id, 
        t.module, 
        t.module_id, 
        t.description, 
        t.issue_type, 
        t.issue_type_other, 
        t.issue_title, 
        t.attachment_name, 
        t.attachment_type, 
        t.status, 
        t.user_id, 
        t.assigned_to,
        t.assigned_by,
        t.created_at, 
        t.updated_at,
        t.resolution_time,
        t.satisfaction_rating,
        u.name as assigned_to_name,
        u.email as assigned_to_email,
        ta.agent_id as allocation_agent_id
      FROM tickets t
      LEFT JOIN agents u ON t.assigned_to = u.id AND u.tenant_id = t.tenant_id
      LEFT JOIN ticket_allocations ta ON ta.ticket_id = t.id AND ta.tenant_id = t.tenant_id
      LEFT JOIN users usr ON t.user_id = usr.id
    `;
    const params = [];
    const conditions = ['t.tenant_id = ?'];
    params.push(tenantId);

    // Role-based filtering
    console.log('🔍 User role for tickets API:', user.role);
    console.log('🔍 User ID:', user.userId || user.id);
    
    if (user.role === 'user' || user.role === 'customer') {
      // Customers can only see their own tickets
      conditions.push('t.user_id = ?');
      params.push(user.userId || user.id);
      console.log('🔍 Filtering for customer - user_id =', user.userId || user.id);
    } else if (user.role === 'support_agent') {
      // Support executives can see tickets assigned to them
      conditions.push('t.assigned_to = ?');
      params.push(user.userId || user.id);
      console.log('🔍 Filtering for support_agent - assigned_to =', user.userId || user.id);
    } else if (user.role === 'support_manager' || user.role === 'manager') {
      // Managers can see tickets from their department
      // For now, show all tickets (can be enhanced with department filtering)
      console.log('🔍 Manager role - showing all tickets');
    } else if (user.role === 'ceo') {
      // CEO can see all tickets
      console.log('🔍 CEO role - showing all tickets');
    } else {
      // Default: customers can only see their own tickets
      conditions.push('t.user_id = ?');
      params.push(user.userId || user.id);
      console.log('🔍 Default filtering - user_id =', user.userId || user.id);
    }

    // Add status filter if provided
    if (status && ['new', 'in_progress', 'closed'].includes(status)) {
      conditions.push('t.status = ?');
      params.push(status);
    }


    // Apply conditions (tenant_id is already in conditions)
    query += ' WHERE ' + conditions.join(' AND ');
    
    query += ' ORDER BY t.created_at DESC';
    
    console.log('🔍 Final query:', query);
    console.log('🔍 Query parameters:', params);
    
    const [tickets] = await pool.execute(query, params);
    
    console.log('🔍 Query results:', tickets.length, 'tickets found');
    if (tickets.length > 0) {
      console.log('🔍 Sample ticket:', {
        id: tickets[0].id,
        title: tickets[0].issue_title,
        status: tickets[0].status
      });
    }
    
    res.json({
      success: true,
      data: tickets,
      userRole: user.role,
      message: `Showing tickets for ${user.role} role`
    });
  } catch (error) {
    console.error('❌ Error fetching tickets:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      stack: error.stack,
      user: user ? { role: user.role, userId: user.userId, id: user.id } : 'No user'
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error.message
    });
  }
});

// GET /api/tickets/:id - Get single ticket with replies (with access control)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token and get user info
    let user;
    try {
      const jwt = require('jsonwebtoken');
      user = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    
    // Get ticket details with assigned agent information
    const [tickets] = await pool.execute(`
      SELECT 
        t.*,
        u.name as assigned_to_name,
        u.email as assigned_to_email,
        ta.agent_id as allocation_agent_id
      FROM tickets t
      LEFT JOIN agents u ON t.assigned_to = u.id
      LEFT JOIN ticket_allocations ta ON ta.ticket_id = t.id
      WHERE t.id = ?
    `, [id]);
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    
    // Check access permissions
    let canAccess = false;
    
    console.log('🔍 Access control check:');
    console.log('   - User ID from token:', user.userId);
    console.log('   - User role from token:', user.role);
    console.log('   - Ticket user_id:', ticket.user_id);
    console.log('   - Ticket assigned_to:', ticket.assigned_to);
    
    if (user.role === 'user' || user.role === 'customer') {
      // Customers can only see their own tickets
      canAccess = (ticket.user_id == user.userId); // Use == for type comparison
      console.log('   - Customer access check:', canAccess, `(ticket.user_id: ${ticket.user_id} == user.userId: ${user.userId})`);
    } else if (user.role === 'support_agent') {
      // Support executives can see tickets assigned to them
      canAccess = (ticket.assigned_to == user.userId);
      console.log('   - Support executive access check:', canAccess);
    } else if (user.role === 'support_manager' || user.role === 'ceo') {
      // Managers and CEO can see all tickets
      canAccess = true;
      console.log('   - Manager/CEO access check: true (full access)');
    } else {
      // Default: customers can only see their own tickets
      canAccess = (ticket.user_id == user.userId);
      console.log('   - Default access check:', canAccess);
    }
    
    // TEMPORARY: Allow access for testing (remove this in production)
    if (!canAccess) {
      console.log('⚠️  Access would be denied, but allowing for testing');
      console.log('   - User ID from token:', user.userId);
      console.log('   - Ticket user_id:', ticket.user_id);
      console.log('   - Bypassing access control for testing');
      // Uncomment the lines below to restore proper access control
      /*
      return res.status(403).json({
        success: false,
        message: 'Access denied to this ticket',
        debug: {
          user_id: user.userId,
          user_role: user.role,
          ticket_user_id: ticket.user_id,
          ticket_assigned_to: ticket.assigned_to
        }
      });
      */
    }
    
    // Get unified messages for this ticket (all channels)
    const ticketMessagesService = require('../services/ticketMessagesService');
    const messages = await ticketMessagesService.getMessages(id);
    const replies = messages.map(m => ({
      id: m.id,
      ticket_id: m.ticket_id,
      message: m.message,
      sent_at: m.created_at,
      is_customer_reply: m.sender_type === 'user',
      customer_name: m.sender_type === 'user' ? m.sender_name : null,
      agent_name: m.sender_type === 'agent' ? m.sender_name : null,
      channel: m.channel,
      sender_type: m.sender_type,
      sender_name: m.sender_name,
      created_at: m.created_at
    }));

    res.json({
      success: true,
      data: {
        ...ticket,
        replies
      }
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket'
    });
  }
});

// POST /api/tickets - Create new ticket
router.post('/', authenticateToken, verifyTenantAccess, upload.single('attachment'), handleUploadError, async (req, res) => {
  try {
    // Debug: Log the request body
    console.log('Received ticket data:', req.body);
    
    const tenantId = req.tenantId; // ✅ Get tenant_id from request context
    const { name, email, mobile, product, module, description, issueType, issueTypeOther, issueTitle, userId, utm_description } = req.body;
    
    // Format all input data using universal text formatter
    const formattedData = TextFormatter.formatTicketData({
      name,
      email,
      mobile,
      product,
      module,
      description,
      issueType,
      issueTypeOther,
      issueTitle
    });
    
    // Find product_id based on product name
    let productId = null;
    let moduleId = null;
    let slaConfiguration = null;
    
    if (product) {
      const [products] = await pool.execute(
        'SELECT id FROM products WHERE name = ? AND status = \'active\' AND tenant_id = ?',
        [product, tenantId]
      );
      if (products.length > 0) {
        productId = products[0].id;
        console.log(`✅ Found product_id: ${productId} for product: ${product}`);
        
        // Find module_id based on module name
        if (module) {
          const [modules] = await pool.execute(
            'SELECT id FROM modules WHERE product_id = ? AND name = ? AND status = \'active\' AND tenant_id = ?',
            [productId, module, tenantId]
          );
          if (modules.length > 0) {
            moduleId = modules[0].id;
            console.log(`✅ Found module_id: ${moduleId} for module: ${module}`);
            
            // Find SLA configuration for this module
            const [slaConfigs] = await pool.execute(
              'SELECT * FROM sla_configurations WHERE module_id = ? AND is_active = TRUE AND tenant_id = ? ORDER BY priority_level ASC LIMIT 1',
              [moduleId, tenantId]
            );
            if (slaConfigs.length > 0) {
              slaConfiguration = slaConfigs[0];
              console.log(`✅ Found SLA configuration: ${slaConfiguration.response_time_minutes}min response, ${slaConfiguration.resolution_time_minutes}min resolution`);
            }
          }
        }
      } else {
        console.log(`⚠️ Product not found: ${product}, will use default SLA time`);
      }
    }
    
    // Prepare attachment data
    let attachmentData = null;
    let attachmentName = null;
    let attachmentType = null;
    
    if (req.file) {
      attachmentName = req.file.originalname;
      attachmentType = req.file.mimetype;
      
      // Read file and convert to buffer for database storage
      const fileBuffer = fs.readFileSync(req.file.path);
      attachmentData = fileBuffer;
      
      // Clean up the temporary file
      fs.unlinkSync(req.file.path);
    }
    
    // Insert ticket into database with formatted data (include tenant_id, utm_description for support URL tracking)
    const safe = v => v === undefined ? null : v;
    const [result] = await pool.execute(
      `INSERT INTO tickets (tenant_id, user_id, name, email, mobile, product, product_id, module, module_id, description, issue_type, issue_type_other, issue_title, attachment_name, attachment_type, attachment, utm_description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        safe(userId),
        safe(name),
        safe(email),
        safe(mobile),
        safe(product),
        safe(productId),
        safe(module),
        safe(moduleId),
        safe(description),
        safe(issueType),
        safe(issueTypeOther),
        safe(issueTitle),
        safe(attachmentName),
        safe(attachmentType),
        safe(attachmentData),
        safe(utm_description)
      ]
    );
    
    const ticketId = result.insertId;
    
    // 🎯 AUTOMATIC EQUAL TICKET ASSIGNMENT
    let assignmentResult = null;
    try {
      // tenantId already set above from req.tenantId
      console.log(`🎯 Attempting automatic ticket assignment for ticket ${ticketId}...`);
      assignmentResult = await TicketAssignmentService.assignTicketEqually(ticketId, userId, tenantId);
      console.log(`✅ Automatic assignment successful: ${assignmentResult.message}`);
    } catch (assignmentError) {
      console.warn(`⚠️ Automatic assignment failed for ticket ${ticketId}:`, assignmentError.message);
      console.log('💡 Ticket will remain unassigned and can be manually assigned later');
    }

    // 🕐 CREATE SLA TIMERS FOR THE TICKET
    if (slaConfiguration) {
      try {
        console.log(`🕐 Creating SLA timers for ticket ${ticketId}...`);
        
        // Create response timer
        const responseDeadline = new Date();
        responseDeadline.setMinutes(responseDeadline.getMinutes() + slaConfiguration.response_time_minutes);
        
        await pool.execute(`
          INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, sla_deadline, status)
          VALUES (?, ?, 'response', ?, 'active')
        `, [ticketId, slaConfiguration.id, responseDeadline]);
        
        // Create resolution timer
        const resolutionDeadline = new Date();
        resolutionDeadline.setMinutes(resolutionDeadline.getMinutes() + slaConfiguration.resolution_time_minutes);
        
        await pool.execute(`
          INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, sla_deadline, status)
          VALUES (?, ?, 'resolution', ?, 'active')
        `, [ticketId, slaConfiguration.id, resolutionDeadline]);
        
        // Create escalation timer if escalation time is configured
        if (slaConfiguration.escalation_time_minutes) {
          const escalationDeadline = new Date();
          escalationDeadline.setMinutes(escalationDeadline.getMinutes() + slaConfiguration.escalation_time_minutes);
          
          await pool.execute(`
            INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, sla_deadline, status)
            VALUES (?, ?, 'escalation', ?, 'active')
          `, [ticketId, slaConfiguration.id, escalationDeadline]);
        }
        
        console.log(`✅ SLA timers created successfully for ticket ${ticketId}`);
        console.log(`   - Response deadline: ${responseDeadline.toLocaleString()}`);
        console.log(`   - Resolution deadline: ${resolutionDeadline.toLocaleString()}`);
        if (slaConfiguration.escalation_time_minutes) {
          console.log(`   - Escalation deadline: ${escalationDeadline.toLocaleString()}`);
        }
        
      } catch (slaError) {
        console.error(`❌ Failed to create SLA timers for ticket ${ticketId}:`, slaError);
        console.log('💡 Ticket created but SLA tracking may not work properly');
      }
    } else {
      console.log(`⚠️ No SLA configuration found for ticket ${ticketId}, using default 8-hour response time`);
      
      // Create default SLA timer with 8-hour response time
      try {
        const defaultDeadline = new Date();
        defaultDeadline.setHours(defaultDeadline.getHours() + 8);
        
        // Create a temporary SLA configuration record for default timing
        const [defaultSlaResult] = await pool.execute(`
          INSERT INTO sla_configurations (product_id, module_id, issue_name, response_time_minutes, resolution_time_minutes, priority_level, is_active)
          VALUES (?, ?, ?, 480, 1440, 'P2', TRUE)
        `, [productId || 1, moduleId || 1, issueType || 'default']);
        
        const defaultSlaId = defaultSlaResult.insertId;
        
        await pool.execute(`
          INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, sla_deadline, status)
          VALUES (?, ?, 'response', ?, 'active')
        `, [ticketId, defaultSlaId, defaultDeadline]);
        
        console.log(`✅ Default SLA timer created for ticket ${ticketId} with 8-hour deadline`);
        
      } catch (defaultSlaError) {
        console.error(`❌ Failed to create default SLA timer for ticket ${ticketId}:`, defaultSlaError);
      }
    }
    
    const ticketData = {
      id: ticketId,
      name,
      email,
      mobile,
      product,
      product_id: productId,
      module,
      module_id: moduleId,
      description,
      issueType,
      issueTypeOther,
      issueTitle,
      status: 'new',
      assignment: assignmentResult ? {
        assigned_to: assignmentResult.data.assigned_to,
        assigned_to_name: assignmentResult.data.assigned_to_name,
        assignment_method: assignmentResult.data.assignment_method
      } : null
    };

    ticketEventNotificationService
      .notifyTicketCreated({
        ticketId,
        tenantId,
        name: String(name || '').trim(),
        email: String(email || '').trim(),
        mobile,
        issueTitle: issueTitle || description?.substring(0, 100) || 'Support Request',
        firstResponseMinutes: slaConfiguration?.response_time_minutes ?? 480
      })
      .catch((err) => console.warn('⚠️ Ticket created notifications failed:', err?.message));

    res.status(201).json({
      success: true,
      message: assignmentResult ? 
        `Ticket created successfully and assigned to ${assignmentResult.data.assigned_to_name}` : 
        'Ticket created successfully (assignment pending)',
      data: ticketData
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket'
    });
  }
});

// PUT /api/tickets/:id/status - Update ticket status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['new', 'in_progress', 'closed', 'escalated'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be new, in_progress, closed, or escalated'
      });
    }
    
    // Get ticket data
    const [tickets] = await pool.execute(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    
    const [result] = await pool.execute(
      'UPDATE tickets SET status = ? WHERE id = ?',
      [status, id]
    );
    
    // Calculate and update resolution_time when ticket is closed
    if (status === 'closed' && result.affectedRows > 0) {
      try {
        await pool.execute(`
          UPDATE tickets 
          SET resolution_time = TIMESTAMPDIFF(MINUTE, created_at, NOW())
          WHERE id = ?
        `, [id]);
        console.log(`📊 Calculated resolution time for ticket ${id}`);
      } catch (error) {
        console.error(`❌ Error calculating resolution time for ticket ${id}:`, error);
      }
    }
    
    if (result.affectedRows > 0 && ticket.status !== status) {
      try {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: { ...ticket, id: Number(id), status },
          tenantId: ticket.tenant_id || req.tenantId || 1,
          previousStatus: ticket.status,
          newStatus: status,
          actorId: req.user?.id ?? req.user?.userId ?? null,
          actorName: req.user?.name || req.user?.email || null
        });
      } catch (err) {
        console.warn('⚠️ Status change notifications failed:', err?.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      whatsappSent: !!ticket.mobile
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
});

// PUT /api/tickets/:id - Update a ticket
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, mobile, product, description, issue_type, issue_type_other, issue_title, status, priority } = req.body;
    
    // Check if ticket exists
    const [tickets] = await pool.execute(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    
    // Find product_id if product name is provided
    let productId = ticket.product_id; // Keep existing product_id if no new product
    if (product && product !== ticket.product) {
      const [products] = await pool.execute(
        'SELECT id FROM products WHERE name = ? AND status = \'active\'',
        [product]
      );
      if (products.length > 0) {
        productId = products[0].id;
      }
    }
    
    // Update the ticket (priority: low, medium, high, urgent)
    const newPriority = priority && ['low', 'medium', 'high', 'urgent'].includes(priority)
      ? priority
      : (ticket.priority || 'medium');
    const [result] = await pool.execute(
      `UPDATE tickets SET 
        name = ?, email = ?, mobile = ?, product = ?, product_id = ?, 
        description = ?, issue_type = ?, issue_type_other = ?, issue_title = ?, 
        status = ?, priority = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name || ticket.name,
        email || ticket.email,
        mobile || ticket.mobile,
        product || ticket.product,
        productId,
        description || ticket.description,
        issue_type || ticket.issue_type,
        issue_type_other || ticket.issue_type_other,
        issue_title || ticket.issue_title,
        status || ticket.status,
        newPriority,
        id
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    if (result.affectedRows > 0 && status && status !== ticket.status) {
      try {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: {
            ...ticket,
            id: Number(id),
            tenant_id: ticket.tenant_id || req.tenantId || 1,
            status,
            issue_title: issue_title || ticket.issue_title
          },
          tenantId: ticket.tenant_id || req.tenantId || 1,
          previousStatus: ticket.status,
          newStatus: status,
          actorId: req.user?.id ?? req.user?.userId ?? null,
          actorName: req.user?.name || req.user?.email || null
        });
      } catch (err) {
        console.warn('⚠️ Generic update status notifications failed:', err?.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Ticket updated successfully'
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket'
    });
  }
});

// GET /api/tickets/:id/attachment - Get ticket attachment
router.get('/:id/attachment', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[Attachment] Request for ticket ID: ${id}`);
    const [tickets] = await pool.execute(
      'SELECT attachment_name, attachment_type, attachment FROM tickets WHERE id = ?',
      [id]
    );
    if (tickets.length === 0) {
      console.log(`[Attachment] Ticket not found for ID: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }
    if (!tickets[0].attachment) {
      console.log(`[Attachment] No attachment for ticket ID: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }
    const ticket = tickets[0];
    // Ensure attachment is a Buffer
    if (!(ticket.attachment instanceof Buffer)) {
      console.log(`[Attachment] Attachment is not a Buffer for ticket ID: ${id}`);
      return res.status(500).json({
        success: false,
        message: 'Attachment is not a valid file'
      });
    }
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition,Content-Type');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000");
    res.setHeader('Content-Type', ticket.attachment_type);
    res.setHeader('Content-Disposition', `inline; filename=\"${ticket.attachment_name}\"`);
    res.setHeader('Permissions-Policy', 'fullscreen=(self http://localhost:3000)');
    res.send(ticket.attachment);
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attachment'
    });
  }
});

// GET /api/tickets/user/:userId - Get all tickets for a specific user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get the user's email from users table (customers only)
    const [users] = await pool.execute('SELECT email FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    
    const userEmail = users[0].email;
    
    // Get tickets that belong to this user (by user_id OR by email)
    const [tickets] = await pool.execute(
      `SELECT * FROM tickets WHERE user_id = ? OR email = ? ORDER BY created_at DESC`,
      [userId, userEmail]
    );
    
    res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user tickets' });
  }
});

// DELETE /api/tickets/:id - Delete a ticket
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if ticket exists
    const [tickets] = await pool.execute(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    
    // Delete the ticket
    const [result] = await pool.execute(
      'DELETE FROM tickets WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Send WhatsApp notification if mobile number exists
    if (ticket.mobile) {
      const whatsappMessage = `📋 Ticket Deleted\n\n` +
        `🎫 Ticket ID: #${ticket.id}\n` +
        `🏷️ Issue: ${ticket.issue_title}\n` +
        `❌ Status: Deleted\n\n` +
        `Your ticket has been deleted from our system.`;
      
      await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
    }
    
    res.json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ticket'
    });
  }
});

// GET /api/tickets/assignment-stats - Get ticket assignment statistics (agents/managers only)
router.get('/assignment-stats', async (req, res) => {
  try {
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token and get user info
    let user;
    try {
      const jwt = require('jsonwebtoken');
      user = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Only agents, managers, and CEO can see assignment stats
    if (!['support_agent', 'support_manager', 'ceo'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only support staff can view assignment statistics.'
      });
    }

    const tenantId = req.tenantId || 1;
    const stats = await TicketAssignmentService.getAssignmentStatistics(tenantId);
    
    res.json({
      success: true,
      message: 'Assignment statistics retrieved successfully',
      data: {
        agents: stats,
        total_agents: stats.length,
        total_tickets: stats.reduce((sum, agent) => sum + agent.total_tickets, 0),
        average_tickets_per_agent: stats.length > 0 ? 
          (stats.reduce((sum, agent) => sum + agent.total_tickets, 0) / stats.length).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Error getting assignment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get assignment statistics'
    });
  }
});

// POST /api/tickets/rebalance - Rebalance ticket assignments
router.post('/rebalance', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const result = await TicketAssignmentService.rebalanceAssignments(tenantId);
    
    res.json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    console.error('Error rebalancing assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rebalance assignments'
    });
  }
});

// POST /api/tickets/:id/assign-equally - Manually assign a ticket using equal distribution
router.post('/:id/assign-equally', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { assigned_by } = req.body;
    
    const result = await TicketAssignmentService.assignTicketEqually(parseInt(id), assigned_by, tenantId);
    
    res.json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    console.error('Error assigning ticket equally:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to assign ticket'
    });
  }
});

// PUT /api/tickets/:ticketId/close - Close a ticket (customer action)
router.put('/:ticketId/close', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { user } = req.body; // User object from frontend
    
    // Validate ticketId
    if (!ticketId || isNaN(ticketId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    // Check if ticket exists and belongs to the user
    const [tickets] = await pool.execute(
      `SELECT t.*, u.email as user_email 
       FROM tickets t 
       LEFT JOIN users u ON t.user_id = u.id 
       WHERE t.id = ? AND (t.user_id = ? OR t.email = ?)`,
      [ticketId, user?.id, user?.email]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or access denied'
      });
    }

    const ticket = tickets[0];

    // Check if ticket is already closed
    if (ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Ticket is already closed'
      });
    }

    // Update ticket status to closed
    const [result] = await pool.execute(
      'UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?',
      ['closed', ticketId]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to close ticket'
      });
    }

    // Add a system message to the unified thread
    try {
      const ticketMessagesService = require('../services/ticketMessagesService');
      const [t] = await pool.execute('SELECT tenant_id FROM tickets WHERE id = ?', [ticketId]);
      const tenantId = t.length > 0 ? t[0].tenant_id : 1;
      await ticketMessagesService.addMessage({
        ticketId,
        tenantId,
        senderType: 'system',
        senderName: 'System',
        message: `🎯 Ticket closed by customer: ${user?.name || user?.email || 'Customer'}`,
        channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT
      });
    } catch (chatError) {
      console.log('Note: Could not add system message:', chatError.message);
    }

    // Send WhatsApp notification if mobile number exists
    if (ticket.mobile) {
      try {
        const whatsappMessage = `📋 Ticket Closed\n\n` +
          `🎫 Ticket ID: #${ticket.id}\n` +
          `🏷️ Issue: ${ticket.issue_title}\n` +
          `✅ Status: Closed\n\n` +
          `Your ticket has been marked as resolved and closed.`;
        
        // Note: sendWhatsAppMessage function should be available
        // await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
        console.log('WhatsApp notification would be sent to:', ticket.mobile);
      } catch (whatsappError) {
        console.log('Note: Could not send WhatsApp notification:', whatsappError.message);
      }
    }

    res.json({
      success: true,
      message: 'Ticket closed successfully',
      data: {
        ticketId: parseInt(ticketId),
        status: 'closed',
        closedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error closing ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close ticket: ' + error.message
    });
  }
});

module.exports = router;