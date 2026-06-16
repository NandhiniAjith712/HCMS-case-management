#!/usr/bin/env node
require('dotenv').config({ path: './config.env' });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'tick_system',
    port: process.env.DB_PORT || 3306
  });

  const sqlPath = path.join(__dirname, 'migrations', 'staff_password_setup.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      await conn.execute(stmt + ';');
      console.log('OK:', stmt.substring(0, 60) + '...');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('SKIP (column exists):', stmt.substring(0, 50) + '...');
      } else {
        console.error('ERROR:', e.message);
        process.exit(1);
      }
    }
  }
  await conn.end();
  console.log('Migration complete.');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
