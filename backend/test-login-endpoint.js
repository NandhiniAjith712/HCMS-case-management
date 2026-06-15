const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function testLoginEndpoint() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testing login endpoint...');
    
    // Get current agents
    const [agents] = await connection.execute('SELECT id, name, email, password_hash, role, is_active FROM agents');
    
    if (agents.length === 0) {
      console.log('⚠️ No agents found!');
      return;
    }
    
    // Test with the first agent
    const testAgent = agents[0];
    console.log(`\n🧪 Testing login with agent: ${testAgent.name}`);
    
    // Test different password scenarios
    const testPasswords = [
      'admin123',  // Common password
      'password',  // Common password
      '123456',    // Common password
      'test123456' // Test password
    ];
    
    for (const password of testPasswords) {
      try {
        const isValid = await bcrypt.compare(password, testAgent.password_hash);
        console.log(`Password "${password}": ${isValid ? '✅ VALID' : '❌ INVALID'}`);
        
        if (isValid) {
          console.log(`🎯 Found working password: ${password}`);
          console.log(`\n📋 Login Credentials:`);
          console.log(`   Name/Email: ${testAgent.name} or ${testAgent.email}`);
          console.log(`   Password: ${password}`);
          break;
        }
      } catch (error) {
        console.log(`Password "${password}": ❌ ERROR - ${error.message}`);
      }
    }
    
    // Test the actual login query
    console.log('\n🔍 Testing login query...');
    const [foundAgents] = await connection.execute(
      'SELECT * FROM agents WHERE name = ? OR email = ?',
      [testAgent.name, testAgent.name]
    );
    
    console.log(`Found ${foundAgents.length} agents with name/email: ${testAgent.name}`);
    
    if (foundAgents.length > 0) {
      const agent = foundAgents[0];
      console.log(`Agent details: ID=${agent.id}, Name=${agent.name}, Email=${agent.email}, Active=${agent.is_active}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing login endpoint:', error.message);
  } finally {
    connection.release();
  }
}

testLoginEndpoint().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
