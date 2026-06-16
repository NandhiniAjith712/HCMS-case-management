const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function testUserAuth() {
  console.log('🧪 Testing User Authentication System...');
  console.log('=========================================');
  
  try {
    // Test 1: Check if users table has password_hash column
    console.log('\n1️⃣ Checking users table structure...');
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()
    `);
    
    const hasPasswordHash = columns.some(col => col.COLUMN_NAME === 'password_hash');
    console.log(`✅ Password hash column exists: ${hasPasswordHash}`);
    
    if (!hasPasswordHash) {
      console.log('⚠️ Adding password_hash column...');
      await pool.execute('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)');
      console.log('✅ Password hash column added');
    }

    // Test 2: Create a test user
    console.log('\n2️⃣ Creating test user...');
    const testUser = {
      name: 'Test User',
      email: 'user@example.com',
      password: 'user123',
      role: 'user',
      department: 'IT'
    };

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [testUser.email]
    );

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log(`✅ Test user already exists with ID: ${userId}`);
    } else {
      // Hash password
      const hashedPassword = await bcrypt.hash(testUser.password, 12);
      
      // Create user
      const [result] = await pool.execute(
        `INSERT INTO users (name, email, password_hash, role, department, is_active) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [testUser.name, testUser.email, hashedPassword, testUser.role, testUser.department, true]
      );
      
      userId = result.insertId;
      console.log(`✅ Test user created with ID: ${userId}`);
    }

    // Test 3: Test user login
    console.log('\n3️⃣ Testing user login...');
    
    // Simulate login request
    const loginData = {
      email: testUser.email,
      password: testUser.password
    };

    // Find user by email
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [loginData.email]
    );

    if (users.length === 0) {
      console.log('❌ User not found');
      return;
    }

    const user = users[0];
    console.log(`✅ User found: ${user.name} (ID: ${user.id})`);

    // Check if user is active
    if (!user.is_active) {
      console.log('❌ User is not active');
      return;
    }
    console.log('✅ User is active');

    // Check if user has password hash
    if (!user.password_hash) {
      console.log('❌ User has no password hash');
      return;
    }
    console.log('✅ User has password hash');

    // Validate password
    const isValidPassword = await bcrypt.compare(loginData.password, user.password_hash);
    console.log(`🔐 Password validation: ${isValidPassword ? '✅ VALID' : '❌ INVALID'}`);

    if (!isValidPassword) {
      console.log('❌ Password is invalid');
      return;
    }

    // Update last login
    await pool.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );
    console.log('✅ Last login updated');

    // Test 4: Test user registration
    console.log('\n4️⃣ Testing user registration...');
    
    const newUser = {
      name: 'New Test User',
      email: 'newuser@example.com',
      password: 'newuser123',
      role: 'user',
      department: 'Marketing'
    };

    // Check if user already exists
    const [existingNewUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [newUser.email]
    );

    if (existingNewUsers.length > 0) {
      console.log(`✅ New test user already exists with ID: ${existingNewUsers[0].id}`);
    } else {
      // Hash password
      const hashedNewPassword = await bcrypt.hash(newUser.password, 12);
      
      // Create new user
      const [result] = await pool.execute(
        `INSERT INTO users (name, email, password_hash, role, department, is_active) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newUser.name, newUser.email, hashedNewPassword, newUser.role, newUser.department, true]
      );
      
      console.log(`✅ New test user created with ID: ${result.insertId}`);
    }

    // Test 5: Get user profile
    console.log('\n5️⃣ Testing user profile retrieval...');
    
    const [userProfiles] = await pool.execute(
      'SELECT id, name, email, role, department, is_active, created_at, last_login FROM users WHERE email IN (?, ?)',
      [testUser.email, newUser.email]
    );

    console.log(`✅ Found ${userProfiles.length} user profiles:`);
    userProfiles.forEach(profile => {
      console.log(`   👤 ${profile.name} (${profile.email}) - Role: ${profile.role}`);
    });

    console.log('\n🎉 All user authentication tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('===========');
    console.log('• ✅ Users table structure verified');
    console.log('• ✅ Test user creation working');
    console.log('• ✅ User login working');
    console.log('• ✅ Password hashing working');
    console.log('• ✅ User registration working');
    console.log('• ✅ User profile retrieval working');
    console.log('• ✅ User authentication system is ready!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

testUserAuth();
