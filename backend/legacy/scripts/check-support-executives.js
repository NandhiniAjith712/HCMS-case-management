const { pool } = require('./database');

async function checkSupportExecutives() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Checking support executives in database...');
    
    // Check users table
    const [users] = await connection.execute(`
      SELECT id, name, email, role, is_active 
      FROM users 
      WHERE role = 'support_agent'
    `);
    
    console.log(`\n📝 Users table - Support executives: ${users.length}`);
    users.forEach(user => {
      console.log(`  - ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Active: ${user.is_active}`);
    });
    
    // Check agents table
    const [agents] = await connection.execute(`
      SELECT id, name, email, role, is_active 
      FROM agents 
      WHERE role = 'support_agent'
    `);
    
    console.log(`\n📝 Agents table - Support executives: ${agents.length}`);
    agents.forEach(agent => {
      console.log(`  - ID: ${agent.id}, Name: ${agent.name}, Email: ${agent.email}, Active: ${agent.is_active}`);
    });
    
    // Check all users with similar roles
    const [allUsers] = await connection.execute(`
      SELECT id, name, email, role, is_active 
      FROM users 
      WHERE role LIKE '%executive%' OR role LIKE '%support%' OR role LIKE '%agent%'
      ORDER BY role, id
    `);
    
    console.log(`\n📝 All users with support-related roles: ${allUsers.length}`);
    allUsers.forEach(user => {
      console.log(`  - ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}, Active: ${user.is_active}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

checkSupportExecutives();
