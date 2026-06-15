const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function debugAgentLogin() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Debugging agent login...');
    
    // Check current agents
    const [agents] = await connection.execute('SELECT id, name, email, password_hash, role, is_active FROM agents');
    console.log(`\n📝 Found ${agents.length} agents in database:`);
    
    agents.forEach(agent => {
      console.log(`\n👤 ${agent.name} (ID: ${agent.id})`);
      console.log(`   📧 Email: ${agent.email || 'N/A'}`);
      console.log(`   🎭 Role: ${agent.role || 'support_agent'}`);
      console.log(`   ✅ Active: ${agent.is_active ? 'Yes' : 'No'}`);
      console.log(`   🔐 Password Hash: ${agent.password_hash ? agent.password_hash.substring(0, 20) + '...' : 'NULL'}`);
    });
    
    if (agents.length === 0) {
      console.log('\n⚠️ No agents found!');
      return;
    }
    
    // Test password hashing
    console.log('\n🧪 Testing password hashing...');
    const testPassword = 'test123456';
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    console.log(`Test password: ${testPassword}`);
    console.log(`Hashed password: ${hashedPassword.substring(0, 20)}...`);
    
    // Test password comparison
    const isValid = await bcrypt.compare(testPassword, hashedPassword);
    console.log(`Password comparison test: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
    
    // Check if any agents have NULL password_hash
    const agentsWithNullPassword = agents.filter(agent => !agent.password_hash);
    if (agentsWithNullPassword.length > 0) {
      console.log('\n⚠️ Agents with NULL password_hash:');
      agentsWithNullPassword.forEach(agent => {
        console.log(`  - ${agent.name} (ID: ${agent.id})`);
      });
    }
    
    console.log('\n🔍 Common Issues:');
    console.log('1. Agent password_hash is NULL');
    console.log('2. Password validation failing');
    console.log('3. Agent not active');
    console.log('4. Name/email not found');
    
  } catch (error) {
    console.error('❌ Error debugging agent login:', error.message);
  } finally {
    connection.release();
  }
}

debugAgentLogin().then(() => {
  console.log('\n✅ Debug completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Debug failed:', err);
  process.exit(1);
});
