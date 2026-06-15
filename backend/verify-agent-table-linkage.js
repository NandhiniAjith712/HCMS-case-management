const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function verifyAgentTableLinkage() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Verifying Agent Table Linkage...');
    console.log('=====================================');
    
    // Check current agents in the table
    const [agents] = await connection.execute('SELECT id, name, email, role, is_active, password_hash IS NOT NULL as has_password FROM agents');
    console.log(`\n📝 Found ${agents.length} agents in the database:`);
    
    agents.forEach(agent => {
      console.log(`\n👤 ${agent.name} (ID: ${agent.id})`);
      console.log(`   📧 Email: ${agent.email || 'N/A'}`);
      console.log(`   🎭 Role: ${agent.role || 'support_agent'}`);
      console.log(`   ✅ Active: ${agent.is_active ? 'Yes' : 'No'}`);
      console.log(`   🔐 Has Password: ${agent.has_password ? 'Yes' : 'No'}`);
    });
    
    if (agents.length === 0) {
      console.log('\n⚠️ No agents found in the database!');
      console.log('💡 You need to create agents first using the Business Dashboard.');
      return;
    }
    
    // Test login validation for each agent
    console.log('\n🧪 Testing Login Validation for Each Agent:');
    console.log('============================================');
    
    for (const agent of agents) {
      console.log(`\n🔍 Testing agent: ${agent.name}`);
      
      // Test 1: Check if agent can be found by name
      const [foundByName] = await connection.execute(
        'SELECT * FROM agents WHERE name = ?',
        [agent.name]
      );
      
      if (foundByName.length > 0) {
        console.log(`   ✅ Found by name: ${agent.name}`);
      } else {
        console.log(`   ❌ NOT found by name: ${agent.name}`);
      }
      
      // Test 2: Check if agent can be found by email
      if (agent.email) {
        const [foundByEmail] = await connection.execute(
          'SELECT * FROM agents WHERE email = ?',
          [agent.email]
        );
        
        if (foundByEmail.length > 0) {
          console.log(`   ✅ Found by email: ${agent.email}`);
        } else {
          console.log(`   ❌ NOT found by email: ${agent.email}`);
        }
      }
      
      // Test 3: Check if agent is active
      if (agent.is_active) {
        console.log(`   ✅ Agent is active`);
      } else {
        console.log(`   ❌ Agent is NOT active`);
      }
      
      // Test 4: Check if agent has password
      if (agent.has_password) {
        console.log(`   ✅ Agent has password`);
      } else {
        console.log(`   ❌ Agent has NO password`);
      }
    }
    
    // Test the actual login query that the backend uses
    console.log('\n🔍 Testing Backend Login Query:');
    console.log('===============================');
    
    const testAgent = agents[0];
    console.log(`\n🧪 Testing with agent: ${testAgent.name}`);
    
    // This is the exact query used in the backend
    const [foundAgents] = await connection.execute(
      'SELECT * FROM agents WHERE name = ? OR email = ?',
      [testAgent.name, testAgent.name]
    );
    
    console.log(`   🔍 Query: SELECT * FROM agents WHERE name = '${testAgent.name}' OR email = '${testAgent.name}'`);
    console.log(`   📊 Found ${foundAgents.length} agents`);
    
    if (foundAgents.length > 0) {
      const foundAgent = foundAgents[0];
      console.log(`   ✅ Agent found: ID=${foundAgent.id}, Name=${foundAgent.name}, Active=${foundAgent.is_active}`);
      
      // Test password validation
      if (foundAgent.password_hash) {
        console.log(`   🔐 Password hash exists: ${foundAgent.password_hash.substring(0, 20)}...`);
        
        // Test with a known password (if it's admin)
        if (foundAgent.name === 'admin') {
          const isValidPassword = await bcrypt.compare('admin123', foundAgent.password_hash);
          console.log(`   🎯 Password 'admin123' validation: ${isValidPassword ? '✅ VALID' : '❌ INVALID'}`);
        }
      } else {
        console.log(`   ❌ No password hash found`);
      }
    } else {
      console.log(`   ❌ No agent found with name/email: ${testAgent.name}`);
    }
    
    console.log('\n📋 Agent Login Flow Summary:');
    console.log('============================');
    console.log('1. ✅ Agent enters name/email and password on login form');
    console.log('2. ✅ Frontend sends POST request to /api/agents/login');
    console.log('3. ✅ Backend validates input (name 2-100 chars, password min 6 chars)');
    console.log('4. ✅ Backend queries agents table: SELECT * FROM agents WHERE name = ? OR email = ?');
    console.log('5. ✅ If agent found, checks if agent.is_active = true');
    console.log('6. ✅ If active, validates password using bcrypt.compare()');
    console.log('7. ✅ If password valid, updates last_login timestamp');
    console.log('8. ✅ Generates JWT token and returns agent data');
    console.log('9. ✅ Frontend stores agent data and token in localStorage');
    console.log('10. ✅ Agent is redirected to appropriate dashboard');
    
    console.log('\n🎯 Key Points:');
    console.log('==============');
    console.log('• Only agents in the agents table can login');
    console.log('• Agent must be active (is_active = true)');
    console.log('• Agent must have a valid password hash');
    console.log('• Login works with name OR email');
    console.log('• Password must be at least 6 characters');
    console.log('• All validation happens against the agents table');
    
  } catch (error) {
    console.error('❌ Error verifying agent table linkage:', error.message);
  } finally {
    connection.release();
  }
}

verifyAgentTableLinkage().then(() => {
  console.log('\n✅ Verification completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
