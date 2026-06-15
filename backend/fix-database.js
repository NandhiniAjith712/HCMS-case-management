const mysql = require('mysql2/promise');
require('dotenv').config({ path: './config.env' });

async function fixDatabase() {
  let connection;
  
  try {
    console.log('🔧 Starting database fix for auto-login...');
    
    // Database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'tick_system',
      port: process.env.DB_PORT || 3306
    });
    
    console.log('✅ Connected to database');
    
    // Check current table structure
    console.log('📋 Checking current agents table structure...');
    const [describeResult] = await connection.execute('DESCRIBE agents');
    console.log('Current structure:', describeResult);
    
    // Fix password_hash field
    console.log('🔧 Fixing password_hash field...');
    await connection.execute('ALTER TABLE agents MODIFY COLUMN password_hash VARCHAR(255) DEFAULT NULL');
    console.log('✅ password_hash field fixed');
    
    // Fix phone field
    console.log('🔧 Fixing phone field...');
    await connection.execute('ALTER TABLE agents MODIFY COLUMN phone VARCHAR(20) DEFAULT NULL');
    console.log('✅ phone field fixed');
    
    // Fix role field
    console.log('🔧 Fixing role field...');
    await connection.execute('ALTER TABLE agents MODIFY COLUMN role VARCHAR(50) DEFAULT "user"');
    console.log('✅ role field fixed');
    
    // Update existing empty values
    console.log('🔧 Updating existing empty values...');
    await connection.execute('UPDATE agents SET password_hash = NULL WHERE password_hash = ""');
    console.log('✅ Empty password_hash values updated');
    
    // Verify the fixes
    console.log('🔍 Verifying fixes...');
    const [newStructure] = await connection.execute('DESCRIBE agents');
    console.log('New structure:', newStructure);
    
    // Check data
    const [agentCount] = await connection.execute('SELECT COUNT(*) as count FROM agents');
    const [nullPasswordCount] = await connection.execute('SELECT COUNT(*) as count FROM agents WHERE password_hash IS NULL');
    
    console.log('📊 Database stats:');
    console.log(`- Total agents: ${agentCount[0].count}`);
    console.log(`- Agents with NULL password_hash: ${nullPasswordCount[0].count}`);
    
    console.log('🎉 SUCCESS: Database fixed for auto-login!');
    console.log('✅ You can now test the auto-login again');
    
  } catch (error) {
    console.error(' Error fixing database:', error.message);
    
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('💡 Table "agents" does not exist. Creating it...');
      await createAgentsTable(connection);
    } else {
      console.log('💡 Trying alternative fix method...');
      try {
        await connection.execute('ALTER TABLE agents CHANGE COLUMN password_hash password_hash VARCHAR(255) DEFAULT NULL');
        console.log('✅ Alternative fix applied');
      } catch (altError) {
        console.error(' Alternative fix also failed:', altError.message);
      }
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

async function createAgentsTable(connection) {
  try {
    console.log('🏗️ Creating agents table...');
    
    const createTableSQL = `
      CREATE TABLE agents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) DEFAULT NULL,
        role VARCHAR(50) DEFAULT 'user',
        phone VARCHAR(20) DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      )
    `;
    
    await connection.execute(createTableSQL);
    console.log('✅ Agents table created successfully');
    
  } catch (error) {
    console.error('❌ Error creating table:', error.message);
  }
}

// Run the fix
fixDatabase().catch(console.error);
