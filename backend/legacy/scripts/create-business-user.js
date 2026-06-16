const { pool } = require('./database');

async function createBusinessUser() {
  try {
    console.log('👥 Creating business team user...');
    
    // Check if business user already exists
    const [existingUsers] = await pool.execute(`
      SELECT id, name, email FROM users WHERE email = 'business@company.com'
    `);
    
    if (existingUsers.length > 0) {
      console.log('✅ Business user already exists:', existingUsers[0].name);
      return;
    }
    
    // Create business team user
    const [result] = await pool.execute(`
      INSERT INTO users (name, email, password_hash, role, is_active) 
      VALUES (?, ?, ?, ?, ?)
    `, [
      'Business Team',
      'business@company.com',
      'business123',
      'business_team',
      true
    ]);
    
    console.log('✅ Business team user created successfully!');
    console.log('📧 Email: business@company.com');
    console.log('🔑 Password: business123');
    console.log('👤 Role: business_team');
    
  } catch (error) {
    console.error('❌ Error creating business user:', error);
  } finally {
    process.exit(0);
  }
}

createBusinessUser(); 