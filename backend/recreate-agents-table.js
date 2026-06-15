const { pool } = require('./database');

const recreateAgentsTable = async () => {
  try {
    const connection = await pool.getConnection();
    
    console.log('🔄 Dropping existing agents table...');
    
    // Drop existing agents table and related tables
    await connection.execute('DROP TABLE IF EXISTS agent_sessions');
    await connection.execute('DROP TABLE IF EXISTS ticket_assignments');
    await connection.execute('DROP TABLE IF EXISTS agents');
    
    console.log('✅ Dropped existing agents table');
    
    // Create new simplified agents table
    console.log('🔄 Creating new simplified agents table...');
    
    await connection.execute(`
      CREATE TABLE agents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      )
    `);
    
    console.log('✅ Created new agents table with only name and password');
    
    connection.release();
  } catch (error) {
    console.error('❌ Error recreating agents table:', error);
  }
};

recreateAgentsTable();
