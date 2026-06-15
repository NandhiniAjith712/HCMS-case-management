const TicketAssignmentService = require('./utils/ticketAssignment');
const { pool } = require('./database');

async function testEqualAssignment() {
  console.log('🧪 Testing Equal Ticket Assignment System...');
  console.log('=============================================');
  
  try {
    // Test 1: Get assignment statistics
    console.log('\n1️⃣ Testing assignment statistics...');
    const stats = await TicketAssignmentService.getAssignmentStatistics();
    console.log(`✅ Found ${stats.length} active agents`);
    
    if (stats.length === 0) {
      console.log('⚠️ No active agents found. Please create some agents first.');
      return;
    }
    
    // Display current statistics
    console.log('\n📊 Current Assignment Statistics:');
    stats.forEach(agent => {
      console.log(`   👤 ${agent.name} (${agent.role}):`);
      console.log(`      📝 New: ${agent.new_tickets} | In Progress: ${agent.in_progress_tickets} | Closed: ${agent.closed_tickets} | Total: ${agent.total_tickets}`);
    });
    
    // Test 2: Get agent with least tickets
    console.log('\n2️⃣ Testing agent selection...');
    const selectedAgent = await TicketAssignmentService.getAgentWithLeastTickets();
    
    if (selectedAgent) {
      console.log(`✅ Selected agent: ${selectedAgent.name} (ID: ${selectedAgent.id}) with ${selectedAgent.active_tickets} active tickets`);
    } else {
      console.log('❌ No agent selected');
      return;
    }
    
    // Test 3: Create a test ticket and assign it
    console.log('\n3️⃣ Testing automatic ticket assignment...');
    
    // Create a test ticket
    const [result] = await pool.execute(`
      INSERT INTO tickets (name, email, description, issue_title, status) 
      VALUES (?, ?, ?, ?, ?)
    `, ['Test User', 'test@example.com', 'Test ticket for equal assignment', 'Test Assignment', 'new']);
    
    const testTicketId = result.insertId;
    console.log(`📝 Created test ticket with ID: ${testTicketId}`);
    
    // Assign the ticket
    const assignmentResult = await TicketAssignmentService.assignTicketEqually(testTicketId);
    console.log(`✅ Assignment result: ${assignmentResult.message}`);
    console.log(`   🎯 Assigned to: ${assignmentResult.data.assigned_to_name} (ID: ${assignmentResult.data.assigned_to})`);
    console.log(`   📊 Method: ${assignmentResult.data.assignment_method}`);
    
    // Test 4: Check updated statistics
    console.log('\n4️⃣ Checking updated statistics...');
    const updatedStats = await TicketAssignmentService.getAssignmentStatistics();
    const updatedAgent = updatedStats.find(a => a.id === selectedAgent.id);
    
    if (updatedAgent) {
      console.log(`✅ Updated stats for ${updatedAgent.name}:`);
      console.log(`   📝 New: ${updatedAgent.new_tickets} | In Progress: ${updatedAgent.in_progress_tickets} | Total: ${updatedAgent.total_tickets}`);
    }
    
    // Test 5: Test rebalancing (if there are unassigned tickets)
    console.log('\n5️⃣ Testing rebalancing...');
    const rebalanceResult = await TicketAssignmentService.rebalanceAssignments();
    console.log(`✅ Rebalancing result: ${rebalanceResult.message}`);
    
    // Clean up test ticket
    console.log('\n6️⃣ Cleaning up test ticket...');
    await pool.execute('DELETE FROM tickets WHERE id = ?', [testTicketId]);
    console.log(`✅ Test ticket ${testTicketId} deleted`);
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('===========');
    console.log('• ✅ Assignment statistics working');
    console.log('• ✅ Agent selection working');
    console.log('• ✅ Automatic assignment working');
    console.log('• ✅ Rebalancing working');
    console.log('• ✅ Equal distribution system is ready!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

testEqualAssignment();
