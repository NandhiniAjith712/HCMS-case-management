const TicketAssignmentService = require('./utils/ticketAssignment');

async function runRebalancing() {
  try {
    console.log('🔄 Running ticket assignment rebalancing...');
    const result = await TicketAssignmentService.rebalanceAssignments();
    console.log('✅ Rebalancing result:', result);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  process.exit(0);
}

runRebalancing();
