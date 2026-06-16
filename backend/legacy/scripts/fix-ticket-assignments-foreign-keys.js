const { pool } = require('./database');

async function fixTicketAssignmentsFKs() {
  const connection = await pool.getConnection();
  try {
    console.log('🔧 Fixing ticket_assignments foreign keys...');

    // Inspect existing FKs on ticket_assignments
    const [rows] = await connection.execute(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ticket_assignments'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    for (const fk of rows) {
      console.log(`🔎 Found FK ${fk.CONSTRAINT_NAME} on ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}(id)`);
      // Drop any FK that points to agents or a mismatched target
      if (fk.REFERENCED_TABLE_NAME !== 'users') {
        try {
          await connection.execute(`ALTER TABLE ticket_assignments DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
          console.log(`✅ Dropped FK ${fk.CONSTRAINT_NAME}`);
        } catch (e) {
          console.log(`⚠️  Could not drop FK ${fk.CONSTRAINT_NAME}: ${e.message}`);
        }
      }
    }

    // Ensure agent_id -> users(id)
    const addAgentFkSql = `
      ALTER TABLE ticket_assignments
      ADD CONSTRAINT fk_ticket_assignments_agent
      FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
    `;
    try {
      await connection.execute(addAgentFkSql);
      console.log('✅ Added fk_ticket_assignments_agent -> users(id)');
    } catch (e) {
      console.log(`ℹ️  Agent FK add skipped: ${e.message}`);
    }

    // Ensure assigned_by -> users(id)
    const addAssignedByFkSql = `
      ALTER TABLE ticket_assignments
      ADD CONSTRAINT fk_ticket_assignments_assigned_by
      FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
    `;
    try {
      await connection.execute(addAssignedByFkSql);
      console.log('✅ Added fk_ticket_assignments_assigned_by -> users(id)');
    } catch (e) {
      console.log(`ℹ️  assigned_by FK add skipped: ${e.message}`);
    }

    console.log('🎉 ticket_assignments foreign key repair complete.');
  } catch (error) {
    console.error('❌ Failed to fix ticket_assignments foreign keys:', error.message);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

if (require.main === module) {
  fixTicketAssignmentsFKs();
}

module.exports = { fixTicketAssignmentsFKs };


