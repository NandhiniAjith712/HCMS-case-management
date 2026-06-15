const { pool } = require('./database');

// Check and create sample SLA configurations
async function checkAndCreateSLAConfigs() {
  try {
    console.log('🔍 Checking SLA configurations in database...');
    
    // Check if SLA configurations exist
    const [existingConfigs] = await pool.execute(`
      SELECT COUNT(*) as count FROM sla_configurations
    `);
    
    console.log(`📊 Found ${existingConfigs[0].count} existing SLA configurations`);
    
    if (existingConfigs[0].count === 0) {
      console.log('⚠️ No SLA configurations found. Creating sample configurations...');
      
      // Get products and modules to create sample configs
      const [products] = await pool.execute('SELECT id, name FROM products WHERE status = \'active\' LIMIT 3');
      const [modules] = await pool.execute('SELECT id, name FROM modules WHERE status = \'active\' LIMIT 3');
      
      if (products.length === 0 || modules.length === 0) {
        console.log('❌ No products or modules found. Please create some first.');
        return;
      }
      
      // Create sample SLA configurations
      const sampleConfigs = [
        {
          product_id: products[0].id,
          module_id: modules[0].id,
          issue_name: 'Technical Issue',
          issue_description: 'General technical problems',
          response_time_minutes: 120, // 2 hours
          resolution_time_minutes: 480, // 8 hours
          priority_level: 'P2'
        },
        {
          product_id: products[0].id,
          module_id: modules[0].id,
          issue_name: 'Bug Report',
          issue_description: 'Software bugs and errors',
          response_time_minutes: 60, // 1 hour
          resolution_time_minutes: 240, // 4 hours
          priority_level: 'P1'
        },
        {
          product_id: products[0].id,
          module_id: modules[0].id,
          issue_name: 'Feature Request',
          issue_description: 'New feature requests',
          response_time_minutes: 240, // 4 hours
          resolution_time_minutes: 1440, // 24 hours
          priority_level: 'P3'
        }
      ];
      
      for (const config of sampleConfigs) {
        try {
          await pool.execute(`
            INSERT INTO sla_configurations (
              product_id, module_id, issue_name, issue_description, 
              response_time_minutes, resolution_time_minutes, priority_level, 
              is_active, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, 1)
          `, [
            config.product_id, config.module_id, config.issue_name, config.issue_description,
            config.response_time_minutes, config.resolution_time_minutes, config.priority_level
          ]);
          
          console.log(`✅ Created SLA config: ${config.issue_name} (${config.response_time_minutes}min response)`);
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') {
            console.log(`⚠️ SLA config already exists: ${config.issue_name}`);
          } else {
            console.error(`❌ Error creating SLA config ${config.issue_name}:`, error.message);
          }
        }
      }
      
      console.log('✅ Sample SLA configurations created successfully!');
      
    } else {
      // Show existing configurations
      const [configs] = await pool.execute(`
        SELECT sc.*, p.name as product_name, m.name as module_name
        FROM sla_configurations sc
        LEFT JOIN products p ON sc.product_id = p.id
        LEFT JOIN modules m ON sc.module_id = m.id
        ORDER BY p.name, m.name, sc.issue_name
      `);
      
      console.log('\n📋 Existing SLA Configurations:');
      configs.forEach(config => {
        console.log(`   - ${config.product_name} > ${config.module_name} > ${config.issue_name}`);
        console.log(`     Response: ${config.response_time_minutes}min, Resolution: ${config.resolution_time_minutes}min, Priority: ${config.priority_level}`);
        console.log(`     Status: ${config.is_active ? 'Active' : 'Inactive'}`);
        console.log('');
      });
    }
    
    // Check tickets and their SLA matching
    console.log('🔍 Checking tickets and SLA matching...');
    const [tickets] = await pool.execute(`
      SELECT t.id, t.product_id, t.module_id, t.issue_type, t.product, t.module,
             p.name as product_name, m.name as module_name
      FROM tickets t
      LEFT JOIN products p ON t.product_id = p.id
      LEFT JOIN modules m ON t.module_id = m.id
      LIMIT 5
    `);
    
    if (tickets.length > 0) {
      console.log('\n📋 Sample Tickets:');
      for (const ticket of tickets) {
        console.log(`   Ticket ${ticket.id}:`);
        console.log(`     Product: ${ticket.product_name || ticket.product} (ID: ${ticket.product_id})`);
        console.log(`     Module: ${ticket.module_name || ticket.module} (ID: ${ticket.module_id})`);
        console.log(`     Issue Type: ${ticket.issue_type}`);
        
        // Check if SLA config exists for this ticket
        if (ticket.product_id && ticket.module_id && ticket.issue_type) {
          const [matchingConfigs] = await pool.execute(`
            SELECT * FROM sla_configurations 
            WHERE product_id = ? AND module_id = ? AND issue_name = ? AND is_active = TRUE
          `, [ticket.product_id, ticket.module_id, ticket.issue_type]);
          
          if (matchingConfigs.length > 0) {
            console.log(`     ✅ SLA Config: ${matchingConfigs[0].response_time_minutes}min response`);
          } else {
            console.log(`     ❌ No SLA Config found`);
          }
        } else {
          console.log(`     ⚠️ Missing product_id, module_id, or issue_type`);
        }
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking SLA configurations:', error);
  } finally {
    await pool.end();
  }
}

// Run the check
if (require.main === module) {
  checkAndCreateSLAConfigs();
}

module.exports = { checkAndCreateSLAConfigs };
