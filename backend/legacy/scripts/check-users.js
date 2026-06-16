const { pool } = require('./database');

async function checkUsers() {
  try {
    console.log('🔍 Checking for temp users...');
    
    const [tempUsers] = await pool.execute(
      'SELECT id, name, email, role FROM users WHERE name LIKE "%temp%" OR email LIKE "%temp%"'
    );
    
    console.log('Temp users found:', tempUsers);
    
    console.log('\n🔍 Checking all users...');
    const [allUsers] = await pool.execute(
      'SELECT id, name, email, role FROM users LIMIT 10'
    );
    
    console.log('All users:', allUsers);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
