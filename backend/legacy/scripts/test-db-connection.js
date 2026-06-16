const mysql = require('mysql2/promise');
require('dotenv').config({ path: './config.env' });

async function testDatabaseConnection() {
  try {
    console.log('🔍 Testing database connection...');
    console.log('🔍 DB_HOST:', process.env.DB_HOST);
    console.log('🔍 DB_USER:', process.env.DB_USER);
    console.log('🔍 DB_NAME:', process.env.DB_NAME);
    
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful!');
    
    // Test if tickets table exists
    const [tables] = await connection.execute("SHOW TABLES LIKE 'tickets'");
    if (tables.length > 0) {
      console.log('✅ Tickets table exists');
      
      // Test if resolution_time column exists
      const [columns] = await connection.execute("SHOW COLUMNS FROM tickets LIKE 'resolution_time'");
      if (columns.length > 0) {
        console.log('✅ resolution_time column exists');
      } else {
        console.log('❌ resolution_time column does NOT exist');
      }
      
      // Test basic query
      const [tickets] = await connection.execute("SELECT COUNT(*) as count FROM tickets");
      console.log(`📊 Total tickets in database: ${tickets[0].count}`);
      
    } else {
      console.log('❌ Tickets table does NOT exist');
    }
    
    connection.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
}

testDatabaseConnection()
  .then(() => {
    console.log('✅ Database test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  });
