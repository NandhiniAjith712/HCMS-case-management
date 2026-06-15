const { pool } = require('./database');
const emailService = require('./services/emailService');

async function testChatEmail() {
  try {
    console.log('🧪 Testing Chat Message Creation with Email Notification...\n');
    
    // Test 1: Create a chat message as an agent
    console.log('📝 Test 1: Creating chat message as agent...');
    
    const ticketId = 19;
    const senderType = 'agent';
    const senderId = 1;
    const senderName = 'Test Agent';
    const message = 'This is a test reply from agent to customer';
    const messageType = 'text';
    
    // First, check if ticket exists and get customer details
    const [ticketDetails] = await pool.execute(`
      SELECT 
        t.id,
        t.issue_title,
        t.user_id,
        u.email,
        u.name as customer_name,
        u.email_notifications
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `, [ticketId]);
    
    if (ticketDetails.length === 0) {
      console.log('❌ Ticket not found');
      return;
    }
    
    const ticket = ticketDetails[0];
    console.log(`📋 Ticket found: #${ticket.id} - ${ticket.issue_title}`);
    console.log(`👤 Customer: ${ticket.customer_name} (${ticket.email})`);
    console.log(`📧 Email notifications: ${ticket.email_notifications}\n`);
    
    // Test 2: Simulate the email notification logic
    console.log('📧 Test 2: Testing email notification logic...');
    
    if (senderType === 'agent' && messageType === 'text') {
      console.log('✅ Conditions met: senderType=agent, messageType=text');
      
      // Check email notifications preference
      if (ticket.email_notifications === null || ticket.email_notifications === undefined || ticket.email_notifications === 1 || ticket.email_notifications === true) {
        console.log('✅ Email notifications enabled for customer');
        
        // Send email notification
        const emailResult = await emailService.sendAgentReplyNotification(
          ticket.email,
          ticket.customer_name || 'Customer',
          ticket.id,
          ticket.issue_title,
          senderName,
          message
        );
        
        if (emailResult.success) {
          console.log(`✅ Email notification sent to ${ticket.email} for ticket #${ticket.id}`);
          console.log(`📨 Message ID: ${emailResult.messageId}`);
        } else {
          console.error(`❌ Failed to send email notification: ${emailResult.error}`);
        }
      } else {
        console.log(`📵 Email notifications disabled for user ${ticket.email} - skipping notification`);
      }
    } else {
      console.log(`❌ Conditions not met: senderType=${senderType}, messageType=${messageType}`);
    }
    
    console.log('\n🎯 Chat email notification test completed!');
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testChatEmail();
