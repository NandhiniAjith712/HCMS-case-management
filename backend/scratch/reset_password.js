const { pool } = require('../database');
const bcrypt = require('bcryptjs');

async function main() {
  try {
    const password = 'manager123';
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const [result] = await pool.execute(
      'UPDATE agents SET password_hash = ?, is_active = 1 WHERE email = ?',
      [hashedPassword, 'munisyam@gmail.com']
    );
    
    if (result.affectedRows > 0) {
      console.log('✅ Successfully updated Muni Syam password to "manager123"');
    } else {
      console.log('❌ Could not find agent with email munisyam@gmail.com');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
