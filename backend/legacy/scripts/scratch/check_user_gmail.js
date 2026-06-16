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
    const emailToCheck = '20.5b4loukyarao@gmail.com';
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [emailToCheck]);
    console.log(`🔍 Check result for ${emailToCheck}:`);
    console.log(JSON.stringify(users, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
