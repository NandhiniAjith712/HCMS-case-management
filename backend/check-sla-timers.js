const { pool } = require('./database');

async function checkSLATimers() {
  try {
    console.log('🔍 Checking SLA Timers...');
    
    // Check if sla_timers table exists
    const [tables] = await pool.execute('SHOW TABLES LIKE "sla_timers"');
    console.log('SLA Timers table exists:', tables.length > 0);
    
    if (tables.length > 0) {
      // Check count of SLA timers
      const [timers] = await pool.execute('SELECT COUNT(*) as count FROM sla_timers');
      console.log('SLA Timers count:', timers[0].count);
      
      if (timers[0].count > 0) {
        // Show sample timers
        const [sampleTimers] = await pool.execute(`
          SELECT st.*, t.id as ticket_id, t.issue_type, t.created_at as ticket_created
          FROM sla_timers st
          JOIN tickets t ON st.ticket_id = t.id
          LIMIT 3
        `);
        
        console.log('\n📋 Sample SLA Timers:');
        sampleTimers.forEach(timer => {
          console.log(`   Ticket ${timer.ticket_id}: ${timer.timer_type} timer`);
          console.log(`     Status: ${timer.status}, Deadline: ${timer.sla_deadline}`);
          console.log(`     Issue: ${timer.issue_type}`);
        });
      } else {
        console.log('⚠️ No SLA timers found - they need to be initialized');
      }
    } else {
      console.log('❌ SLA Timers table does not exist');
    }
    
  } catch (error) {
    console.error('❌ Error checking SLA timers:', error);
  } finally {
    await pool.end();
  }
}

checkSLATimers();
