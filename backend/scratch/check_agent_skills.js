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
    console.log('🤖 Querying all agents...');
    const [agents] = await pool.execute('SELECT id, name, email, level, role, availability_status, is_active FROM agents');
    console.log(JSON.stringify(agents, null, 2));

    console.log('\n🤹 Querying all agent skills...');
    const [skills] = await pool.execute('SELECT * FROM agent_skills');
    console.log(JSON.stringify(skills, null, 2));

    console.log('\n⚙️ Querying AI Allocation system settings...');
    const [settings] = await pool.execute('SELECT * FROM system_settings WHERE setting_key = "ai_ticket_allocation_enabled"');
    console.log(JSON.stringify(settings, null, 2));

  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await pool.end();
  }
}

run();
