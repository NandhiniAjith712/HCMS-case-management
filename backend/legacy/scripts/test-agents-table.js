const { pool } = require('./database');

async function testAgentsTable() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testing agents table...');
    
    // Check table structure
    const [columns] = await connection.execute('DESCRIBE agents');
    console.log('📋 Agents table structure:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Check existing agents
    const [agents] = await connection.execute('SELECT * FROM agents');
    console.log(`\n📝 Found ${agents.length} agents:`);
    agents.forEach(agent => {
      console.log(`  - ID: ${agent.id}, Name: ${agent.name}, Email: ${agent.email || 'N/A'}, Role: ${agent.role || 'N/A'}`);
    });
    
    // Test inserting a sample agent
    console.log('\n🧪 Testing agent insertion...');
    const testAgent = {
      name: 'Test Agent',
      email: 'test@example.com',
      password: 'test123456',
      role: 'support_agent',
      department: null,
      manager_id: null
    };
    
    const [result] = await connection.execute(
      `INSERT INTO agents (name, email, password_hash, role, department, manager_id, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [testAgent.name, testAgent.email, 'test_hash', testAgent.role, testAgent.department, testAgent.manager_id, true]
    );
    
    console.log('✅ Test agent inserted with ID:', result.insertId);
    
    // Clean up test agent
    await connection.execute('DELETE FROM agents WHERE id = ?', [result.insertId]);
    console.log('🧹 Test agent cleaned up');
    
  } catch (error) {
    console.error('❌ Error testing agents table:', error.message);
  } finally {
    connection.release();
  }
}

testAgentsTable().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
