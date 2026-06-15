const { pool } = require('./database');

// Initialize SLA timers for existing tickets
async function initializeSLATimers() {
  try {
    console.log('🚀 Starting SLA timer initialization for existing tickets...');
    
    // Get all tickets that don't have SLA timers
    const [ticketsWithoutTimers] = await pool.execute(`
      SELECT DISTINCT t.*, p.name as product_name, m.name as module_name
      FROM tickets t
      LEFT JOIN products p ON t.product_id = p.id
      LEFT JOIN modules m ON t.module_id = m.id
      LEFT JOIN sla_timers st ON t.id = st.ticket_id
      WHERE st.id IS NULL 
      AND t.status IN ('new', 'in_progress')
      ORDER BY t.created_at ASC
    `);
    
    if (ticketsWithoutTimers.length === 0) {
      console.log('✅ All tickets already have SLA timers');
      return;
    }
    
    console.log(`📋 Found ${ticketsWithoutTimers.length} tickets without SLA timers`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const ticket of ticketsWithoutTimers) {
      try {
        console.log(`🕐 Processing ticket ${ticket.id}: ${ticket.issue_title || ticket.name}`);
        
        // Find SLA configuration for this ticket
        let slaConfiguration = null;
        
        if (ticket.module_id) {
          const [slaConfigs] = await pool.execute(`
            SELECT * FROM sla_configurations 
            WHERE module_id = ? AND is_active = TRUE 
            ORDER BY priority_level ASC LIMIT 1
          `, [ticket.module_id]);
          
          if (slaConfigs.length > 0) {
            slaConfiguration = slaConfigs[0];
            console.log(`   ✅ Found SLA config: ${slaConfiguration.response_time_minutes}min response`);
          }
        }
        
        if (slaConfiguration) {
          // Create SLA timers based on configuration
          const now = new Date();
          const ticketCreatedAt = new Date(ticket.created_at);
          
          // Response timer
          const responseDeadline = new Date(ticketCreatedAt.getTime() + (slaConfiguration.response_time_minutes * 60 * 1000));
          
          await pool.execute(`
            INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
            VALUES (?, ?, 'response', ?, ?, 'active')
          `, [ticket.id, slaConfiguration.id, ticketCreatedAt, responseDeadline]);
          
          // Resolution timer
          const resolutionDeadline = new Date(ticketCreatedAt.getTime() + (slaConfiguration.resolution_time_minutes * 60 * 1000));
          
          await pool.execute(`
            INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
            VALUES (?, ?, 'resolution', ?, ?, 'active')
          `, [ticket.id, slaConfiguration.id, ticketCreatedAt, resolutionDeadline]);
          
          // Escalation timer if configured
          if (slaConfiguration.escalation_time_minutes) {
            const escalationDeadline = new Date(ticketCreatedAt.getTime() + (slaConfiguration.escalation_time_minutes * 60 * 1000));
            
            await pool.execute(`
              INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
              VALUES (?, ?, 'escalation', ?, ?, 'active')
            `, [ticket.id, slaConfiguration.id, ticketCreatedAt, escalationDeadline]);
          }
          
          successCount++;
          console.log(`   ✅ SLA timers created for ticket ${ticket.id}`);
          
        } else {
          // Create default SLA timer with 8-hour response time
          console.log(`   ⚠️ No SLA config found, creating default timer for ticket ${ticket.id}`);
          
          // Create default SLA configuration
          const [defaultSlaResult] = await pool.execute(`
            INSERT INTO sla_configurations (product_id, module_id, issue_name, response_time_minutes, resolution_time_minutes, priority_level, is_active)
            VALUES (?, ?, ?, 480, 1440, 'P2', TRUE)
          `, [ticket.product_id || 1, ticket.module_id || 1, ticket.issue_type || 'default']);
          
          const defaultSlaId = defaultSlaResult.insertId;
          const ticketCreatedAt = new Date(ticket.created_at);
          const defaultDeadline = new Date(ticketCreatedAt.getTime() + (8 * 60 * 60 * 1000)); // 8 hours
          
          await pool.execute(`
            INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
            VALUES (?, ?, 'response', ?, ?, 'active')
          `, [ticket.id, defaultSlaId, ticketCreatedAt, defaultDeadline]);
          
          successCount++;
          console.log(`   ✅ Default SLA timer created for ticket ${ticket.id}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ticket ${ticket.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 SLA Timer Initialization Summary:');
    console.log(`✅ Successfully processed: ${successCount} tickets`);
    console.log(`❌ Errors: ${errorCount} tickets`);
    console.log(`📋 Total tickets processed: ${ticketsWithoutTimers.length}`);
    
    if (errorCount > 0) {
      console.log('\n💡 Some tickets failed to process. Check the logs above for details.');
    }
    
  } catch (error) {
    console.error('❌ Fatal error in SLA timer initialization:', error);
  } finally {
    await pool.end();
  }
}

// Run the initialization
if (require.main === module) {
  initializeSLATimers();
}

module.exports = { initializeSLATimers };
