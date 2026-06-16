const { pool } = require('./database');

async function createSLATimer() {
  try {
    console.log('🔍 Creating SLA timer for ticket 19...');
    
    // Get the SLA configuration for Technical Support
    const [slaConfigs] = await pool.execute(`
      SELECT * FROM sla_configurations 
      WHERE product_id = 33 AND module_id = 59 AND issue_name = 'Technical Support'
    `);
    
    if (slaConfigs.length === 0) {
      console.log('❌ No SLA configuration found for Technical Support');
      return;
    }
    
    const slaConfig = slaConfigs[0];
    console.log('✅ Found SLA config:', slaConfig.response_time_minutes, 'min response');
    
    // Get ticket 19
    const [tickets] = await pool.execute('SELECT * FROM tickets WHERE id = 19');
    if (tickets.length === 0) {
      console.log('❌ Ticket 19 not found');
      return;
    }
    
    const ticket = tickets[0];
    console.log('✅ Found ticket 19, created at:', ticket.created_at);
    
    // Create response timer
    const ticketCreatedAt = new Date(ticket.created_at);
    const responseDeadline = new Date(ticketCreatedAt.getTime() + (slaConfig.response_time_minutes * 60 * 1000));
    
    const [result] = await pool.execute(`
      INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
      VALUES (?, ?, 'response', ?, ?, 'active')
    `, [ticket.id, slaConfig.id, ticketCreatedAt, responseDeadline]);
    
    console.log('✅ Response timer created with ID:', result.insertId);
    console.log('   Start time:', ticketCreatedAt);
    console.log('   Deadline:', responseDeadline);
    console.log('   Status: active');
    
    // Create resolution timer
    const resolutionDeadline = new Date(ticketCreatedAt.getTime() + (slaConfig.resolution_time_minutes * 60 * 1000));
    
    const [result2] = await pool.execute(`
      INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
      VALUES (?, ?, 'resolution', ?, ?, 'active')
    `, [ticket.id, slaConfig.id, ticketCreatedAt, resolutionDeadline]);
    
    console.log('✅ Resolution timer created with ID:', result2.insertId);
    console.log('   Start time:', ticketCreatedAt);
    console.log('   Deadline:', resolutionDeadline);
    console.log('   Status: active');
    
    console.log('\n🎉 SLA timers created successfully for ticket 19!');
    
  } catch (error) {
    console.error('❌ Error creating SLA timer:', error);
  } finally {
    await pool.end();
  }
}

createSLATimer();
