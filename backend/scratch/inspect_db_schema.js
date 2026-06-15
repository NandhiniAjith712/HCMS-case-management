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
    console.log('🔍 DESCRIBE users:');
    const [cols] = await pool.execute('DESCRIBE users');
    console.log(cols);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
