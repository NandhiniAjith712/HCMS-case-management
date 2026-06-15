const { pool } = require('./database');

async function updateDatabase() {
  try {
    console.log('🔄 Updating database schema...');
    
    // Add new columns to products table
    await pool.execute(`
      ALTER TABLE products 
      ADD COLUMN modules TEXT AFTER description,
      ADD COLUMN issue_type VARCHAR(100) AFTER modules,
      ADD COLUMN template VARCHAR(500) AFTER issue_type
    `);
    
    console.log('✅ Successfully added new columns to products table');
    
    // Update existing products with default values
    await pool.execute(`
      UPDATE products SET modules = 'General' WHERE modules IS NULL
    `);
    
    await pool.execute(`
      UPDATE products SET issue_type = 'Technical Support' WHERE issue_type IS NULL
    `);
    
    console.log('✅ Successfully updated existing products with default values');
    
    console.log('🎉 Database update completed successfully!');
    
  } catch (error) {
    console.error('❌ Error updating database:', error);
    
    // Check if columns already exist
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ Columns already exist, skipping...');
    } else {
      console.error('❌ Database update failed:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

updateDatabase(); 