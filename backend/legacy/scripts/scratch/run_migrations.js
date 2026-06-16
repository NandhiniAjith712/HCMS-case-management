const { initializeDatabase, pool } = require('../database');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../config.env') });

async function run() {
  console.log('🔄 Starting Database Schema Migrations...');
  try {
    await initializeDatabase();
    console.log('🎉 Database Schema Initialized Successfully!');
    
    // Verify columns exist
    const [cols] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('role', 'product_scope_id')
    `);
    console.log('📋 Verified columns in `users` table:');
    console.log(cols);
    
    // Verify mapping tables exist
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('organization_spoc_mapping', 'product_spoc_mapping')
    `);
    console.log('📋 Verified created mapping tables:');
    console.log(tables);
  } catch (error) {
    console.error('❌ Migration verification failed:', error);
  } finally {
    await pool.end();
    console.log('🔌 Connection closed.');
  }
}

run();
