const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../../database');
const { authenticateToken, authorizeRole } = require('../../middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../../middleware/tenant');
const TextFormatter = require('../../utils/textFormatter');
const ticketMessagesService = require('../../services/ticketMessagesService');
const ticketEventNotificationService = require('../../services/ticketEventNotificationService');

const router = express.Router();

// Apply tenant context to all routes
router.use(setTenantContext);



// GET /api/replies/:ticketId - Get all replies for a ticket
router.get('/:ticketId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const tenantId = req.tenantId;
    
    // Check if ticket exists (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT id, user_id, email, product_id FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket = tickets[0];
    
    // Scoped / Customer access isolation check
    if (['user', 'customer', 'org_spoc', 'product_spoc'].includes(String(req.user?.role || '').toLowerCase())) {
      const urole = String(req.user.role || '').toLowerCase();
      let hasAccess = false;

      if (urole === 'org_spoc') {
        // Org SPOC has tenant-wide access (ticket already tenant-filtered)
        hasAccess = true;
      } else if (urole === 'product_spoc') {
        // Product SPOC limited to their product scope within the tenant
        hasAccess = Number(ticket.product_id || 0) === Number(req.user.product_scope_id || 0);
      } else {
        // Standard user ownership
        hasAccess = Number(ticket.user_id || 0) === Number(req.user.id || 0) || 
                    (ticket.email && String(ticket.email).toLowerCase() === String(req.user.email || '').toLowerCase());
      }
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this ticket'
        });
      }
    }
    
    // Get unified messages for this ticket (from ticket_messages)
    const messages = await ticketMessagesService.getMessages(ticketId, tenantId);
    const data = messages.map(m => ({
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
      data
    });
  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch replies'
    });
  }
});

// POST /api/replies - Add a reply to a ticket
router.post('/', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { ticketId, agentName, message, isCustomerReply = false, customerName } = req.body;
    
    // Check if ticket exists and get ticket details (tenant-filtered)
    const [tickets] = await pool.execute(
      `SELECT t.id, t.name, t.mobile, t.issue_title, t.email, t.user_id, t.assigned_to, t.product_id, u.email as user_email 
       FROM tickets t LEFT JOIN users u ON t.user_id = u.id 
       WHERE t.id = ? AND t.tenant_id = ?`,
      [ticketId, tenantId]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    ticket.email = ticket.user_email || ticket.email;

    // Scoped / Customer access isolation check
    if (['user', 'customer', 'org_spoc', 'product_spoc'].includes(String(req.user?.role || '').toLowerCase())) {
      const urole = String(req.user.role || '').toLowerCase();
      let hasAccess = false;

      if (urole === 'org_spoc') {
        // Org SPOC has tenant-wide access (ticket already tenant-filtered)
        hasAccess = true;
      } else if (urole === 'product_spoc') {
        // Product SPOC limited to their product scope within the tenant
        hasAccess = Number(ticket.product_id || 0) === Number(req.user.product_scope_id || 0);
      } else {
        // Standard user ownership
        hasAccess = Number(ticket.user_id || 0) === Number(req.user.id || 0) || 
                    (ticket.email && String(ticket.email).toLowerCase() === String(req.user.email || '').toLowerCase());
      }
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this ticket'
        });
      }
    }
    const senderType = isCustomerReply ? 'user' : 'agent';
    const senderName = isCustomerReply ? (customerName || ticket.name) : agentName;

    // Store in unified ticket_messages table
    const msg = await ticketMessagesService.addMessage({
      ticketId,
      tenantId,
      senderType,
      senderName,
      message,
      channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT
    });

    const replyData = msg ? {
      id: msg.id,
      ticket_id: msg.ticket_id,
      message: msg.message,
      sent_at: msg.created_at,
      is_customer_reply: isCustomerReply,
      customer_name: isCustomerReply ? senderName : null,
      agent_name: !isCustomerReply ? senderName : null,
      channel: msg.channel,
      sender_type: senderType,
      sender_name: senderName,
      created_at: msg.created_at
    } : null;

    if (!replyData) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save reply'
      });
    }

    try {
      const appNotificationService = require('../../services/appNotificationService');
      await appNotificationService.notifyCommentAdded(pool, {
        tenantId,
        ticketId: Number(ticketId),
        isCustomerReply: !!isCustomerReply,
        senderName: senderName || (isCustomerReply ? 'Customer' : 'Support'),
        excerpt: String(message || '').slice(0, 200),
        assignedTo: ticket.assigned_to || null,
        userId: ticket.user_id || null,
        issueTitle: ticket.issue_title || ''
      });
    } catch (inAppErr) {
      console.warn('⚠️ In-app comment notifications failed:', inAppErr?.message);
    }

    if (!isCustomerReply) {
      try {
        await ticketEventNotificationService.notifyAgentReplyToCustomer({
          ticketId: Number(ticketId),
          tenantId,
          issueTitle: ticket.issue_title,
          customerEmail: ticket.email || '',
          customerName: ticket.name || 'Customer',
          mobile: ticket.mobile || '',
          senderName: agentName || 'Support',
          messageText: message
        });
      } catch (notifyErr) {
        console.warn('Agent reply notifications failed:', notifyErr?.message);
      }
    }
    
    res.status(201).json({
      success: true,
      message: isCustomerReply ? 'Customer reply added successfully' : 'Reply added successfully',
      data: replyData,
      whatsappSent: !isCustomerReply && !!ticket.mobile
    });
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reply'
    });
  }
});

// PUT /api/replies/:id - Update a reply
router.put('/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { agentName, message } = req.body;
    
    const updated = await ticketMessagesService.updateMessage(id, tenantId, {
      senderName: agentName,
      message
    });
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Reply updated successfully',
      data: {
        id: updated.id,
        ticket_id: updated.ticket_id,
        message: updated.message,
        sent_at: updated.created_at,
        agent_name: updated.sender_name,
        is_customer_reply: false,
        channel: updated.channel,
        sender_type: updated.sender_type,
        sender_name: updated.sender_name,
        created_at: updated.created_at
      }
    });
  } catch (error) {
    console.error('Error updating reply:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update reply'
    });
  }
});

// DELETE /api/replies/:id - Delete a reply
router.delete('/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    const deleted = await ticketMessagesService.deleteMessage(id, tenantId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Reply deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting reply:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete reply'
    });
  }
});

// POST /api/replies/dashboard - Add a reply from dashboard (manager/agent interface)
// Manager Override: Managers can reply to any ticket. is_internal=true for staff-only notes.
router.post('/dashboard', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { ticket_id, message, agent_id, is_internal } = req.body;
    
    if (!ticket_id || !message) {
      return res.status(400).json({
        success: false,
        message: 'ticket_id and message are required'
      });
    }
    
    // Check if ticket exists and get ticket details (tenant-filtered)
    const [tickets] = await pool.execute(
      `SELECT t.id, t.name, t.mobile, t.issue_title, t.email, u.email as user_email 
       FROM tickets t LEFT JOIN users u ON t.user_id = u.id 
       WHERE t.id = ? AND t.tenant_id = ?`,
      [ticket_id, tenantId]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    ticket.email = ticket.user_email || ticket.email;
    
    // Get agent/manager name from agent_id or current user
    let agentName = 'Support Agent';
    const currentUserId = req.user?.id || req.user?.userId;
    const currentRole = (req.user?.role || '').toLowerCase();
    if (agent_id) {
      const [agents] = await pool.execute(
        'SELECT name FROM agents WHERE id = ? AND tenant_id = ?',
        [agent_id, tenantId]
      );
      if (agents.length > 0) agentName = agents[0].name;
    } else if (currentUserId) {
      const [agents] = await pool.execute(
        'SELECT name FROM agents WHERE id = ? AND tenant_id = ?',
        [currentUserId, tenantId]
      );
      if (agents.length > 0) agentName = agents[0].name;
      else {
        const [users] = await pool.execute('SELECT name FROM users WHERE id = ?', [currentUserId]);
        if (users.length > 0) agentName = users[0].name;
      }
    }
    
    // Prefix sender label by role for chat display consistency
    if (!/^agent\s+/i.test(agentName) && !/^manager\s+/i.test(agentName)) {
      if (['support_manager', 'manager', 'ceo'].includes(currentRole)) {
        agentName = `Manager ${agentName}`;
      } else {
        agentName = `Agent ${agentName}`;
      }
    }

    // Store in unified ticket_messages table (is_internal=true for staff-only notes)
    const msg = await ticketMessagesService.addMessage({
      ticketId: ticket_id,
      tenantId,
      senderType: 'agent',
      senderId: currentUserId || null,
      senderName: agentName,
      message,
      channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
      isInternal: !!is_internal
    });
    
    if (!msg) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save reply'
      });
    }

    const replyData = {
      id: msg.id,
      ticket_id: msg.ticket_id,
      message: msg.message,
      sent_at: msg.created_at,
      is_customer_reply: false,
      agent_name: msg.sender_name,
      channel: msg.channel,
      sender_type: msg.sender_type,
      sender_name: msg.sender_name,
      created_at: msg.created_at
    };
    
    // Log manager override when adding internal note
    if (!!is_internal && req.user && ['support_manager', 'manager', 'ceo'].includes(req.user?.role)) {
      try {
        const ticketActivityService = require('../services/ticketActivityService');
        await ticketActivityService.logActivity({
          ticketId: ticket_id,
          tenantId,
          action: ticketActivityService.ACTIONS.INTERNAL_NOTE,
          performedBy: currentUserId,
          performedByName: agentName,
          details: { preview: message.substring(0, 100) }
        });
      } catch (e) {
        console.warn('Could not log internal note activity:', e?.message);
      }
    }
    
    // Send customer-facing notifications only for non-internal replies.
    let whatsappSent = false;
    if (!is_internal) {
      try {
        await ticketEventNotificationService.notifyAgentReplyToCustomer({
          ticketId: Number(ticket_id),
          tenantId,
          issueTitle: ticket.issue_title,
          customerEmail: ticket.email || '',
          customerName: ticket.name || 'Customer',
          mobile: ticket.mobile || '',
          senderName: agentName || 'Support',
          messageText: message
        });
        whatsappSent = !!ticket.mobile;
      } catch (whatsappError) {
        console.error('Error sending centralized reply notifications:', whatsappError);
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data: replyData,
      whatsappSent: whatsappSent
    });
  } catch (error) {
    console.error('Error adding dashboard reply:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reply'
    });
  }
});

// GET /api/replies/user/:userId - Get all replies for all tickets of a user
router.get('/user/:userId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { userId } = req.params;
    const [ticketRows] = await pool.execute(
      'SELECT id FROM tickets WHERE user_id = ? AND tenant_id = ?',
      [userId, tenantId]
    );
    const ticketIds = ticketRows.map(t => t.id);
    if (ticketIds.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const placeholders = ticketIds.map(() => '?').join(',');
    const [messages] = await pool.execute(
      `SELECT * FROM ticket_messages WHERE ticket_id IN (${placeholders}) AND tenant_id = ? ORDER BY created_at ASC`,
      [...ticketIds, tenantId]
    );
    const data = messages.map(m => ({
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
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching user replies:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user replies' });
  }
});

module.exports = router; 