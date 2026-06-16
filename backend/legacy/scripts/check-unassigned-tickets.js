const { pool } = require('./database');

async function checkUnassignedTickets() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Checking for unassigned tickets...');
    
    // Check unassigned tickets
    const [unassignedTickets] = await connection.execute(`
      SELECT id, name, email, status, assigned_to, created_at 
      FROM tickets 
      WHERE assigned_to IS NULL AND status IN ('new', 'in_progress')
      ORDER BY created_at ASC
    `);
    
    console.log(`📋 Found ${unassignedTickets.length} unassigned tickets:`);
    unassignedTickets.forEach(ticket => {
      console.log(`  - ID: ${ticket.id}, Name: ${ticket.name}, Status: ${ticket.status}, Created: ${ticket.created_at}`);
    });
    
    if (unassignedTickets.length > 0) {
      console.log('\n🔄 Running ticket assignment rebalancing...');
      const TicketAssignmentService = require('./utils/ticketAssignment');
      const result = await TicketAssignmentService.rebalanceAssignments();
      console.log('✅ Rebalancing result:', result);
    } else {
      console.log('✅ No unassigned tickets found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

checkUnassignedTickets();
