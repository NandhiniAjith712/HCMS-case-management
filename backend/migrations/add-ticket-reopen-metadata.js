/**
 * Add reopen metadata columns to tickets table.
 *
 * reopened_at: last time the ticket was reopened (customer rejection / reopen flow)
 * reopen_count: number of reopen events for the ticket
 */
const { pool } = require('../database');

async function addColumn(sql, duplicateCodeLabel) {
  try {
    await pool.execute(sql);
    return true;
  } catch (e) {
    if (e?.code === 'ER_DUP_FIELDNAME') {
      console.log(`ℹ️ ${duplicateCodeLabel} column already exists`);
      return false;
    }
    throw e;
  }
}

async function run() {
  await addColumn(
    `ALTER TABLE tickets
     ADD COLUMN reopened_at DATETIME NULL COMMENT 'Last time this ticket was reopened (customer rejection / reopen flow)'`,
    'reopened_at'
  );

  await addColumn(
    `ALTER TABLE tickets
     ADD COLUMN reopen_count INT NOT NULL DEFAULT 0 COMMENT 'Number of times ticket has been reopened'`,
    'reopen_count'
  );

  console.log('✅ Ticket reopen metadata migration complete');
}

run()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => process.exit(0));

