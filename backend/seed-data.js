const { pool } = require('./database');

const sampleTickets = [
  {
    name: 'John Doe',
    email: 'john@example.com',
    mobile: '1234567890',
    description: 'I cannot log into my account. The login button is not working and I get an error message saying "Invalid credentials". I have been trying for the past 2 days.',
    issue_type: 'Technical Support',
    issue_title: 'Login Problem',
    status: 'new'
  },
  {
    name: 'Jane Smith',
    email: 'jane@example.com',
    mobile: '9876543210',
    description: 'Payment processing error on my last transaction. The payment was deducted from my account but the service was not activated. I need this resolved urgently.',
    issue_type: 'Billing Issue',
    issue_title: 'Payment Processing Error',
    status: 'new'
  },
  {
    name: 'Mike Johnson',
    email: 'mike@example.com',
    mobile: '5551234567',
    description: 'Unable to access premium features after subscription renewal. The features are still showing as locked even though my payment went through successfully.',
    issue_type: 'Account Access',
    issue_title: 'Premium Features Not Working',
    status: 'in_progress'
  },
  {
    name: 'Sarah Wilson',
    email: 'sarah@example.com',
    mobile: '4449876543',
    description: 'Need help with password reset process. The reset link is not working properly and I cannot access my account. This is urgent as I need to access important documents.',
    issue_type: 'Technical Support',
    issue_title: 'Password Reset Issue',
    status: 'closed'
  },
  {
    name: 'David Brown',
    email: 'david@example.com',
    mobile: '3334567890',
    description: 'The mobile app is crashing every time I try to upload a photo. This happens on both Android and iOS devices. Please help me resolve this issue.',
    issue_type: 'Bug Report',
    issue_title: 'App Crashes on Photo Upload',
    status: 'in_progress'
  },
  {
    name: 'Lisa Garcia',
    email: 'lisa@example.com',
    mobile: '2227894561',
    description: 'I would like to request a dark mode feature for the web interface. This would be very helpful for users who work in low-light environments.',
    issue_type: 'Feature Request',
    issue_title: 'Dark Mode Feature Request',
    status: 'new'
  },
  {
    name: 'Robert Chen',
    email: 'robert@example.com',
    mobile: '1112345678',
    description: 'The search functionality is not working properly. When I search for specific terms, it returns irrelevant results or no results at all.',
    issue_type: 'Technical Support',
    issue_title: 'Search Function Not Working',
    status: 'new'
  },
  {
    name: 'Emily Davis',
    email: 'emily@example.com',
    mobile: '9998765432',
    description: 'I need to cancel my subscription but cannot find the cancellation option in my account settings. Please help me with the cancellation process.',
    issue_type: 'Account Access',
    issue_title: 'Cannot Cancel Subscription',
    status: 'in_progress'
  }
];

const sampleReplies = [
  {
    ticket_id: 3,
    agent_name: 'Agent Smith',
    message: 'Thank you for your query. I can see that your premium subscription is active. Let me check the feature access settings for your account.'
  },
  {
    ticket_id: 3,
    agent_name: 'Agent Smith',
    message: 'I have refreshed your account permissions. Please try accessing the premium features now. If the issue persists, please let me know.'
  },
  {
    ticket_id: 4,
    agent_name: 'Agent Johnson',
    message: 'I have reset your password and sent a new login link to your email address. Please check your inbox and try logging in with the new credentials.'
  },
  {
    ticket_id: 5,
    agent_name: 'Agent Williams',
    message: 'Thank you for reporting this issue. I have identified the problem with the photo upload feature. Our development team is working on a fix.'
  },
  {
    ticket_id: 5,
    agent_name: 'Agent Williams',
    message: 'The fix has been deployed. Please update your app to the latest version and try uploading photos again. The issue should be resolved.'
  },
  {
    ticket_id: 8,
    agent_name: 'Agent Davis',
    message: 'I understand you want to cancel your subscription. I can help you with that. Please confirm if you want to cancel immediately or at the end of your current billing period.'
  }
];

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Clear existing data
    try {
      await pool.execute('DELETE FROM ticket_messages');
    } catch (e) { /* table may not exist */ }
    await pool.execute('DELETE FROM tickets');
    console.log('✅ Cleared existing data');
    
    // Insert sample tickets
    for (const ticket of sampleTickets) {
      const [result] = await pool.execute(
        `INSERT INTO tickets (name, email, mobile, description, issue_type, issue_title, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ticket.name, ticket.email, ticket.mobile, ticket.description, ticket.issue_type, ticket.issue_title, ticket.status]
      );
      console.log(`✅ Inserted ticket: ${ticket.issue_title}`);
    }
    
    // Insert sample messages into ticket_messages
    for (const reply of sampleReplies) {
      await pool.execute(
        `INSERT INTO ticket_messages (tenant_id, ticket_id, sender_type, sender_name, message, channel)
         VALUES (1, ?, 'agent', ?, ?, 'platform_chat')`,
        [reply.ticket_id, reply.agent_name, reply.message]
      );
      console.log(`✅ Inserted message for ticket ${reply.ticket_id}`);
    }

    console.log('🎉 Database seeding completed successfully!');
    console.log(`📊 Inserted ${sampleTickets.length} tickets and ${sampleReplies.length} messages`);

    // Show summary
    const [ticketCount] = await pool.execute('SELECT COUNT(*) as count FROM tickets');
    const [msgCount] = await pool.execute('SELECT COUNT(*) as count FROM ticket_messages');

    console.log(`📈 Current database state:`);
    console.log(`   - Tickets: ${ticketCount[0].count}`);
    console.log(`   - Messages: ${msgCount[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run the seeding
seedDatabase(); 