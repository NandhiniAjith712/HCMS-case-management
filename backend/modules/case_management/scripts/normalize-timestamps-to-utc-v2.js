const { pool } = require('../../shared/database/database');

const MIGRATION_KEY = 'normalize_timestamps_to_utc_v2';
const MINUTES_OFFSET = 330; // IST-stored naive -> true UTC

async function run() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_migrations (
        migration_key VARCHAR(120) PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [existing] = await connection.execute(
      'SELECT migration_key FROM system_migrations WHERE migration_key = ? LIMIT 1',
      [MIGRATION_KEY]
    );
    if (existing.length > 0) {
      await connection.rollback();
      console.log(`ℹ️ Migration "${MIGRATION_KEY}" already applied. Skipping.`);
      return;
    }

    const targets = [
      { table: 'tickets', columns: ['created_at', 'updated_at', 'first_response_at', 'resolved_at', 'closed_at'] },
      { table: 'ticket_messages', columns: ['created_at'] }
    ];

    const updates = [];
    for (const target of targets) {
      for (const column of target.columns) {
        const [cols] = await connection.execute(
          `SELECT 1
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
           LIMIT 1`,
          [target.table, column]
        );
        if (cols.length === 0) continue;

        const [result] = await connection.execute(
          `UPDATE \`${target.table}\`
           SET \`${column}\` = DATE_SUB(\`${column}\`, INTERVAL ${MINUTES_OFFSET} MINUTE)
           WHERE \`${column}\` IS NOT NULL`
        );
        updates.push({ table: target.table, column, affectedRows: result.affectedRows || 0 });
      }
    }

    await connection.execute(
      'INSERT INTO system_migrations (migration_key) VALUES (?)',
      [MIGRATION_KEY]
    );

    await connection.commit();
    console.log(`✅ Migration "${MIGRATION_KEY}" completed.`);
    updates.forEach((u) => {
      console.log(`   - ${u.table}.${u.column}: ${u.affectedRows} rows shifted by -${MINUTES_OFFSET} minutes`);
    });
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Migration "${MIGRATION_KEY}" failed:`, error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

run();
