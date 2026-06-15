const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function testActualLogin() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testing actual login process...');
    
    // Test credentials
    const testCredentials = {
      name: 'admin',
      password: 'admin123'
    };
    
    console.log('📝 Testing with credentials:', testCredentials);
    
    // Step 1: Find agent by name or email
    const [agents] = await connection.execute(
      'SELECT * FROM agents WHERE name = ? OR email = ?',
      [testCredentials.name, testCredentials.name]
    );
    
    console.log(`🔍 Found ${agents.length} agents with name/email: ${testCredentials.name}`);
    
    if (agents.length === 0) {
      console.log('❌ No agent found!');
      return;
    }
    
    const agent = agents[0];
    console.log(`👤 Agent found: ID=${agent.id}, Name=${agent.name}, Email=${agent.email}, Active=${agent.is_active}`);
    
    // Step 2: Check if agent is active
    if (!agent.is_active) {
      console.log('❌ Agent is not active!');
      return;
    }
    
    // Step 3: Check password
    console.log('🔐 Checking password...');
    const isValidPassword = await bcrypt.compare(testCredentials.password, agent.password_hash);
    console.log(`Password validation: ${isValidPassword ? '✅ VALID' : '❌ INVALID'}`);
    
    if (!isValidPassword) {
      console.log('❌ Invalid password!');
      return;
    }
    
    // Step 4: Update last login
    await connection.execute(
      'UPDATE agents SET last_login = NOW() WHERE id = ?',
      [agent.id]
    );
    console.log('✅ Last login updated');
    
    // Step 5: Generate token (simulate)
    console.log('🎫 Token generation (simulated)');
    
    // Step 6: Return agent data
    const agentData = {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role || 'support_agent',
      department: agent.department,
      manager_id: agent.manager_id,
      is_active: agent.is_active,
      last_login: agent.last_login
    };
    
    console.log('✅ Login successful!');
    console.log('📊 Agent data:', agentData);
    
  } catch (error) {
    console.error('❌ Error testing actual login:', error.message);
  } finally {
    connection.release();
  }
}

testActualLogin().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
