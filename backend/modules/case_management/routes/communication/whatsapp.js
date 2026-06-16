const express = require('express');
const axios = require('axios');
const { pool } = require('../../../shared/database/database');
const { setTenantContext, verifyTenantAccess } = require('../../../shared/middleware/tenant');
const ticketMessagesService = require('../../services/ticketMessagesService');
const router = express.Router();

// Apply tenant context to API routes (webhook routes may not have tenant context)
// Note: Webhook routes handle tenant identification differently

// Import validation and templates
const { 
  validateWhatsAppMessage, 
  validateTicketData, 
  handleValidationErrors, 
  rateLimitWhatsApp,
  validatePhoneNumber,
  validateEmail,
  validateName,
  validateIssueTitle,
  validateDescription
} = require('../../../shared/middleware/whatsapp-validation');
const templates = require('../../templates/whatsapp-templates');
const { sendWhatsAppMessage } = require('../../../shared/utils/whatsapp-notifications');
const ticketEventNotificationService = require('../../services/ticketEventNotificationService');

// Set verify_token from environment variable
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'my_verify_token_123';

// WhatsApp API configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "521803094347148";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Conversation states for ticket creation
const conversationStates = {
  START: 'start',
  ASKING_NAME: 'asking_name',
  ASKING_EMAIL: 'asking_email',
  ASKING_COUNTRY_CODE: 'asking_country_code',
  ASKING_MOBILE: 'asking_mobile',
  ASKING_PRODUCT: 'asking_product',
  ASKING_ISSUE_TITLE: 'asking_issue_title',
  ASKING_ISSUE_TYPE: 'asking_issue_type',
  ASKING_DESCRIPTION: 'asking_description',
  COMPLETED: 'completed',
  // Satisfaction rating states
  ASKING_SATISFACTION: 'asking_satisfaction',
  SATISFACTION_COMPLETED: 'satisfaction_completed'
};

// Store conversation states (in production, use Redis or database)
const userConversations = new Map();

// Rating validation and parsing functions
function parseSatisfactionRating(message) {
  const cleanMessage = message.toLowerCase().trim();
  
  // Direct number ratings (1-5)
  if (/^[1-5]$/.test(cleanMessage)) {
    return parseInt(cleanMessage);
  }
  
  // Text-based ratings
  const ratingMap = {
    'excellent': 5,
    'very good': 4,
    'good': 3,
    'fair': 2,
    'poor': 1,
    'bad': 1,
    'terrible': 1,
    'amazing': 5,
    'great': 4,
    'okay': 3,
    'ok': 3,
    'average': 3,
    'satisfactory': 3,
    'unsatisfactory': 2,
    'disappointed': 2,
    'very satisfied': 5,
    'satisfied': 4,
    'neutral': 3,
    'dissatisfied': 2,
    'very dissatisfied': 1
  };
  
  return ratingMap[cleanMessage] || null;
}

function validateSatisfactionRating(rating) {
  return rating !== null && rating >= 1 && rating <= 5;
}

// Store satisfaction rating in database
async function storeSatisfactionRating(phoneNumber, rating, ticketId, tenantId = null) {
  try {
    if (!ticketId) {
      console.error('❌ No ticket ID provided for satisfaction rating');
      return false;
    }
    
    // Update the ticket with satisfaction rating (tenant-filtered if tenantId provided)
    if (tenantId) {
      await pool.execute(
        'UPDATE tickets SET satisfaction_rating = ? WHERE id = ? AND tenant_id = ?',
        [rating, ticketId, tenantId]
      );
    } else {
      await pool.execute(
        'UPDATE tickets SET satisfaction_rating = ? WHERE id = ?',
        [rating, ticketId]
      );
    }
    
    console.log(`✅ Satisfaction rating ${rating}/5 stored for ticket ${ticketId} from ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('❌ Error storing satisfaction rating:', error);
    return false;
  }
}

// Start satisfaction rating collection for a ticket
async function startSatisfactionRating(phoneNumber, ticketId) {
  try {
    // Set conversation state to asking for satisfaction
    const conversation = {
      state: conversationStates.ASKING_SATISFACTION,
      data: { ticketId: ticketId }
    };
    userConversations.set(phoneNumber, conversation);
    
    // Send satisfaction rating request
    await sendWhatsAppMessage(phoneNumber, 
      `⭐ *Rate Your Experience*\n\n` +
      `🎫 *Ticket ID:* #${ticketId}\n\n` +
      `How was your support experience? Please rate us:\n\n` +
      `📊 *Rating Options:*\n` +
      `• 5 or "excellent" - Outstanding service\n` +
      `• 4 or "good" - Good service\n` +
      `• 3 or "okay" - Average service\n` +
      `• 2 or "poor" - Below average\n` +
      `• 1 or "bad" - Terrible service\n\n` +
      `Your feedback helps us improve! 🙏`
    );
    
    console.log(`📤 Satisfaction rating request sent to ${phoneNumber} for ticket ${ticketId}`);
    return true;
  } catch (error) {
    console.error('❌ Error starting satisfaction rating:', error);
    return false;
  }
}

// Country codes for selection
const countryCodes = [
  { number: 1, code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { number: 2, code: '+1', name: 'United States', flag: '🇺🇸' },
  { number: 3, code: '+91', name: 'India', flag: '🇮🇳' },
  { number: 4, code: '+971', name: 'UAE/Dubai', flag: '🇦🇪' },
  { number: 5, code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { number: 6, code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { number: 7, code: '+61', name: 'Australia', flag: '🇦🇺' },
  { number: 8, code: '+1', name: 'Canada', flag: '🇨🇦' },
  { number: 9, code: '+81', name: 'Japan', flag: '🇯🇵' },
  { number: 10, code: '+82', name: 'South Korea', flag: '🇰🇷' }
];

// Issue types for selection
const issueTypes = [
  'Technical Support',
  'Billing Issue', 
  'Account Access',
  'Product Inquiry',
  'Bug Report',
  'Feature Request',
  'Other'
];

// Function to fetch products from database
async function getProductsForWhatsApp(tenantId = null) {
  try {
    if (tenantId) {
      const [products] = await pool.execute(
        'SELECT id, name, description, sla_time_minutes, priority_level FROM products WHERE status = \'active\' AND tenant_id = ? ORDER BY name ASC',
        [tenantId]
      );
      return products;
    } else {
      const [products] = await pool.execute(
        'SELECT id, name, description, sla_time_minutes, priority_level FROM products WHERE status = \'active\' ORDER BY name ASC'
      );
      return products;
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Function to create product selection template
async function createProductSelectionTemplate(tenantId = null) {
  const products = await getProductsForWhatsApp(tenantId);
  
  if (products.length === 0) {
    return {
      text: `❌ No products available at the moment. Please contact support directly.`,
      type: 'text'
    };
  }

  const productRows = products.map((product, index) => {
    // Truncate product name to fit WhatsApp's 24-character limit
    let productTitle = product.name;
    if (productTitle.length > 20) { // Leave room for emoji and safety margin
      productTitle = productTitle.substring(0, 17) + '...';
    }
    
    return {
      id: `product_${product.id}`,
      title: `📦 ${productTitle}`,
      description: `${product.description || 'No description'} | SLA: ${product.sla_time_minutes || 'N/A'} min`
    };
  });

  return {
    text: `✅ Great! 📦\n\nPlease select the product related to your issue:`,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: 'Select your product:'
      },
      action: {
        button: 'Choose Product',
        sections: [
          {
            title: 'Available Products',
            rows: productRows
          }
        ]
      }
    }
  };
}

// Route for GET requests (webhook verification)
router.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    console.log('❌ WEBHOOK VERIFICATION FAILED');
    res.status(403).end();
  }
});

// Route for POST requests (incoming messages)
router.post('/webhook', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\n📱 Webhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  
  try {
    // Process incoming messages
    if (req.body.object === 'whatsapp_business_account') {
      for (const entry of req.body.entry) {
        for (const change of entry.changes) {
          if (change.value.messages) {
            for (const message of change.value.messages) {
              let userMessage = '';
              
              // Handle different message types
              if (message.text) {
                userMessage = message.text.body;
                console.log(`📨 Text message from ${message.from}: ${userMessage}`);
              } else if (message.interactive && message.interactive.type === 'button_reply') {
                userMessage = message.interactive.button_reply.id;
                console.log(`🔘 Button response from ${message.from}: ${userMessage}`);
              } else if (message.interactive && message.interactive.type === 'list_reply') {
                userMessage = message.interactive.list_reply.id;
                console.log(`📋 List response from ${message.from}: ${userMessage}`);
              } else {
                console.log(`📨 Non-text message from ${message.from}: ${JSON.stringify(message)}`);
                userMessage = '';
              }
              
              // Handle conversation flow with validation
              await handleConversationWithValidation(message.from, userMessage);
            }
          }
        }
      }
    }
    
    // Send 200 OK response
    res.status(200).end();
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).end();
  }
});

// Handle conversation flow with validation and templates
async function handleConversationWithValidation(phoneNumber, userMessage) {
  try {
    // Check for special commands first
    const command = userMessage.toLowerCase().trim();
    
    if (command === 'help') {
      await sendTemplateMessage(phoneNumber, 'help');
      return;
    }
    
    if (command === 'reset') {
      userConversations.delete(phoneNumber);
      await sendTemplateMessage(phoneNumber, 'reset');
      return;
    }
    
    if (command === 'status') {
      await handleStatusRequest(phoneNumber);
      return;
    }

    // Check for template commands (disabled for now)
    if (command === 'templates' || command === 'template') {
      await sendWhatsAppMessage(phoneNumber, 'Templates are currently disabled. Please use the basic form to create your ticket.');
      return;
    }

    // Check for existing open ticket - if user has one, store message in unified thread
    // Normalize phone for matching (tickets.mobile may be +60123456789, webhook sends 60123456789)
    const phoneNorm = String(phoneNumber).replace(/\D/g, '');
    const [existingTickets] = await pool.execute(
      `SELECT id, tenant_id, name FROM tickets 
       WHERE REPLACE(REPLACE(REPLACE(COALESCE(mobile,''), '+', ''), ' ', ''), '-', '') = ?
       AND status IN ('new', 'in_progress', 'escalated') 
       ORDER BY created_at DESC LIMIT 1`,
      [phoneNorm]
    );
    if (existingTickets.length > 0 && userMessage && userMessage.trim()) {
      const ticket = existingTickets[0];
      await ticketMessagesService.addMessage({
        ticketId: ticket.id,
        tenantId: ticket.tenant_id || 1,
        senderType: 'user',
        senderName: ticket.name || 'Customer',
        message: userMessage.trim(),
        channel: ticketMessagesService.CHANNELS.WHATSAPP
      });
      await sendWhatsAppMessage(phoneNumber, '✅ Message received. Our team will respond shortly.');
      return;
    }

    // Get or create conversation state
    let conversation = userConversations.get(phoneNumber);
    if (!conversation) {
      conversation = {
        state: conversationStates.START,
        data: {}
      };
      userConversations.set(phoneNumber, conversation);
    }

    console.log(`🔄 Conversation state for ${phoneNumber}: ${conversation.state}`);

    // Handle conversation based on current state
    switch (conversation.state) {
      case conversationStates.START:
        await sendTemplateMessage(phoneNumber, 'welcome');
        conversation.state = conversationStates.ASKING_NAME;
        break;



      case conversationStates.ASKING_NAME:
        if (!validateName(userMessage)) {
          await sendTemplateMessage(phoneNumber, 'invalidName');
          return;
        }
        conversation.data.name = userMessage.trim();
        await sendTemplateMessage(phoneNumber, 'nameReceived', { name: conversation.data.name });
        conversation.state = conversationStates.ASKING_EMAIL;
        break;

      case conversationStates.ASKING_EMAIL:
        if (!validateEmail(userMessage)) {
          await sendTemplateMessage(phoneNumber, 'invalidEmail');
          return;
        }
        conversation.data.email = userMessage.trim();
        await sendTemplateMessage(phoneNumber, 'emailReceived');
        conversation.state = conversationStates.ASKING_COUNTRY_CODE;
        break;

      case conversationStates.ASKING_COUNTRY_CODE:
        // Handle button response for country selection
        const buttonId = userMessage.trim();
        let selectedCountry = null;
        
        // Map button IDs to countries
        switch (buttonId) {
          case 'country_1':
            selectedCountry = { code: '+60', name: 'Malaysia' };
            break;
          case 'country_2':
            selectedCountry = { code: '+1', name: 'United States' };
            break;
          case 'country_3':
            selectedCountry = { code: '+91', name: 'India' };
            break;
          case 'country_4':
            selectedCountry = { code: '+971', name: 'UAE/Dubai' };
            break;
          case 'country_5':
            selectedCountry = { code: '+65', name: 'Singapore' };
            break;
          default:
            // Fallback for text input (backward compatibility)
            const countrySelection = parseInt(userMessage.trim());
            selectedCountry = countryCodes.find(cc => cc.number === countrySelection);
        }
        
        if (!selectedCountry) {
          await sendTemplateMessage(phoneNumber, 'invalidCountryCode');
          return;
        }
        
        conversation.data.countryCode = selectedCountry.code;
        conversation.data.countryName = selectedCountry.name;
        await sendTemplateMessage(phoneNumber, 'countryCodeReceived', { 
          countryCode: selectedCountry.code, 
          countryName: selectedCountry.name 
        });
        conversation.state = conversationStates.ASKING_MOBILE;
        break;

      case conversationStates.ASKING_MOBILE:
        // Validate mobile number (without country code)
        const mobileNumber = userMessage.trim();
        if (!mobileNumber.match(/^\d{7,15}$/)) {
          await sendTemplateMessage(phoneNumber, 'invalidMobile');
          return;
        }
        // Combine country code with mobile number
        conversation.data.mobile = conversation.data.countryCode + mobileNumber;
        
        // Automatically send product selection template
        // Try to get tenant from existing tickets or use default
        const [existingTickets] = await pool.execute(
          'SELECT tenant_id FROM tickets WHERE mobile = ? LIMIT 1',
          [phoneNumber]
        );
        const tenantId = existingTickets.length > 0 ? existingTickets[0].tenant_id : 1;
        conversation.data.tenantId = tenantId;
        const productTemplate = await createProductSelectionTemplate(tenantId);
        await sendWhatsAppMessage(phoneNumber, productTemplate, 'interactive');
        
        conversation.state = conversationStates.ASKING_PRODUCT;
        break;

      case conversationStates.ASKING_PRODUCT:
        // Handle interactive response for product selection
        const productId = userMessage.trim();
        let selectedProduct = null;
        
        // Check if it's a product selection (starts with 'product_')
        if (productId.startsWith('product_')) {
          const productIdNumber = productId.replace('product_', '');
          // Try to get tenant from conversation data or use default
          const tenantId = conversation.data.tenantId || 1;
          const products = await getProductsForWhatsApp(tenantId);
          selectedProduct = products.find(p => p.id.toString() === productIdNumber);
        }
        
        if (!selectedProduct) {
          // If user sent text instead of selecting, show the product list again
          await sendTemplateMessage(phoneNumber, 'invalidProduct');
          return;
        }
        
        conversation.data.product = selectedProduct.name;
        conversation.data.productId = selectedProduct.id;
        await sendTemplateMessage(phoneNumber, 'productReceived', { 
          productName: selectedProduct.name,
          slaTime: selectedProduct.sla_time_minutes || 'N/A'
        });
        conversation.state = conversationStates.ASKING_ISSUE_TITLE;
        break;

      case conversationStates.ASKING_ISSUE_TITLE:
        if (!validateIssueTitle(userMessage)) {
          await sendTemplateMessage(phoneNumber, 'invalidTitle');
          return;
        }
        conversation.data.issueTitle = userMessage.trim();
        await sendTemplateMessage(phoneNumber, 'titleReceived');
        conversation.state = conversationStates.ASKING_ISSUE_TYPE;
        break;

      case conversationStates.ASKING_ISSUE_TYPE:
        // Handle interactive response for issue type selection
        const issueTypeId = userMessage.trim();
        let selectedIssueType = null;
        
        // Map issue type IDs to issue types
        switch (issueTypeId) {
          case 'issue_1':
            selectedIssueType = 'Technical Support';
            break;
          case 'issue_2':
            selectedIssueType = 'Billing Issue';
            break;
          case 'issue_3':
            selectedIssueType = 'Account Access';
            break;
          case 'issue_4':
            selectedIssueType = 'Product Inquiry';
            break;
          case 'issue_5':
            selectedIssueType = 'Bug Report';
            break;
          case 'issue_6':
            selectedIssueType = 'Feature Request';
            break;
          case 'issue_7':
            selectedIssueType = 'Other';
            break;
          default:
            // Fallback for text input (backward compatibility)
            const issueIndex = parseInt(userMessage) - 1;
            if (issueIndex >= 0 && issueIndex < issueTypes.length) {
              selectedIssueType = issueTypes[issueIndex];
            }
        }
        
        if (!selectedIssueType) {
          await sendTemplateMessage(phoneNumber, 'invalidIssueType');
          return;
        }
        
        conversation.data.issueType = selectedIssueType;
        await sendTemplateMessage(phoneNumber, 'typeReceived');
        conversation.state = conversationStates.ASKING_DESCRIPTION;
        break;

      case conversationStates.ASKING_DESCRIPTION:
        if (!validateDescription(userMessage)) {
          await sendTemplateMessage(phoneNumber, 'invalidDescription');
          return;
        }
        conversation.data.description = userMessage.trim();
        
        // Create ticket in database (try to get tenant from phone number or use default)
        // Note: For WhatsApp webhooks, tenant identification may need to be enhanced
        const ticketId = await createTicketFromWhatsApp(phoneNumber, conversation.data);
        
        if (ticketId) {
          const ticketData = {
            id: ticketId,
            name: conversation.data.name,
            email: conversation.data.email,
            mobile: conversation.data.mobile,
            countryName: conversation.data.countryName,
            product: conversation.data.product,
            issueTitle: conversation.data.issueTitle,
            issueType: conversation.data.issueType,
            description: conversation.data.description
          };
          await sendTemplateMessage(phoneNumber, 'ticketCreated', ticketData);
          
          // Clear conversation state
          userConversations.delete(phoneNumber);
        } else {
          await sendTemplateMessage(phoneNumber, 'ticketCreationError');
        }
        break;

      case conversationStates.ASKING_SATISFACTION:
        // Parse and validate satisfaction rating
        const rating = parseSatisfactionRating(userMessage);
        
        if (!validateSatisfactionRating(rating)) {
          await sendWhatsAppMessage(phoneNumber, 
            "❌ Please provide a valid rating (1-5) or use words like 'excellent', 'good', 'poor', etc.\n\n" +
            "Examples:\n" +
            "• 5 or 'excellent' for outstanding service\n" +
            "• 4 or 'good' for good service\n" +
            "• 3 or 'okay' for average service\n" +
            "• 2 or 'poor' for below average\n" +
            "• 1 or 'bad' for terrible service"
          );
          return;
        }
        
        // Store satisfaction rating
        await storeSatisfactionRating(phoneNumber, rating, conversation.data.ticketId);
        
        // Send confirmation
        const ratingText = ['', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent'][rating];
        await sendWhatsAppMessage(phoneNumber, 
          `✅ Thank you for your feedback!\n\n` +
          `You rated our service: ${rating}/5 (${ratingText})\n\n` +
          `Your feedback helps us improve our support quality. 🙏\n\n` +
          `Type 'help' for more options or send any message to create a new ticket.`
        );
        
        // Clear conversation state
        userConversations.delete(phoneNumber);
        break;

      default:
        await sendWhatsAppMessage(phoneNumber, 
          "Welcome! To create a new ticket, please send any message to start."
        );
        conversation.state = conversationStates.START;
        break;
    }

    // Update conversation state
    userConversations.set(phoneNumber, conversation);

  } catch (error) {
    console.error('Error handling conversation:', error);
    await sendTemplateMessage(phoneNumber, 'generalError');
  }
}

// Helper function to send template messages
async function sendTemplateMessage(phoneNumber, templateName, data = {}) {
  try {
    const template = templates.createTemplate(templateName, data);
    if (template) {
      if (template.type === 'interactive') {
        await sendWhatsAppMessage(phoneNumber, template, 'interactive');
      } else if (template.text) {
        await sendWhatsAppMessage(phoneNumber, template.text);
      } else {
        console.error(`Template '${templateName}' not found or invalid`);
        await sendWhatsAppMessage(phoneNumber, 'Sorry, there was an error. Please try again.');
      }
    } else {
      console.error(`Template '${templateName}' not found or invalid`);
      await sendWhatsAppMessage(phoneNumber, 'Sorry, there was an error. Please try again.');
    }
  } catch (error) {
    console.error('Error sending template message:', error);
    await sendWhatsAppMessage(phoneNumber, 'Sorry, there was an error. Please try again.');
  }
}

// Handle status request
async function handleStatusRequest(phoneNumber, tenantId = null) {
  try {
    // Get user's tickets from database (tenant-filtered if tenantId provided)
    let query = 'SELECT id, status, issue_title, created_at FROM tickets WHERE mobile = ?';
    let params = [phoneNumber];
    
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 5';
    
    const [tickets] = await pool.execute(query, params);
    
    await sendTemplateMessage(phoneNumber, 'status', { tickets });
  } catch (error) {
    console.error('Error handling status request:', error);
    await sendTemplateMessage(phoneNumber, 'generalError');
  }
}



// Create ticket from WhatsApp conversation
async function createTicketFromWhatsApp(phoneNumber, ticketData, tenantId = 1) {
  try {
    // Try to identify tenant from existing tickets with same phone number
    if (!tenantId) {
      const [existingTickets] = await pool.execute(
        'SELECT tenant_id FROM tickets WHERE mobile = ? LIMIT 1',
        [phoneNumber]
      );
      if (existingTickets.length > 0) {
        tenantId = existingTickets[0].tenant_id;
      } else {
        tenantId = 1; // Default to tenant 1
      }
    }
    
    const [result] = await pool.execute(
      `INSERT INTO tickets (tenant_id, name, email, mobile, country_code, product, product_id, description, issue_type, issue_title, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      [
        tenantId,
        ticketData.name,
        ticketData.email,
        ticketData.mobile,
        ticketData.countryCode || null,
        ticketData.product || null,
        ticketData.productId || null,
        ticketData.description,
        ticketData.issueType,
        ticketData.issueTitle
      ]
    );

    const ticketId = result.insertId;
    console.log(`✅ Ticket created from WhatsApp: #${ticketId}`);

    // Store initial description as first message in unified thread
    await ticketMessagesService.addMessage({
      ticketId,
      tenantId,
      senderType: 'user',
      senderName: ticketData.name || 'Customer',
      message: ticketData.description || '',
      channel: ticketMessagesService.CHANNELS.WHATSAPP
    });

    try {
      const TicketAssignmentService = require('../../shared/utils/ticketAssignment');
      await TicketAssignmentService.assignTicketEqually(ticketId, null, tenantId);
    } catch (err) {
      console.warn(`⚠️ Auto-assignment failed for WhatsApp ticket #${ticketId}:`, err.message);
    }

    ticketEventNotificationService
      .notifyTicketCreated({
        ticketId,
        tenantId,
        name: ticketData.name,
        email: ticketData.email,
        mobile: ticketData.mobile,
        issueTitle: ticketData.issueTitle || ticketData.description?.substring(0, 100) || 'Support Request',
        firstResponseMinutes: 480
      })
      .catch((err) => console.warn('WhatsApp ticket-created notifications failed:', err?.message));

    return ticketId;
  } catch (error) {
    console.error('❌ Error creating ticket from WhatsApp:', error);
    return null;
  }
}



// Route to send WhatsApp message manually
router.post('/send', validateWhatsAppMessage, handleValidationErrors, rateLimitWhatsApp, async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    const result = await sendWhatsAppMessage(phoneNumber, message);
    
    if (result) {
      res.json({
        success: true,
        message: 'WhatsApp message sent successfully',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send WhatsApp message'
      });
    }
  } catch (error) {
    console.error('Error in send endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Route to reset conversation state
router.post('/reset-conversation', (req, res) => {
  const { phoneNumber } = req.body;
  
  if (phoneNumber) {
    userConversations.delete(phoneNumber);
    res.json({
      success: true,
      message: 'Conversation reset successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Phone number is required'
    });
  }
});

// Route to send template
router.post('/send-template', async (req, res) => {
  try {
    const { phoneNumber, templateName } = req.body;
    
    if (!phoneNumber || !templateName) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and template name are required'
      });
    }

    // Get or create conversation
    let conversation = userConversations.get(phoneNumber);
    if (!conversation) {
      conversation = {
        state: conversationStates.START,
        data: {}
      };
    }

    // Set current template
    conversation.currentTemplate = templateName;
    userConversations.set(phoneNumber, conversation);

    // Send template message
    const template = templates.createTemplate(templateName);
    if (template && template.text) {
      await sendWhatsAppMessage(phoneNumber, template.text);
      
      res.json({
        success: true,
        message: 'Template sent successfully',
        template: templateName
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Template not found'
      });
    }
  } catch (error) {
    console.error('Error sending template:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Route to get available templates
router.get('/templates', (req, res) => {
  try {
    const availableTemplates = templates.getAvailableTemplates();
    res.json({
      success: true,
      templates: availableTemplates
    });
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Health check endpoint
router.get('/status', async (req, res) => {
  try {
    // Get phone number details for better status
    let phoneDetails = null;
    let statusMessage = 'Unknown';
    
    if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
      try {
        const response = await axios.get(`${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}`, {
          params: {
            access_token: WHATSAPP_ACCESS_TOKEN,
            fields: 'id,code_verification_status,quality_rating'
          },
          timeout: 5000
        });
        
        phoneDetails = response.data;
        
        // Determine actual working status
        if (phoneDetails.quality_rating === 'GREEN') {
          statusMessage = 'FULLY OPERATIONAL';
        } else if (phoneDetails.code_verification_status === 'EXPIRED') {
          statusMessage = 'PARTIALLY OPERATIONAL (Verification expired but functional)';
        } else {
          statusMessage = 'CONFIGURED';
        }
      } catch (error) {
        statusMessage = 'ERROR - Cannot verify phone number';
      }
    }
    
    res.json({
      success: true,
      message: 'WhatsApp webhook is running',
      timestamp: new Date().toISOString(),
      verifyToken: verifyToken ? 'Configured' : 'Not configured',
      whatsappApi: WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_ACCESS_TOKEN ? statusMessage : 'Not configured',
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
      qualityRating: phoneDetails?.quality_rating || 'Unknown',
      verificationStatus: phoneDetails?.code_verification_status || 'Unknown',
      activeConversations: userConversations.size
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking WhatsApp status',
      error: error.message
    });
  }
});

// Test endpoint for WhatsApp notifications
router.post('/test-notification', async (req, res) => {
  try {
    const { phoneNumber, notificationType, ticketData } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'phoneNumber is required'
      });
    }
    
    let notificationResult = null;
    
    switch (notificationType) {
      case 'agent_reply':
        await ticketEventNotificationService.notifyAgentReplyToCustomer({
          ticketId: Number(ticketData?.ticketId || 123),
          tenantId: Number(ticketData?.tenantId || 1),
          issueTitle: ticketData?.issueTitle || 'Test Issue',
          customerEmail: ticketData?.customerEmail || '',
          customerName: ticketData?.customerName || 'Customer',
          mobile: phoneNumber,
          senderName: ticketData?.agentName || 'Test Agent',
          messageText: ticketData?.message || 'This is a test reply from the support team.'
        });
        notificationResult = { success: true };
        break;

      case 'status_update':
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: {
            id: Number(ticketData?.ticketId || 123),
            tenant_id: Number(ticketData?.tenantId || 1),
            issue_title: ticketData?.issueTitle || 'Test Issue',
            mobile: phoneNumber,
            email: ticketData?.customerEmail || '',
            name: ticketData?.customerName || 'Customer'
          },
          tenantId: Number(ticketData?.tenantId || 1),
          previousStatus: ticketData?.previousStatus || 'new',
          newStatus: ticketData?.status || 'in_progress',
          actorId: null,
          actorName: 'System'
        });
        notificationResult = { success: true };
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid notification type. Use: agent_reply or status_update'
        });
    }
    
    res.json({
      success: true,
      message: `${notificationType} notification sent successfully`,
      notificationType,
      phoneNumber,
      result: notificationResult
    });
    
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
});

// API endpoint to trigger satisfaction rating collection
router.post('/satisfaction/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Get ticket details (tenant-filtered if tenantId can be determined)
    // Note: For webhook routes, tenant identification may need enhancement
    const [tickets] = await pool.execute(
      'SELECT id, name, mobile, issue_title, status, tenant_id FROM tickets WHERE id = ?',
      [ticketId]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    
    // Check if ticket is closed
    if (ticket.status !== 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Satisfaction rating can only be requested for closed tickets'
      });
    }
    
    // Check if already rated
    if (ticket.satisfaction_rating) {
      return res.status(400).json({
        success: false,
        message: 'This ticket has already been rated'
      });
    }
    
    // Start satisfaction rating collection
    const success = await startSatisfactionRating(phoneNumber, ticketId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Satisfaction rating request sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send satisfaction rating request'
      });
    }
    
  } catch (error) {
    console.error('Error triggering satisfaction rating:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Export functions for use in other modules
module.exports = {
  router,
  startSatisfactionRating,
  storeSatisfactionRating
}; 
