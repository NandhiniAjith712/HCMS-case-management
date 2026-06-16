const { pool } = require('./database');

async function addModuleColumnsToTickets() {
  try {
    console.log('🔄 Adding module columns to tickets table...');
    
    // Add module columns to tickets table
    await pool.execute(`
      ALTER TABLE tickets 
      ADD COLUMN module VARCHAR(100) AFTER product,
      ADD COLUMN module_id INT AFTER module
    `);
    
    console.log('✅ Successfully added module columns to tickets table');
    console.log('📋 Tickets table now includes: module, module_id');
    
  } catch (error) {
    console.error('❌ Error adding module columns:', error);
    
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ Module columns already exist, skipping...');
    } else {
      console.error('❌ Failed to add module columns:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

addModuleColumnsToTickets(); 