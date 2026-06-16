const { pool } = require('./database');
const bcrypt = require('bcryptjs');

const createTestAgent = async () => {
  try {
    const connection = await pool.getConnection();
    
    // Check if test agent already exists
    const [existingAgents] = await connection.execute(
      'SELECT id FROM agents WHERE name = ?',
      ['admin']
    );

    if (existingAgents.length > 0) {
      console.log('✅ Test agent already exists');
      connection.release();
      return;
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash('admin123', saltRounds);

    // Create test agent
    const [result] = await connection.execute(
      `INSERT INTO agents (name, email, password_hash, role, is_active) 
       VALUES (?, ?, ?, ?, ?)`,
      ['admin', 'admin@example.com', hashedPassword, 'support_agent', true]
    );

    console.log('✅ Test agent created successfully');
    console.log('👤 Name: admin');
    console.log('🔑 Password: admin123');
    
    connection.release();
  } catch (error) {
    console.error('❌ Error creating test agent:', error);
  }
};

createTestAgent();
