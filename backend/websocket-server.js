const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { pool } = require('./database');
const ticketMessagesService = require('./services/ticketMessagesService');
const emailService = require('./services/emailService');

const DEBUG_WS = process.env.DEBUG_WS === '1';

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws', // Add specific WebSocket path
      clientTracking: true
    });
    this.clients = new Map(); // Map to store client connections
    this.ticketRooms = new Map(); // Map to store ticket-specific rooms
    this.agentDashboardSubs = new Map(); // Map agentId -> Set of ws (for real-time dashboard updates)
    
    this.initialize();
  }

  initialize() {
    console.log('🔌 Initializing WebSocket server on path /ws');
    
    this.wss.on('connection', (ws, req) => {
      if (DEBUG_WS) console.log('🔌 WebSocket connected:', req.url);
      
      // Set up ping/pong for connection health
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      // Handle client connection
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', (code, reason) => {
        if (DEBUG_WS) console.log('🔌 WebSocket closed:', code);
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.handleDisconnect(ws);
      });
    });

    // Set up heartbeat to detect dead connections
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          if (DEBUG_WS) console.log('💀 Terminating dead connection');
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Check every 30 seconds

    this.wss.on('close', () => {
      clearInterval(interval);
    });

    this.wss.on('error', (error) => {
      console.error('❌ WebSocket server error:', error);
    });

    console.log('✅ WebSocket server initialized on path /ws');
  }

  handleMessage(ws, data) {
    const { type, ticketId, userId, userType, message, agentName, customerName, tenantId } = data;

    // Validate required fields based on message type
    if (!type) {
      this.sendError(ws, 'Message type is required');
      return;
    }

    // Get tenantId from client info if not provided
    const clientInfo = this.clients.get(ws);
    const actualTenantId = tenantId || clientInfo?.tenantId || 1;

    switch (type) {
      case 'JOIN_TICKET':
        if (!ticketId || !userType) {
          this.sendError(ws, 'ticketId and userType are required for JOIN_TICKET');
          return;
        }
        this.joinTicketRoom(ws, ticketId, userId, userType, actualTenantId);
        break;
      
      case 'SEND_MESSAGE':
        if (!ticketId || !message || !userType) {
          this.sendError(ws, 'ticketId, message, and userType are required for SEND_MESSAGE');
          return;
        }
        this.handleSendMessage(ws, ticketId, message, userType, agentName, customerName, actualTenantId);
        break;
      
      case 'TYPING':
        if (!ticketId || !userType) {
          this.sendError(ws, 'ticketId and userType are required for TYPING');
          return;
        }
        this.handleTyping(ws, ticketId, userType, agentName, customerName, true);
        break;
      
      case 'STOP_TYPING':
        if (!ticketId || !userType) {
          this.sendError(ws, 'ticketId and userType are required for STOP_TYPING');
          return;
        }
        this.handleTyping(ws, ticketId, userType, agentName, customerName, false);
        break;

      case 'SUBSCRIBE_AGENT_DASHBOARD':
        if (!userId) {
          this.sendError(ws, 'userId (agentId) is required for SUBSCRIBE_AGENT_DASHBOARD');
          return;
        }
        this.subscribeAgentDashboard(ws, userId, actualTenantId);
        break;

      case 'SUBSCRIBE_APP_NOTIFICATIONS': {
        const token = data.token;
        if (!token || typeof token !== 'string') {
          this.sendError(ws, 'token is required for SUBSCRIBE_APP_NOTIFICATIONS');
          return;
        }
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
          const role = String(decoded.role || '').toLowerCase();
          const rawId = decoded.userId ?? decoded.id ?? decoded.agentId;
          const numericId = rawId != null && !Number.isNaN(Number(rawId)) ? Number(rawId) : null;
          const tenantFromMsg = data.tenantId != null ? Number(data.tenantId) : null;
          const tenantFromJwt = decoded.tenant_id != null ? Number(decoded.tenant_id) : null;
          const tenantId = Number.isFinite(tenantFromMsg)
            ? tenantFromMsg
            : Number.isFinite(tenantFromJwt)
              ? tenantFromJwt
              : 1;
          const isCustomer = ['user', 'customer'].includes(role);
          ws._appNotif = {
            tenantId,
            jwtRole: role,
            staffId: isCustomer ? null : numericId,
            customerUserId: isCustomer ? numericId : null
          };
          const prev = this.clients.get(ws) || {};
          this.clients.set(ws, {
            ...prev,
            ticketId: prev.ticketId != null ? prev.ticketId : null,
            userId: numericId,
            userType: isCustomer ? 'customer' : 'staff',
            tenantId: prev.tenantId || tenantId,
            joinedAt: prev.joinedAt || new Date(),
            appNotificationsOnly: true
          });
          ws.send(JSON.stringify({ type: 'SUBSCRIBED_APP_NOTIFICATIONS', tenantId }));
        } catch (e) {
          console.warn('⚠️ SUBSCRIBE_APP_NOTIFICATIONS failed:', e?.message || e);
          this.sendError(ws, 'Invalid or expired token');
        }
        break;
      }
      
      default:
        if (DEBUG_WS) console.log('❓ Unknown message type:', type);
        this.sendError(ws, `Unknown message type: ${type}`);
    }
  }

  async joinTicketRoom(ws, ticketId, userId, userType, tenantId = null) {
    try {
      if (DEBUG_WS) console.log(`🔄 Join ticket ${ticketId} as ${userType}`);
      
      // Validate ticket exists (tenant-filtered if tenantId provided)
      let query = 'SELECT id, status, tenant_id FROM tickets WHERE id = ?';
      let params = [ticketId];
      
      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }
      
      const [tickets] = await pool.execute(query, params);

      if (tickets.length === 0) {
        if (DEBUG_WS) console.log(`❌ Ticket ${ticketId} not found`);
        this.sendError(ws, 'Ticket not found');
        return;
      }

      const ticket = tickets[0];

      // Store client information (with tenant_id)
      const actualTenantId = tickets[0].tenant_id || tenantId || 1;
      this.clients.set(ws, {
        ticketId,
        userId,
        userType,
        tenantId: actualTenantId,
        joinedAt: new Date()
      });

      // Create or get ticket room
      if (!this.ticketRooms.has(ticketId)) {
        this.ticketRooms.set(ticketId, new Set());
      }
      
      this.ticketRooms.get(ticketId).add(ws);
      
      // Create or join chat session (with tenant_id)
      try {
        await this.createOrJoinSession(ticketId, userId, userType, userType === 'agent' ? 'Agent' : 'Customer', actualTenantId);
      } catch (sessionError) {
        console.error('⚠️ Session creation failed, but continuing:', sessionError.message);
        // Continue even if session creation fails
      }
      
      // Send confirmation to client
      ws.send(JSON.stringify({
        type: 'JOINED_ROOM',
        ticketId,
        userType,
        message: `Successfully joined ticket ${ticketId} chat room`
      }));
      
    } catch (error) {
      console.error('❌ Error joining ticket room:', error);
      this.sendError(ws, 'Failed to join ticket room. Please try again.');
    }
  }

  async createOrJoinSession(ticketId, userId, userType, userName, tenantId = 1) {
    try {
      if (DEBUG_WS) console.log(`🔄 Session ticket ${ticketId} userType ${userType}`);
      
      // Handle non-integer user IDs (like 'admin')
      const numericUserId = userId && !isNaN(userId) ? parseInt(userId) : null;
      
      // Check if active session exists (tenant-filtered)
      let [sessions] = await pool.execute(`
        SELECT session_id FROM chat_sessions 
        WHERE ticket_id = ? AND tenant_id = ? AND status = 'active'
        LIMIT 1
      `, [ticketId, tenantId]);
      
      let sessionId;
      
      if (sessions.length === 0) {
        // Create new session
        sessionId = `session_${ticketId}_${Date.now()}`;
        
        // Use different queries based on userType to avoid SQL injection
        let insertQuery;
        let insertParams;
        
        if (userType === 'agent') {
          insertQuery = `
            INSERT INTO chat_sessions (tenant_id, ticket_id, session_id, agent_id, last_activity_at, status)
            VALUES (?, ?, ?, ?, NOW(), 'active')
          `;
          insertParams = [tenantId, ticketId, sessionId, numericUserId];
        } else if (userType === 'customer') {
          insertQuery = `
            INSERT INTO chat_sessions (tenant_id, ticket_id, session_id, customer_id, last_activity_at, status)
            VALUES (?, ?, ?, ?, NOW(), 'active')
          `;
          insertParams = [tenantId, ticketId, sessionId, numericUserId];
        } else {
          // For system or other user types, don't set specific user ID
          insertQuery = `
            INSERT INTO chat_sessions (tenant_id, ticket_id, session_id, last_activity_at, status)
            VALUES (?, ?, ?, NOW(), 'active')
          `;
          insertParams = [tenantId, ticketId, sessionId];
        }
        
        await pool.execute(insertQuery, insertParams);
      } else {
        sessionId = sessions[0].session_id;
        
        // Update last activity (tenant-filtered)
        await pool.execute(`
          UPDATE chat_sessions 
          SET last_activity_at = NOW() 
          WHERE session_id = ? AND tenant_id = ?
        `, [sessionId, tenantId]);
      }
      
      // Add or update participant (with tenant_id)
      // chat_participants.user_id references users(id). Agent IDs come from agents table,
      // so store NULL for non-customer participants to avoid FK violations.
      const participantUserId = userType === 'customer' ? numericUserId : null;
      await pool.execute(`
        INSERT INTO chat_participants (tenant_id, session_id, user_id, user_type, user_name, joined_at)
        VALUES (?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          left_at = NULL,
          joined_at = NOW(),
          is_typing = FALSE
      `, [tenantId, sessionId, participantUserId, userType, userName]);
      
      return sessionId;
    } catch (error) {
      console.error('❌ Error creating/joining session:', error);
      throw error;
    }
  }

  async handleSendMessage(ws, ticketId, message, userType, agentName, customerName, tenantId = 1) {
    try {
      // Save message to database first (with tenant_id)
      const savedMessage = await this.saveMessageToDatabase(ticketId, message, userType, agentName, customerName, tenantId);
      
      if (!savedMessage) {
        this.sendError(ws, 'Failed to save message');
        return;
      }

      // Broadcast message to all clients in the ticket room
      this.broadcastMessage(ticketId, {
        type: 'NEW_MESSAGE',
        ticketId,
        message,
        channel: savedMessage.channel || 'platform_chat',
        userType,
        agentName,
        customerName,
        messageId: savedMessage.id,
        timestamp: savedMessage.created_at
      });

      // Send confirmation to sender
      ws.send(JSON.stringify({
        type: 'MESSAGE_SENT',
        messageId: savedMessage.id,
        timestamp: savedMessage.created_at
      }));

      // Send email notification to customer when agent replies (same as POST /chat/messages)
      if (userType === 'agent' && message) {
        this.sendAgentReplyEmailNotification(ticketId, tenantId, agentName || 'Agent', message).catch(err => {
          console.error('❌ Error sending email notification (WebSocket):', err.message);
        });
      }
    } catch (error) {
      console.error('❌ Error sending message:', error);
      this.sendError(ws, 'Failed to send message');
    }
  }

  /**
   * Send email to customer when agent replies via WebSocket (mirrors chat.js logic)
   */
  async sendAgentReplyEmailNotification(ticketId, tenantId, agentName, message) {
    const [rows] = await pool.execute(`
      SELECT t.id, t.issue_title, t.email, t.name as ticket_customer_name,
             u.email as user_email, u.name as user_name, u.email_notifications
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ? AND t.tenant_id = ?
    `, [ticketId, tenantId]);
    if (!rows || rows.length === 0) return;
    const ticket = rows[0];
    const customerEmail = ticket.user_email || ticket.email;
    const customerName = ticket.user_name || ticket.ticket_customer_name || 'Customer';
    const notificationsEnabled = (ticket.email_notifications === null || ticket.email_notifications === undefined || ticket.email_notifications === 1 || ticket.email_notifications === true);
    if (!customerEmail || !notificationsEnabled) {
      if (!customerEmail) console.log(`📵 No email for ticket #${ticketId} - skipping notification`);
      return;
    }
    let includeLink = true;
    try {
      const [userRows] = await pool.execute('SELECT welcome_url_sent FROM users WHERE email = ?', [customerEmail]);
      if (userRows[0]?.welcome_url_sent === 1 || userRows[0]?.welcome_url_sent === true) includeLink = false;
    } catch (_) {}
    const result = await emailService.sendAgentReplyNotification(
      customerEmail,
      customerName,
      ticket.id,
      ticket.issue_title,
      agentName,
      message,
      undefined,
      { includeLink }
    );
    if (result && result.success) {
      console.log(`✅ Email notification sent to ${customerEmail} for ticket #${ticket.id}`);
    } else if (result && !result.success) {
      console.error(`❌ Failed to send email notification: ${result.error}`);
    }
  }

  async handleTyping(ws, ticketId, userType, agentName, customerName, isTyping) {
    try {
      // Get tenantId from client info
      const clientInfo = this.clients.get(ws);
      const tenantId = clientInfo?.tenantId || 1;
      
      // Get the actual session ID for this ticket (tenant-filtered)
      const [sessions] = await pool.execute(`
        SELECT session_id FROM chat_sessions 
        WHERE ticket_id = ? AND tenant_id = ? AND status = 'active'
        LIMIT 1
      `, [ticketId, tenantId]);
      
      if (sessions.length === 0) return;
      
      const sessionId = sessions[0].session_id;
      
      // Update typing status in database - use user_type instead of user_id for non-numeric IDs (tenant-filtered)
      await pool.execute(`
        UPDATE chat_participants 
        SET is_typing = ?, last_typing_at = ?
        WHERE session_id = ? AND tenant_id = ? AND user_type = ?
      `, [isTyping, isTyping ? new Date() : null, sessionId, tenantId, userType]);

      // Broadcast typing status to other users
      this.broadcastToOthers(ws, ticketId, {
        type: isTyping ? 'USER_TYPING' : 'USER_STOPPED_TYPING',
        ticketId,
        userType,
        agentName,
        customerName
      });
    } catch (error) {
      console.error('❌ Error updating typing status:', error);
      this.sendError(ws, 'Failed to update typing status');
    }
  }

  broadcastMessage(ticketId, message) {
    const room = this.ticketRooms.get(ticketId);
    if (room) {
      const messageStr = JSON.stringify(message);
      let sentCount = 0;
      
      room.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(messageStr);
            sentCount++;
          } catch (error) {
            console.error('❌ Error sending message to client:', error);
          }
        }
      });
    }
  }

  broadcastToOthers(ws, ticketId, message) {
    const room = this.ticketRooms.get(ticketId);
    if (room) {
      const messageStr = JSON.stringify(message);
      let sentCount = 0;
      
      room.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          try {
            client.send(messageStr);
            sentCount++;
          } catch (error) {
            console.error('❌ Error sending message to client:', error);
          }
        }
      });
    }
  }

  async saveMessageToDatabase(ticketId, message, userType, agentName, customerName, tenantId = 1) {
    try {
      const senderType = userType === 'customer' ? 'user' : 'agent';
      const senderName = userType === 'customer' ? customerName : agentName;

      // Get tenant_id from ticket if not provided
      if (!tenantId) {
        const [tickets] = await pool.execute(
          'SELECT tenant_id FROM tickets WHERE id = ?',
          [ticketId]
        );
        tenantId = tickets.length > 0 ? tickets[0].tenant_id : 1;
      }

      const msg = await ticketMessagesService.addMessage({
        ticketId,
        tenantId,
        senderType,
        senderName,
        message,
        channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT
      });

      return msg;
    } catch (error) {
      console.error('❌ Error saving message to database:', error);
      return null;
    }
  }

  sendError(ws, message) {
    try {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: message,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('❌ Error sending error message:', error);
    }
  }

  handleDisconnect(ws) {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      const { ticketId, userType, agentDashboardAgentId } = clientInfo;

      // Remove from ticket room (skip when only app-notification subscription)
      if (ticketId != null && ticketId !== '') {
        const room = this.ticketRooms.get(ticketId);
        if (room) {
          room.delete(ws);
          if (room.size === 0) this.ticketRooms.delete(ticketId);
        }
      }

      // Remove from agent dashboard subs
      if (agentDashboardAgentId) {
        const subs = this.agentDashboardSubs.get(agentDashboardAgentId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) this.agentDashboardSubs.delete(agentDashboardAgentId);
        }
      }

      // Remove from clients map
      this.clients.delete(ws);
    }
    delete ws._appNotif;
  }

  subscribeAgentDashboard(ws, agentId, tenantId = 1) {
    const agentKey = String(agentId);
    if (!this.agentDashboardSubs.has(agentKey)) {
      this.agentDashboardSubs.set(agentKey, new Set());
    }
    this.agentDashboardSubs.get(agentKey).add(ws);
    this.clients.set(ws, { agentDashboardAgentId: agentKey, tenantId, joinedAt: new Date() });
    ws.send(JSON.stringify({ type: 'SUBSCRIBED_AGENT_DASHBOARD', agentId: agentKey }));
  }

  /**
   * Push one in-app notification payload to subscribed clients (JWT SUBSCRIBE_APP_NOTIFICATIONS).
   * @param {number} tenantId
   * @param {object} apiPayload — shape from appNotificationService.mapRowToApi
   * @param {{ staffRecipientIds?: number[], userRecipientIds?: number[], includeCeoAdmins?: boolean }} routing
   */
  broadcastAppNotification(tenantId, apiPayload, routing = {}) {
    const staffSet = new Set((routing.staffRecipientIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0));
    const userSet = new Set((routing.userRecipientIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0));
    // SECURITY/ROUTING: CEO/admin should only receive notifications explicitly targeted to them.
    // Default is false; enable only when a sender explicitly opts-in.
    const includeCeo = routing.includeCeoAdmins === true;
    const messageStr = JSON.stringify({ type: 'new_notification', data: apiPayload });
    this.wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN || !client._appNotif) return;
      const sub = client._appNotif;
      if (Number(sub.tenantId) !== Number(tenantId)) return;
      const jr = String(sub.jwtRole || '').toLowerCase();
      if (includeCeo && ['ceo', 'admin'].includes(jr)) {
        try {
          client.send(messageStr);
        } catch (e) {
          console.error('WS app-notification send error:', e?.message);
        }
        return;
      }
      if (sub.staffId != null && staffSet.has(Number(sub.staffId))) {
        try {
          client.send(messageStr);
        } catch (e) {
          console.error('WS app-notification send error:', e?.message);
        }
        return;
      }
      if (sub.customerUserId != null && userSet.has(Number(sub.customerUserId))) {
        try {
          client.send(messageStr);
        } catch (e) {
          console.error('WS app-notification send error:', e?.message);
        }
      }
    });
  }

  /**
   * Broadcast ticket update to clients in the ticket room and to the assigned agent's dashboard.
   */
  broadcastTicketUpdate(ticketId, tenantId, payload, assignedToAgentId = null) {
    const message = JSON.stringify({ type: 'TICKET_UPDATED', ticketId, ...payload });
    
    // Broadcast to ticket chat room
    const room = this.ticketRooms.get(Number(ticketId));
    if (room) {
      room.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try { client.send(message); } catch (e) { console.error('WS send error:', e); }
        }
      });
    }

    // Send to assigned agent's dashboard subscribers
    if (assignedToAgentId) {
      const subs = this.agentDashboardSubs.get(String(assignedToAgentId));
      if (subs) {
        subs.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            try { client.send(message); } catch (e) { console.error('WS send error:', e); }
          }
        });
      }
    }
  }

  // Get connected clients count for a ticket
  getTicketClientsCount(ticketId) {
    const room = this.ticketRooms.get(ticketId);
    return room ? room.size : 0;
  }

  // Get all connected clients info
  getConnectedClients() {
    const clients = [];
    this.clients.forEach((info, ws) => {
      clients.push({
        ...info,
        connected: ws.readyState === WebSocket.OPEN
      });
    });
    return clients;
  }

  // Get server statistics
  getServerStats() {
    return {
      totalConnections: this.clients.size,
      activeRooms: this.ticketRooms.size,
      connectedClients: this.getConnectedClients()
    };
  }
}

module.exports = WebSocketServer; 