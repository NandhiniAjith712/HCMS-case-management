const { pool } = require('./database');

async function addMissingSLA() {
  try {
    console.log('🔍 Adding missing SLA configuration for "Technical Support"...\n');
    
    // Check if "Technical Support" SLA config already exists
    const [existing] = await pool.execute(`
      SELECT * FROM sla_configurations 
      WHERE product_id = 33 AND module_id = 59 AND issue_name = 'Technical Support'
    `);
    
    if (existing.length > 0) {
      console.log('✅ SLA configuration for "Technical Support" already exists');
      console.log('   Response time:', existing[0].response_time_minutes, 'minutes');
      console.log('   Resolution time:', existing[0].resolution_time_minutes, 'minutes');
      console.log('   Priority:', existing[0].priority_level);
      return;
    }
    
    // Create SLA configuration for "Technical Support"
    const [result] = await pool.execute(`
      INSERT INTO sla_configurations (
        product_id, module_id, issue_name, issue_description,
        response_time_minutes, resolution_time_minutes, priority_level,
        is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, 1)
    `, [
      33, // GRC product ID
      59, // COMPILANCE module ID
      'Technical Support', // Exact issue type from ticket
      'Technical support and assistance requests',
      120, // 2 hours response time
      480, // 8 hours resolution time
      'P2' // Medium priority
    ]);
    
    console.log('✅ Created SLA configuration for "Technical Support"');
    console.log('   - Product: GRC (ID: 33)');
    console.log('   - Module: COMPILANCE (ID: 59)');
    console.log('   - Issue Type: Technical Support');
    console.log('   - Response Time: 2 hours');
    console.log('   - Resolution Time: 8 hours');
    console.log('   - Priority: P2');
    
    // Verify the configuration was created
    const [verify] = await pool.execute(`
      SELECT * FROM sla_configurations 
      WHERE product_id = 33 AND module_id = 59 AND issue_name = 'Technical Support'
    `);
    
    if (verify.length > 0) {
      console.log('\n✅ Verification successful! SLA configuration created with ID:', verify[0].id);
      
      // Now check if ticket #19 can find this configuration
      const [ticket] = await pool.execute(`
        SELECT t.*, sc.response_time_minutes, sc.priority_level
        FROM tickets t
        LEFT JOIN sla_configurations sc ON 
          t.product_id = sc.product_id AND 
          t.module_id = sc.module_id AND 
          t.issue_type = sc.issue_name
        WHERE t.id = 19
      `);
      
      if (ticket.length > 0 && ticket[0].response_time_minutes) {
        console.log('\n🎯 Ticket #19 now has SLA configuration!');
        console.log('   - Response time:', ticket[0].response_time_minutes, 'minutes');
        console.log('   - Priority:', ticket[0].priority_level);
        console.log('   - SLA timer should now work in frontend');
      } else {
        console.log('\n⚠️ Ticket #19 still cannot find SLA configuration');
      }
    }
    
  } catch (error) {
    console.error('❌ Error adding missing SLA:', error.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  addMissingSLA();
}

module.exports = { addMissingSLA };
