const { pool } = require('./database');
const emailService = require('./services/emailService');

async function debugEmailNotification() {
  try {
    console.log('🔍 Debugging Email Notification Logic...\n');
    
    const ticketId = 19;
    const senderType = 'agent';
    const messageType = 'text';
    
    console.log(`📋 Testing conditions for ticket #${ticketId}:`);
    console.log(`   - senderType: ${senderType}`);
    console.log(`   - messageType: ${messageType}`);
    console.log(`   - Condition: senderType === 'agent' && messageType === 'text'`);
    console.log(`   - Result: ${senderType === 'agent' && messageType === 'text'}\n`);
    
    if (senderType === 'agent' && messageType === 'text') {
      console.log('✅ Conditions met! Proceeding with email notification...\n');
      
      // Get ticket and customer details (exact logic from chat route)
      console.log('🔍 Fetching ticket and customer details...');
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
      
      if (ticketDetails.length > 0) {
        const ticket = ticketDetails[0];
        console.log(`📋 Ticket found:`);
        console.log(`   - ID: ${ticket.id}`);
        console.log(`   - Title: ${ticket.issue_title}`);
        console.log(`   - Customer: ${ticket.customer_name}`);
        console.log(`   - Email: ${ticket.email}`);
        console.log(`   - Email notifications: ${ticket.email_notifications}\n`);
        
        // Check email notifications preference
        const notificationsEnabled = ticket.email_notifications === null || 
                                   ticket.email_notifications === undefined || 
                                   ticket.email_notifications === 1 || 
                                   ticket.email_notifications === true;
        
        console.log(`📧 Email notifications check:`);
        console.log(`   - Raw value: ${ticket.email_notifications}`);
        console.log(`   - Is null: ${ticket.email_notifications === null}`);
        console.log(`   - Is undefined: ${ticket.email_notifications === undefined}`);
        console.log(`   - Is 1: ${ticket.email_notifications === 1}`);
        console.log(`   - Is true: ${ticket.email_notifications === true}`);
        console.log(`   - Final result: ${notificationsEnabled}\n`);
        
        if (notificationsEnabled) {
          console.log('✅ Email notifications enabled! Sending email...\n');
          
          // Send email notification
          const emailResult = await emailService.sendAgentReplyNotification(
            ticket.email,
            ticket.customer_name || 'Customer',
            ticket.id,
            ticket.issue_title,
            'Test Agent',
            'This is a test reply from agent to customer'
          );
          
          if (emailResult.success) {
            console.log(`✅ Email notification sent successfully!`);
            console.log(`   - To: ${ticket.email}`);
            console.log(`   - Message ID: ${emailResult.messageId}`);
          } else {
            console.error(`❌ Failed to send email notification: ${emailResult.error}`);
          }
        } else {
          console.log(`📵 Email notifications disabled for user ${ticket.email} - skipping notification`);
        }
      } else {
        console.log('❌ Ticket not found');
      }
    } else {
      console.log('❌ Conditions not met - email notification will not be sent');
    }
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

debugEmailNotification();
