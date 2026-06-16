const { pool } = require('./database');

async function checkStaffUsers() {
  try {
    console.log('🔍 Checking staff users in database...');
    
    const [users] = await pool.execute(
      'SELECT id, name, email, role, is_active FROM users WHERE role IN (?, ?, ?)',
      ['agent', 'manager', 'ceo']
    );
    
    console.log(`\n📝 Found ${users.length} staff users:`);
    
    users.forEach(user => {
      console.log(`\n👤 ${user.name} (ID: ${user.id})`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🎭 Role: ${user.role}`);
      console.log(`   ✅ Active: ${user.is_active ? 'Yes' : 'No'}`);
    });
    
    if (users.length === 0) {
      console.log('\n⚠️ No staff users found!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkStaffUsers();
