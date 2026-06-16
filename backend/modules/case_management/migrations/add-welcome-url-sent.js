/**
 * Migration: Add welcome_url_sent to users table
 * Tracks whether user has received the personalized support URL (welcome email).
 * When true, subsequent notifications (ticket created, agent reply) omit links.
 */
const { pool } = require('../../shared/database/database');

async function up() {
  try {
    await pool.execute(`
      ALTER TABLE users 
      ADD COLUMN welcome_url_sent BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Added welcome_url_sent column to users');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('⏭️ welcome_url_sent column already exists');
    } else throw e;
  }
}

async function down() {
  await pool.execute('ALTER TABLE users DROP COLUMN welcome_url_sent');
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { up, down };
