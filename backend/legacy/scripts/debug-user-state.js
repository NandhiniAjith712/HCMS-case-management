const axios = require('axios');

async function debugUserState() {
  try {
    console.log('🔍 Debugging User State and Ticket Associations...\n');
    
    // 1. Check all users
    console.log('1️⃣ Checking all users...');
    const usersResponse = await axios.get('http://localhost:5000/api/users');
    const users = usersResponse.data.data;
    console.log(`✅ Found ${users.length} users`);
    
    // Show users with 'user' role
    const regularUsers = users.filter(u => u.role === 'user');
    console.log(`📋 Regular users (role='user'): ${regularUsers.length}`);
    regularUsers.forEach(user => {
      console.log(`   - ID: ${user.id}, Email: ${user.email}, Name: ${user.name || 'N/A'}`);
    });
    
    // 2. Check ticket distribution
    console.log('\n2️⃣ Checking ticket distribution...');
    const ticketsResponse = await axios.get('http://localhost:5000/api/tickets');
    const allTickets = ticketsResponse.data.data;
    console.log(`✅ Total tickets: ${allTickets.length}`);
    
    // Count tickets by user_id
    const ticketsByUser = {};
    allTickets.forEach(ticket => {
      const userId = ticket.user_id;
      if (!ticketsByUser[userId]) {
        ticketsByUser[userId] = [];
      }
      ticketsByUser[userId].push(ticket);
    });
    
    console.log('📊 Tickets per user:');
    Object.keys(ticketsByUser).forEach(userId => {
      const user = users.find(u => u.id == userId);
      const email = user ? user.email : 'Unknown';
      console.log(`   - User ${userId} (${email}): ${ticketsByUser[userId].length} tickets`);
    });
    
    // 3. Test specific user tickets
    if (regularUsers.length > 0) {
      const testUser = regularUsers[0];
      console.log(`\n3️⃣ Testing tickets for user: ${testUser.email} (ID: ${testUser.id})`);
      
      const userTicketsResponse = await axios.get(`http://localhost:5000/api/tickets/user/${testUser.id}`);
      const userTickets = userTicketsResponse.data.data;
      console.log(`✅ User tickets: ${userTickets.length}`);
      
      if (userTickets.length > 0) {
        console.log('📋 Sample user tickets:');
        userTickets.slice(0, 3).forEach(ticket => {
          console.log(`   - Ticket #${ticket.id}: ${ticket.issue_title} (${ticket.status})`);
        });
      }
    }
    
    // 4. Check for tickets without user_id
    const ticketsWithoutUser = allTickets.filter(t => t.user_id === null);
    console.log(`\n4️⃣ Tickets without user_id: ${ticketsWithoutUser.length}`);
    
    if (ticketsWithoutUser.length > 0) {
      console.log('⚠️ Found tickets without user associations:');
      ticketsWithoutUser.slice(0, 5).forEach(ticket => {
        console.log(`   - Ticket #${ticket.id}: ${ticket.email} - ${ticket.issue_title}`);
      });
    }
    
    console.log('\n🎯 Debug Summary:');
    console.log(`- Total users: ${users.length}`);
    console.log(`- Regular users: ${regularUsers.length}`);
    console.log(`- Total tickets: ${allTickets.length}`);
    console.log(`- Tickets with user_id: ${allTickets.length - ticketsWithoutUser.length}`);
    console.log(`- Tickets without user_id: ${ticketsWithoutUser.length}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

debugUserState(); 