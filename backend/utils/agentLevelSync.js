const { pool } = require('../database');

const EXEC_ROLES_SQL = `
  UPDATE agents SET level = NULL
  WHERE LOWER(COALESCE(role, '')) IN ('support_manager', 'manager', 'ceo', 'admin')
`;

/**
 * Clears agents.level for Manager/CEO rows. Runs whenever schema ensure runs — not only on first boot —
 * so data stays correct even if an earlier UPDATE failed (e.g. column was NOT NULL).
 */
async function syncExecutiveAgentLevelsToNull() {
  try {
    await pool.execute(EXEC_ROLES_SQL);
  } catch (error) {
    const isNullConstraint =
      error.errno === 1048 ||
      error.code === 'ER_BAD_NULL_ERROR' ||
      (error.sqlMessage && /Column .level. cannot be null/i.test(error.sqlMessage));
    if (!isNullConstraint) {
      console.warn('⚠️ syncExecutiveAgentLevelsToNull:', error.message);
      return;
    }
    try {
      await pool.execute(
        "ALTER TABLE agents MODIFY COLUMN level ENUM('L1','L2','L3','MANAGER') NULL DEFAULT NULL"
      );
    } catch (e) {
      console.warn('⚠️ Could not make agents.level nullable:', e.message);
    }
    try {
      await pool.execute(EXEC_ROLES_SQL);
    } catch (e2) {
      console.warn('⚠️ Could not clear agents.level for managers/ceo after MODIFY:', e2.message);
    }
  }
}

module.exports = { syncExecutiveAgentLevelsToNull };
