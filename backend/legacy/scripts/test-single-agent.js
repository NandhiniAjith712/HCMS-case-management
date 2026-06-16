const TicketAssignmentService = require('./utils/ticketAssignment');

async function testSingleAgent() {
  try {
    console.log('🧪 Testing ticket assignment with single support executive...');
    
    // Test 1: Get agent with least tickets
    console.log('\n📋 Test 1: Getting agent with least tickets...');
    const agent = await TicketAssignmentService.getAgentWithLeastTickets();
    
    if (agent) {
      console.log('✅ Found agent:', agent);
      
      // Test 2: Get assignment statistics
      console.log('\n📊 Test 2: Getting assignment statistics...');
      const stats = await TicketAssignmentService.getAssignmentStatistics();
      console.log('✅ Assignment statistics:', stats);
      
      // Test 3: Try to assign a ticket
      console.log('\n🎯 Test 3: Testing ticket assignment...');
      
      // Find an unassigned ticket
      const { pool } = require('./database');
      const connection = await pool.getConnection();
      
      try {
        const [unassignedTickets] = await connection.execute(`
          SELECT id, name, email, status 
          FROM tickets 
          WHERE assigned_to IS NULL AND status IN ('new', 'in_progress')
          LIMIT 1
        `);
        
        if (unassignedTickets.length > 0) {
          const ticket = unassignedTickets[0];
          console.log(`📋 Found unassigned ticket: ID ${ticket.id} - ${ticket.name}`);
          
          const result = await TicketAssignmentService.assignTicketEqually(ticket.id);
          console.log('✅ Assignment result:', result);
        } else {
          console.log('✅ No unassigned tickets found');
        }
        
      } finally {
        connection.release();
      }
      
    } else {
      console.log('❌ No agent found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

testSingleAgent();
