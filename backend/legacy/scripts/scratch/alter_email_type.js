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
    console.log('🔄 Altering incoming_emails.email_type to VARCHAR(50)...');
    await pool.execute("ALTER TABLE incoming_emails MODIFY COLUMN email_type VARCHAR(50) DEFAULT 'valid_user_mail'");
    console.log('✅ Column email_type altered successfully!');
  } catch (err) {
    console.error('❌ Failed to alter column:', err.message);
  } finally {
    await pool.end();
  }
}

run();
