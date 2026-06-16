const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function testAgentPasswords() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testing Agent Passwords...');
    console.log('============================');
    
    // Get all agents
    const [agents] = await connection.execute('SELECT id, name, email, password_hash, is_active FROM agents');
    
    if (agents.length === 0) {
      console.log('⚠️ No agents found in database!');
      return;
    }
    
    console.log(`\n📝 Found ${agents.length} agents:`);
    
    for (const agent of agents) {
      console.log(`\n👤 ${agent.name} (ID: ${agent.id})`);
      console.log(`   📧 Email: ${agent.email || 'N/A'}`);
      console.log(`   ✅ Active: ${agent.is_active ? 'Yes' : 'No'}`);
      
      if (agent.password_hash) {
        console.log(`   🔐 Password hash: ${agent.password_hash.substring(0, 20)}...`);
        
        // Test common passwords
        const testPasswords = ['admin123', 'password', '123456', 'test123456'];
        
        for (const password of testPasswords) {
          try {
            const isValid = await bcrypt.compare(password, agent.password_hash);
            if (isValid) {
              console.log(`   🎯 Working password found: "${password}"`);
              break;
            }
          } catch (error) {
            console.log(`   ❌ Error testing password "${password}": ${error.message}`);
          }
        }
      } else {
        console.log(`   ❌ No password hash found`);
      }
    }
    
    // Test the exact login process
    console.log('\n🧪 Testing Exact Login Process:');
    console.log('===============================');
    
    const testCredentials = {
      name: 'admin',
      password: 'admin123'
    };
    
    console.log(`\n🔍 Testing with credentials: ${JSON.stringify(testCredentials)}`);
    
    // Step 1: Find agent by name or email
    const [foundAgents] = await connection.execute(
      'SELECT * FROM agents WHERE name = ? OR email = ?',
      [testCredentials.name, testCredentials.name]
    );
    
    console.log(`   📊 Found ${foundAgents.length} agents with name/email: ${testCredentials.name}`);
    
    if (foundAgents.length === 0) {
      console.log('   ❌ No agent found!');
      return;
    }
    
    const agent = foundAgents[0];
    console.log(`   ✅ Agent found: ID=${agent.id}, Name=${agent.name}, Active=${agent.is_active}`);
    
    // Step 2: Check if agent is active
    if (!agent.is_active) {
      console.log('   ❌ Agent is not active!');
      return;
    }
    
    // Step 3: Check password
    if (!agent.password_hash) {
      console.log('   ❌ No password hash found!');
      return;
    }
    
    const isValidPassword = await bcrypt.compare(testCredentials.password, agent.password_hash);
    console.log(`   🔐 Password validation: ${isValidPassword ? '✅ VALID' : '❌ INVALID'}`);
    
    if (!isValidPassword) {
      console.log('   ❌ Password is invalid!');
      console.log('   💡 This is why you\'re getting a 401 error.');
    } else {
      console.log('   ✅ Password is valid!');
      console.log('   🎯 Login should work with these credentials.');
    }
    
  } catch (error) {
    console.error('❌ Error testing agent passwords:', error.message);
  } finally {
    connection.release();
  }
}

testAgentPasswords().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
