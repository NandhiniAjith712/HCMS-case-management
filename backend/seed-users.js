const { pool } = require('./database');
const { hashPassword } = require('./middleware/auth');

async function seedUsers() {
  try {
    console.log('🌱 Seeding users...');

    // CUSTOMERS ONLY - Staff go in agents table (run seed-agents.js)
    const users = [
      {
        email: 'customer1@example.com',
        name: 'John Customer',
        password: 'customer123',
        role: 'user',
        department: null
      },
      {
        email: 'customer2@example.com',
        name: 'Jane Customer',
        password: 'customer123',
        role: 'user',
        department: null
      }
    ];

    for (const user of users) {
      // Check if user already exists
      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        [user.email]
      );

      if (existingUsers.length === 0) {
        // Hash password
        const hashedPassword = await hashPassword(user.password);

        // Create customer user
        await pool.execute(
          `INSERT INTO users (email, name, password_hash, role, department) 
           VALUES (?, ?, ?, ?, ?)`,
          [user.email, user.name, hashedPassword, user.role, user.department]
        );

        console.log(`✅ Created user: ${user.name} (${user.role})`);
      } else {
        console.log(`⏭️  User already exists: ${user.name}`);
      }
    }

    console.log('✅ Customer seeding completed!');
    console.log('\n📋 Customer Accounts (for User Dashboard / auto-login):');
    console.log('   Customer 1: customer1@example.com / customer123');
    console.log('   Customer 2: customer2@example.com / customer123');
    console.log('\n💡 For staff login, run: node seed-agents.js');

  } catch (error) {
    console.error('❌ Error seeding users:', error);
  } finally {
    process.exit(0);
  }
}

seedUsers(); 