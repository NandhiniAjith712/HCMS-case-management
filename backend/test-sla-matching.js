const { pool } = require('./database');

async function testSLAMatching() {
  try {
    console.log('🔍 Testing SLA Matching Logic...\n');
    
    // Get ticket 19
    const [tickets] = await pool.execute('SELECT * FROM tickets WHERE id = 19');
    if (tickets.length === 0) {
      console.log('❌ Ticket 19 not found');
      return;
    }
    
    const ticket = tickets[0];
    console.log('📋 Ticket 19 Data:');
    console.log(`   product_id: ${ticket.product_id}`);
    console.log(`   module_id: ${ticket.module_id}`);
    console.log(`   issue_type: "${ticket.issue_type}"`);
    console.log(`   product: "${ticket.product}"`);
    console.log(`   module: "${ticket.module}"`);
    
    // Get SLA configurations
    const [slaConfigs] = await pool.execute(`
      SELECT * FROM sla_configurations 
      WHERE product_id = ? AND module_id = ? AND issue_name = ?
    `, [ticket.product_id, ticket.module_id, ticket.issue_type]);
    
    console.log('\n🔍 SLA Configurations Found:', slaConfigs.length);
    
    if (slaConfigs.length > 0) {
      slaConfigs.forEach((config, index) => {
        console.log(`\n   Configuration ${index + 1}:`);
        console.log(`     id: ${config.id}`);
        console.log(`     product_id: ${config.product_id}`);
        console.log(`     module_id: ${config.module_id}`);
        console.log(`     issue_name: "${config.issue_name}"`);
        console.log(`     response_time_minutes: ${config.response_time_minutes}`);
        console.log(`     priority_level: ${config.priority_level}`);
      });
      
      // Test the key generation logic
      console.log('\n🔑 Testing Key Generation:');
      
      const ticketKey = `${ticket.product_id}_${ticket.module_id}_${ticket.issue_type}`;
      console.log(`   Ticket Key: "${ticketKey}"`);
      
      const configKey = `${slaConfigs[0].product_id}_${slaConfigs[0].module_id}_${slaConfigs[0].issue_name}`;
      console.log(`   Config Key: "${configKey}"`);
      
      console.log(`   Keys Match: ${ticketKey === configKey}`);
      
      if (ticketKey === configKey) {
        console.log('✅ Keys match perfectly!');
      } else {
        console.log('❌ Keys do not match!');
        console.log('   This explains why the frontend shows "No SLA Config"');
      }
      
    } else {
      console.log('❌ No SLA configurations found for this ticket');
    }
    
  } catch (error) {
    console.error('❌ Error testing SLA matching:', error);
  } finally {
    await pool.end();
  }
}

testSLAMatching();
