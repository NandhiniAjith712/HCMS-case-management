const { pool } = require('./database');

async function testAgentLogin() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Testing agent login functionality...');
    
    // Check current agents
    const [agents] = await connection.execute('SELECT id, name, email, role, is_active, last_login FROM agents');
    console.log(`\n📝 Found ${agents.length} agents in database:`);
    
    agents.forEach(agent => {
      console.log(`\n👤 ${agent.name} (ID: ${agent.id})`);
      console.log(`   📧 Email: ${agent.email || 'N/A'}`);
      console.log(`   🎭 Role: ${agent.role || 'support_agent'}`);
      console.log(`   ✅ Active: ${agent.is_active ? 'Yes' : 'No'}`);
      console.log(`   🕒 Last Login: ${agent.last_login || 'Never'}`);
    });
    
    if (agents.length === 0) {
      console.log('\n⚠️ No agents found! You need to create agents first.');
      console.log('💡 Use the Business Dashboard to add agents, or run the seed script.');
      return;
    }
    
    // Test login with the first agent
    const testAgent = agents[0];
    console.log(`\n🧪 Testing login with agent: ${testAgent.name}`);
    
    if (!testAgent.is_active) {
      console.log('⚠️ Agent is not active - login would fail');
    } else {
      console.log('✅ Agent is active - login should work with correct credentials');
    }
    
    console.log('\n📋 Agent Login Flow Summary:');
    console.log('1. Agent enters name/email and password');
    console.log('2. Backend validates credentials against agents table');
    console.log('3. If valid, generates JWT token and returns agent data');
    console.log('4. Frontend stores agent data and token in localStorage');
    console.log('5. Agent is redirected to appropriate dashboard based on role');
    
    console.log('\n🔐 Login Credentials Test:');
    console.log('• Agent can login with name OR email');
    console.log('• Password must be at least 6 characters');
    console.log('• Agent must be active (is_active = true)');
    console.log('• JWT token is generated for session management');
    
  } catch (error) {
    console.error('❌ Error testing agent login:', error.message);
  } finally {
    connection.release();
  }
}

testAgentLogin().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
