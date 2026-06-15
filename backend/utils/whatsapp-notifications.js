const axios = require('axios');

// WhatsApp API configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "521803094347148";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Add timeout and retry configuration
const axiosConfig = {
  timeout: 10000, // 10 seconds
  headers: {
    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

// Get base URL for links (matches emailService)
function getAppUrl() {
  return process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
}

// Format SLA response time in minutes to human-readable string (e.g. 120 -> "2 hours")
function formatResponseTime(minutes) {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minute${mins === 1 ? '' : 's'}`;
}

// Notification for ticket creation (options.includeLink: only for new users)
// options.firstResponseExpectationMinutes: SLA first response time (e.g. 120 for "within 2 hours")
async function sendTicketCreatedNotification(ticket, options = {}) {
  if (!ticket.mobile) return null;
  const { includeLink = true, firstResponseExpectationMinutes } = options;
  const baseUrl = getAppUrl();
  const ticketLink = ticket.email
    ? `${baseUrl}/chat/${ticket.id}?m=&u=${encodeURIComponent(ticket.name || '')}&e=${encodeURIComponent(ticket.email)}`
    : `${baseUrl}/chat/${ticket.id}`;
  const linkLine = includeLink ? `\n\n🔗 *View Ticket:* ${ticketLink}\n\n` : '\n\n';
  const responseTimeText = firstResponseExpectationMinutes ? formatResponseTime(firstResponseExpectationMinutes) : null;
  const slaLine = responseTimeText
    ? `Our support team will respond within ${responseTimeText}.\n\n`
    : `We'll assign an agent shortly.\n\n`;
  const whatsappMessage = `🆕 *Ticket Created*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title || 'Support Request'}\n\n` +
    `Your support ticket has been created successfully. ` +
    slaLine +
    linkLine +
    `Thank you for contacting us!`;
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // Check if WhatsApp is properly configured
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.log('❌ WhatsApp API not configured');
      return null;
    }

    // Format phone number for WhatsApp API (remove + and ensure proper format)
    let formattedPhone = phoneNumber;
    if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }
    
    // Ensure it's a valid international format
    if (formattedPhone.length < 10) {
      console.log(`❌ Invalid phone number format: ${phoneNumber}`);
      return null;
    }

    console.log(`📤 Sending WhatsApp notification to ${formattedPhone} (original: ${phoneNumber})`);

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          body: message
        }
      },
      axiosConfig
    );

    console.log('✅ WhatsApp notification sent successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error sending WhatsApp notification:', error.response?.data || error.message);
    return null;
  }
}

// Notification for agent replies (options.includeLink: only for new users)
async function sendAgentReplyNotification(ticket, agentName, message, options = {}) {
  if (!ticket.mobile) return null;
  const { includeLink = true } = options;

  const formattedMessage = message.length > 100 ?
    message.substring(0, 100) + '...' : message;

  const baseUrl = getAppUrl();
  const ticketLink = ticket.email
    ? `${baseUrl}/chat/${ticket.id}?m=&u=${encodeURIComponent(ticket.name || '')}&e=${encodeURIComponent(ticket.email)}`
    : `${baseUrl}/chat/${ticket.id}`;
  const linkSection = includeLink
    ? `\n\n📱 *Want to continue chatting?*\nReply to this message or open the app for full conversation.\n\n🔗 *App Link:* ${ticketLink}\n\n`
    : '\n\n';

  const whatsappMessage = `🔔 *New Reply from Support Team*\n\n` +
    `🎫 *Ticket:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title}\n` +
    `👨‍💼 *Agent:* ${agentName}\n\n` +
    `💬 *Reply:*\n${formattedMessage}` +
    linkSection +
    `Thank you for your patience! 🙏`;

  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Notification for ticket status updates
async function sendStatusUpdateNotification(ticket, newStatus) {
  if (!ticket.mobile) return null;
  
  const statusEmoji = {
    'new': '🆕',
    'in_progress': '⏳',
    'closed': '✅',
    'escalated': '🚨'
  };
  
  const statusText = {
    'new': 'New',
    'in_progress': 'In Progress',
    'closed': 'Resolved',
    'escalated': 'Escalated'
  };
  
  const baseUrl = getAppUrl();
  const whatsappMessage = `📋 *Ticket Status Update*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title}\n` +
    `📊 *Status:* ${statusEmoji[newStatus]} ${statusText[newStatus]}\n\n` +
    `Your ticket has been updated. We'll keep you informed of any progress!\n\n` +
    `🔗 *View Details:* ${baseUrl}/chat/${ticket.id}`;
  
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Notification for ticket assignment
async function sendAssignmentNotification(ticket, agentName) {
  if (!ticket.mobile) return null;
  const baseUrl = getAppUrl();
  const whatsappMessage = `👨‍💼 *Ticket Assigned*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title}\n` +
    `👨‍💼 *Assigned to:* ${agentName}\n\n` +
    `Your ticket has been assigned to a support agent who will assist you shortly.\n\n` +
    `🔗 *View Details:* ${baseUrl}/chat/${ticket.id}`;
  
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Notification for ticket escalation
async function sendEscalationNotification(ticket, reason = '') {
  if (!ticket.mobile) return null;
  const baseUrl = getAppUrl();
  const whatsappMessage = `🚨 *Ticket Escalated*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title}\n` +
    `📊 *Status:* Escalated to Senior Support\n\n` +
    `${reason ? `📝 *Reason:* ${reason}\n\n` : ''}` +
    `Your ticket has been escalated for specialized attention. We'll get back to you soon.\n\n` +
    `🔗 *View Details:* ${baseUrl}/chat/${ticket.id}`;
  
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Notification for ticket resolution
async function sendResolutionNotification(ticket, resolution = '') {
  if (!ticket.mobile) return null;
  const baseUrl = getAppUrl();
  const whatsappMessage = `✅ *Ticket Resolved*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title}\n` +
    `📊 *Status:* Resolved\n\n` +
    `${resolution ? `💡 *Resolution:* ${resolution}\n\n` : ''}` +
    `Your ticket has been resolved. Thank you for using our support service!\n\n` +
    `🔗 *View Details:* ${baseUrl}/chat/${ticket.id}\n\n` +
    `📝 *Rate your experience:* ${baseUrl}/feedback/${ticket.id}`;
  
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Notification for SLA breach warning
async function sendSLABreachWarning(ticket, slaTime) {
  if (!ticket.mobile) return null;
  const baseUrl = getAppUrl();
  const whatsappMessage = `⏰ *SLA Warning*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title}\n` +
    `⏱️ *SLA Time:* ${slaTime} minutes\n\n` +
    `Your ticket is approaching the SLA time limit. We're working to resolve it quickly.\n\n` +
    `🔗 *View Details:* ${baseUrl}/chat/${ticket.id}`;
  
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Notification for customer satisfaction request
async function sendSatisfactionRequest(ticket) {
  if (!ticket.mobile) return null;
  const baseUrl = getAppUrl();
  const whatsappMessage = `⭐ *Rate Your Experience*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title}\n\n` +
    `How was your support experience? Please rate us:\n\n` +
    `🔗 *Rate Now:* ${baseUrl}/feedback/${ticket.id}\n\n` +
    `Your feedback helps us improve our service! 🙏`;
  
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

// Inactivity reminders (level 1=12h, 2=24h, 3=36h)
async function sendInactivityReminder(ticket, reminderLevel) {
  if (!ticket.mobile) return null;
  const baseUrl = getAppUrl();
  const ticketLink = ticket.email
    ? `${baseUrl}/chat/${ticket.id}?m=&u=${encodeURIComponent(ticket.name || '')}&e=${encodeURIComponent(ticket.email)}`
    : `${baseUrl}/chat/${ticket.id}`;

  const messages = {
    1: `⏰ *Reminder*\n\nYour support team has responded to ticket #${ticket.id}. Please reply at your earliest convenience.\n\n🔗 *Reply:* ${ticketLink}`,
    2: `⚠️ *Important*\n\nWe have not received a response on ticket #${ticket.id}. Your ticket may be automatically closed if we do not hear back.\n\n🔗 *Reply:* ${ticketLink}`,
    3: `🔔 *Final Reminder*\n\nThis is our final reminder for ticket #${ticket.id}. If we do not receive a response soon, your ticket will be automatically closed.\n\n🔗 *Reply:* ${ticketLink}`
  };
  const msg = messages[reminderLevel] || messages[1];
  return await sendWhatsAppMessage(ticket.mobile, msg);
}

// Closure notification when ticket closed due to inactivity
async function sendInactivityClosureNotification(ticket) {
  if (!ticket.mobile) return null;
  const baseUrl = getAppUrl();
  const whatsappMessage = `📋 *Ticket Closed*\n\n` +
    `Ticket #${ticket.id} has been closed due to no response after our reminders.\n\n` +
    `If your issue persists, please create a new ticket.\n\n` +
    `🔗 *Create New Ticket:* ${baseUrl}`;
  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

async function sendTicketEtaUpdatedNotification(ticket, options = {}) {
  if (!ticket.mobile) return null;
  const { oldEta = null, newEta = null, reason = '', updatedBy = '' } = options;
  const baseUrl = getAppUrl();
  const fmtEta = (value) => {
    const d = value ? new Date(value) : null;
    return d && Number.isFinite(d.getTime())
      ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      : 'Not set';
  };
  const previous = fmtEta(oldEta);
  const next = fmtEta(newEta);
  const safeReason = String(reason || '').trim();
  const actorLine = updatedBy ? `👤 *Updated by:* ${updatedBy}\n` : '';
  const reasonLine = safeReason ? `📝 *Reason:* ${safeReason}\n` : '';
  const ticketLink = ticket.email
    ? `${baseUrl}/chat/${ticket.id}?m=&u=${encodeURIComponent(ticket.name || '')}&e=${encodeURIComponent(ticket.email)}`
    : `${baseUrl}/chat/${ticket.id}`;

  const whatsappMessage = `⏱️ *ETA Updated*\n\n` +
    `🎫 *Ticket ID:* #${ticket.id}\n` +
    `🏷️ *Issue:* ${ticket.issue_title || 'Support Request'}\n` +
    `📅 *Previous ETA:* ${previous}\n` +
    `📅 *Updated ETA:* ${next}\n` +
    actorLine +
    reasonLine +
    `\n🔗 *View Ticket:* ${ticketLink}`;

  return await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
}

module.exports = {
  sendWhatsAppMessage,
  sendTicketCreatedNotification,
  sendAgentReplyNotification,
  sendStatusUpdateNotification,
  sendAssignmentNotification,
  sendEscalationNotification,
  sendResolutionNotification,
  sendSLABreachWarning,
  sendSatisfactionRequest,
  sendInactivityReminder,
  sendInactivityClosureNotification,
  sendTicketEtaUpdatedNotification
};
