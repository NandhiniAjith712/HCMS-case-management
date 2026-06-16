const { pool } = require('./database');

async function checkTableStructure() {
  try {
    console.log('🔍 Checking table structure...');
    
    // Check sla_configurations table structure
    const [columns] = await pool.execute(`
      DESCRIBE sla_configurations
    `);
    
    console.log('📋 SLA Configurations table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    
  } catch (error) {
    console.error('❌ Error checking table structure:', error);
  } finally {
    process.exit(0);
  }
}

checkTableStructure(); 