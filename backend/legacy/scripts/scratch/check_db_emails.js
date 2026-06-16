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
    console.log('🔍 Querying latest 10 users in database:');
    const [users] = await pool.execute('SELECT id, email, name, role, created_at FROM users ORDER BY id DESC LIMIT 10');
    console.log(JSON.stringify(users, null, 2));

    console.log('\n🔍 Querying latest 10 incoming emails in database:');
    const [emails] = await pool.execute('SELECT id, sender_email, sender_name, subject, processing_status, email_type, validation_result, received_at FROM incoming_emails ORDER BY id DESC LIMIT 10');
    console.log(JSON.stringify(emails, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
