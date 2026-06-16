const TicketAssignmentService = require('./utils/ticketAssignment');

async function testSimplifiedAssignment() {
  try {
    console.log('🧪 Testing simplified ticket assignment system...');
    console.log('==============================================');
    
    // Test 1: Get the single support executive
    console.log('\n📋 Test 1: Getting single support executive (sri)...');
    const agent = await TicketAssignmentService.getAgentWithLeastTickets();
    
    if (agent) {
      console.log('✅ Found support executive:', agent);
      
      // Test 2: Get assignment statistics
      console.log('\n📊 Test 2: Getting assignment statistics...');
      const stats = await TicketAssignmentService.getAssignmentStatistics();
      console.log('✅ Assignment statistics:', stats);
      
      // Test 3: Check for unassigned tickets
      console.log('\n🔍 Test 3: Checking for unassigned tickets...');
      const { pool } = require('./database');
      const connection = await pool.getConnection();
      
      try {
        const [unassignedTickets] = await connection.execute(`
          SELECT id, name, email, status 
          FROM tickets 
          WHERE assigned_to IS NULL AND status IN ('new', 'in_progress')
          LIMIT 5
        `);
        
        if (unassignedTickets.length > 0) {
          console.log(`📋 Found ${unassignedTickets.length} unassigned tickets:`);
          unassignedTickets.forEach(ticket => {
            console.log(`  - ID: ${ticket.id}, Name: ${ticket.name}, Status: ${ticket.status}`);
          });
          
          // Test 4: Assign the first unassigned ticket
          console.log('\n🎯 Test 4: Assigning first unassigned ticket...');
          const ticket = unassignedTickets[0];
          const result = await TicketAssignmentService.assignTicketEqually(ticket.id);
          console.log('✅ Assignment result:', result);
          
        } else {
          console.log('✅ No unassigned tickets found');
        }
        
      } finally {
        connection.release();
      }
      
    } else {
      console.log('❌ No support executive found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

testSimplifiedAssignment();
