const { pool } = require('./database');

async function removeProductSLAColumns() {
  try {
    console.log('🔄 Removing unnecessary SLA columns from products table...');
    
    // Remove the columns that are now managed through separate tables
    await pool.execute(`
      ALTER TABLE products 
      DROP COLUMN modules,
      DROP COLUMN issue_type,
      DROP COLUMN template,
      DROP COLUMN sla_time_minutes,
      DROP COLUMN priority_level
    `);
    
    console.log('✅ Successfully removed SLA columns from products table');
    console.log('📋 Products table now only contains: id, name, description, status, created_by, created_at, updated_at');
    
  } catch (error) {
    console.error('❌ Error removing columns:', error);
    
    if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log('ℹ️ Some columns may not exist, checking current structure...');
      
      // Check current table structure
      const [columns] = await pool.execute('DESCRIBE products');
      console.log('📋 Current products table columns:');
      columns.forEach(col => {
        console.log(`  - ${col.Field} (${col.Type})`);
      });
    } else {
      console.error('❌ Failed to remove columns:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

removeProductSLAColumns(); 