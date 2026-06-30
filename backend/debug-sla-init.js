require('dotenv').config({ path: require('path').resolve(__dirname, 'config.env') });
const { pool } = require('./modules/shared/database/database');

async function testSLAInit() {
  try {
    // Test with case ID 17 (HR Operations)
    const ticketId = 17;
    const category = 'HR Operations';
    const priority = 'medium';
    
    console.log(`Testing SLA initialization for ticket ${ticketId}, category: ${category}, priority: ${priority}\n`);
    
    // Find department ID by name
    const [departments] = await pool.execute(
      `SELECT id FROM departments WHERE name = ? LIMIT 1`,
      [category]
    );
    
    console.log(`Departments found for "${category}":`, departments);
    
    if (departments.length === 0) {
      console.log('No department found - checking all departments:');
      const [allDepts] = await pool.execute(`SELECT id, name FROM departments`);
      console.log(allDepts);
      return;
    }
    
    const departmentId = departments[0].id;
    console.log(`Department ID: ${departmentId}\n`);
    
    // Map priority to SLA priority_level
    const priorityMap = {
      'low': 'P3',
      'medium': 'P2',
      'high': 'P1',
      'urgent': 'P0',
      'critical': 'P0'
    };
    const slaPriority = priorityMap[priority] || 'P2';
    console.log(`SLA Priority: ${slaPriority}\n`);
    
    // Get SLA configuration
    const [slaConfigs] = await pool.execute(
      `SELECT id, response_time_minutes, resolution_time_minutes, escalation_warning_threshold_minutes, escalation_breach_threshold_minutes
       FROM sla_configurations
       WHERE department_id = ? AND priority_level = ? AND is_active = TRUE
       LIMIT 1`,
      [departmentId, slaPriority]
    );
    
    console.log(`SLA Configs found:`, slaConfigs);
    
    if (slaConfigs.length === 0) {
      console.log('No SLA configuration found');
      return;
    }
    
    const slaConfig = slaConfigs[0];
    const now = new Date();
    
    // Calculate thresholds
    const warningThreshold = slaConfig.escalation_warning_threshold_minutes || (slaConfig.response_time_minutes - 60);
    const breachThreshold = slaConfig.escalation_breach_threshold_minutes || slaConfig.resolution_time_minutes;
    
    console.log(`Warning threshold: ${warningThreshold}min`);
    console.log(`Breach threshold: ${breachThreshold}min\n`);
    
    // Create response timer
    const responseDeadline = new Date(now.getTime() + warningThreshold * 60000);
    await pool.execute(
      `INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
       VALUES (?, ?, 'response', ?, ?, 'active')`,
      [ticketId, slaConfig.id, now, responseDeadline]
    );
    console.log(`Created response timer with deadline: ${responseDeadline}`);
    
    // Create resolution timer
    const resolutionDeadline = new Date(now.getTime() + breachThreshold * 60000);
    await pool.execute(
      `INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
       VALUES (?, ?, 'resolution', ?, ?, 'active')`,
      [ticketId, slaConfig.id, now, resolutionDeadline]
    );
    console.log(`Created resolution timer with deadline: ${resolutionDeadline}`);
    
    console.log('\n✅ SLA timers created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testSLAInit();
