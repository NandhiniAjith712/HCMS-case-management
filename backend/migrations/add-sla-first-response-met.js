/**
 * Add sla_first_response_met column to tickets table for SLA adherence tracking.
 * NULL = not yet responded, 1 = met, 0 = breached
 */
const { pool } = require('../database');

async function run() {
  try {
    await pool.execute(`
      ALTER TABLE tickets 
      ADD COLUMN sla_first_response_met TINYINT(1) NULL 
      COMMENT '1=SLA met, 0=breached, NULL=no first response yet'
    `);
    console.log('✅ Added sla_first_response_met column to tickets');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ sla_first_response_met column already exists');
    } else {
      throw e;
    }
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
}).finally(() => process.exit(0));
