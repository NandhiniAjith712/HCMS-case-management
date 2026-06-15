const mysql = require('mysql2/promise');
require('dotenv').config({ path: './config.env' });

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'tick_system',
    port: process.env.DB_PORT || 3306
  });

  try {
    console.log('🧹 Starting cleanup of test users in DB...');
    
    // We will delete users who are from personal domains (like gmail.com) or unregistered test custom domains
    const deleteEmails = [
      '20.5b4loukyarao@gmail.com',
      'loukyarao68@gmail.com',
      'personal_user@gmail.com',
      'mailer-daemon@googlemail.com',
      'alex.jones@newcustomdomain.com'
    ];

    for (const email of deleteEmails) {
      const [res] = await pool.execute('DELETE FROM users WHERE email = ?', [email]);
      if (res.affectedRows > 0) {
        console.log(`🗑️ Deleted test user: ${email}`);
      }
    }

    console.log('✅ Cleanup finished successfully!');
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await pool.end();
  }
}

run();
