/**
 * Migration: Manager Override Capability
 * - ticket_activity: Log manager override actions
 * - ticket_messages.is_internal: Internal notes (staff-only)
 */
const { pool } = require('../database');

async function up() {
  const connection = await pool.getConnection();
  try {
    // 1. Create ticket_activity table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ticket_activity (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        ticket_id INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        performed_by INT NOT NULL,
        performed_by_name VARCHAR(100),
        details JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ticket_id (ticket_id),
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_action (action),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created ticket_activity table');

    // 2. Add is_internal to ticket_messages
    try {
      await connection.execute(`
        ALTER TABLE ticket_messages ADD COLUMN is_internal BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Added is_internal column to ticket_messages');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️ is_internal column already exists');
      } else throw e;
    }
  } finally {
    connection.release();
  }
}

async function down() {
  const connection = await pool.getConnection();
  try {
    await connection.execute('DROP TABLE IF EXISTS ticket_activity');
    try {
      await connection.execute('ALTER TABLE ticket_messages DROP COLUMN is_internal');
    } catch (e) {
      console.log('Note: is_internal column may not exist');
    }
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { up, down };
