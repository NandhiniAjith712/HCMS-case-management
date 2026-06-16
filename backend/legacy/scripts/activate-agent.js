const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function activateAgent(email, password) {
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      `UPDATE agents 
       SET is_active = TRUE, 
           password_hash = ?, 
           password_setup_token = NULL, 
           password_setup_token_expires = NULL
       WHERE email = ?`,
      [hashedPassword, email]
    );
    if (result.affectedRows > 0) {
      console.log(`✅ Agent ${email} activated with new password.`);
    } else {
      console.log(`⚠️ No agent found with email: ${email}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

const email = process.argv[2] || 'praharshita@gmail.com';
const password = process.argv[3] || 'TempPass123!';
activateAgent(email, password);
