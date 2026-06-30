require('dotenv').config({ path: require('path').resolve(__dirname, 'config.env') });
const { pool } = require('./modules/shared/database/database');

async function check() {
  try {
    console.log('Checking SLA timers...\n');
    
    // Check all SLA timers
    const [timers] = await pool.execute(`
      SELECT st.id, st.ticket_id, st.timer_type, st.start_time, st.sla_deadline, st.status,
             c.title as ticket_title, c.category as ticket_category, c.status as ticket_status,
             sc.response_time_minutes, sc.resolution_time_minutes,
             d.name as department_name
      FROM sla_timers st
      JOIN sla_configurations sc ON st.sla_configuration_id = sc.id
      JOIN cases c ON st.ticket_id = c.id
      LEFT JOIN departments d ON sc.department_id = d.id
      ORDER BY st.created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${timers.length} SLA timers:\n`);
    timers.forEach(t => {
      console.log(`Timer ID: ${t.id}`);
      console.log(`  Ticket ID: ${t.ticket_id} - ${t.ticket_title}`);
      console.log(`  Ticket Category: ${t.ticket_category}`);
      console.log(`  Department: ${t.department_name}`);
      console.log(`  Timer Type: ${t.timer_type}`);
      console.log(`  Status: ${t.status}`);
      console.log(`  Start Time: ${t.start_time}`);
      console.log(`  Deadline: ${t.sla_deadline}`);
      console.log(`  Response Time: ${t.response_time_minutes}min`);
      console.log(`  Resolution Time: ${t.resolution_time_minutes}min`);
      console.log('');
    });
    
    // Check recent cases without SLA timers
    const [casesWithoutSLA] = await pool.execute(`
      SELECT c.id, c.title, c.category, c.priority, c.status, c.created_at
      FROM cases c
      LEFT JOIN sla_timers st ON c.id = st.ticket_id
      WHERE st.id IS NULL
      ORDER BY c.created_at DESC
      LIMIT 5
    `);
    
    console.log(`\nRecent cases without SLA timers (${casesWithoutSLA.length}):\n`);
    casesWithoutSLA.forEach(c => {
      console.log(`Case ID: ${c.id} - ${c.title}`);
      console.log(`  Category: ${c.category}`);
      console.log(`  Priority: ${c.priority}`);
      console.log(`  Status: ${c.status}`);
      console.log(`  Created: ${c.created_at}`);
      console.log('');
    });
    
    // Check SLA configurations
    const [slaConfigs] = await pool.execute(`
      SELECT sc.id, d.name as department_name, sc.priority_level, 
             sc.response_time_minutes, sc.resolution_time_minutes,
             sc.escalation_warning_threshold_minutes, sc.escalation_breach_threshold_minutes,
             sc.is_active
      FROM sla_configurations sc
      LEFT JOIN departments d ON sc.department_id = d.id
      ORDER BY d.name, sc.priority_level
    `);
    
    console.log(`\nSLA Configurations (${slaConfigs.length}):\n`);
    slaConfigs.forEach(sc => {
      console.log(`ID: ${sc.id} - ${sc.department_name} (${sc.priority_level})`);
      console.log(`  Response: ${sc.response_time_minutes}min, Resolution: ${sc.resolution_time_minutes}min`);
      console.log(`  Warning: ${sc.escalation_warning_threshold_minutes}min, Breach: ${sc.escalation_breach_threshold_minutes}min`);
      console.log(`  Active: ${sc.is_active}`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

check();
