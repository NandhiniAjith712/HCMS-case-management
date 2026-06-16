const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function debugLoginIssue() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Debugging Login Issue...');
    console.log('===========================');
    
    // Simulate the exact request that the frontend sends
    const testData = {
      name: 'admin',
      password: 'admin123'
    };
    
    console.log('📝 Test data:', testData);
    
    // Step 1: Validate input (simulate backend validation)
    console.log('\n1️⃣ Validating input...');
    
    if (!testData.name || testData.name.trim().length < 2 || testData.name.trim().length > 100) {
      console.log('❌ Name validation failed');
      return;
    }
    
    if (!testData.password || testData.password.length < 6) {
      console.log('❌ Password validation failed');
      return;
    }
    
    console.log('✅ Input validation passed');
    
    // Step 2: Find agent by name or email
    console.log('\n2️⃣ Finding agent...');
    
    const [agents] = await connection.execute(
      'SELECT * FROM agents WHERE name = ? OR email = ?',
      [testData.name, testData.name]
    );
    
    console.log(`   📊 Found ${agents.length} agents`);
    
    if (agents.length === 0) {
      console.log('❌ No agent found - This would cause 401 error');
      return;
    }
    
    const agent = agents[0];
    console.log(`   ✅ Agent found: ID=${agent.id}, Name=${agent.name}, Active=${agent.is_active}`);
    
    // Step 3: Check if agent is active
    console.log('\n3️⃣ Checking agent status...');
    
    if (!agent.is_active) {
      console.log('❌ Agent is not active - This would cause 401 error');
      return;
    }
    
    console.log('✅ Agent is active');
    
    // Step 4: Check password
    console.log('\n4️⃣ Validating password...');
    
    if (!agent.password_hash) {
      console.log('❌ No password hash found - This would cause 401 error');
      return;
    }
    
    const isValidPassword = await bcrypt.compare(testData.password, agent.password_hash);
    console.log(`   🔐 Password validation: ${isValidPassword ? '✅ VALID' : '❌ INVALID'}`);
    
    if (!isValidPassword) {
      console.log('❌ Password is invalid - This would cause 401 error');
      return;
    }
    
    console.log('✅ Password is valid');
    
    // Step 5: Simulate successful login
    console.log('\n5️⃣ Simulating successful login...');
    
    // Update last login
    await connection.execute(
      'UPDATE agents SET last_login = NOW() WHERE id = ?',
      [agent.id]
    );
    
    console.log('✅ Last login updated');
    console.log('✅ Login should be successful!');
    
    console.log('\n🎯 Summary:');
    console.log('===========');
    console.log('• Input validation: ✅ PASSED');
    console.log('• Agent found: ✅ PASSED');
    console.log('• Agent active: ✅ PASSED');
    console.log('• Password valid: ✅ PASSED');
    console.log('• Login should work!');
    
  } catch (error) {
    console.error('❌ Error debugging login issue:', error.message);
  } finally {
    connection.release();
  }
}

debugLoginIssue().then(() => {
  console.log('\n✅ Debug completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Debug failed:', err);
  process.exit(1);
});
