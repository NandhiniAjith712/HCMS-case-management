/**
 * Migration: Ensure the `users.role` ENUM supports the HCMS roles.
 *
 * NON-DESTRUCTIVE: reads the current ENUM definition and only ADDS any missing
 * HCMS roles (see modules/auth/constants/roles.js:
 *   'employee','hr_executive','department_head','system_admin').
 * All existing values and the existing column DEFAULT are preserved.
 *
 * On the current live DB these values already exist, so this is a safe no-op
 * that simply verifies the schema. It remains useful for fresh environments.
 *
 * Run manually:  node modules/auth/migrations/add-hcms-roles-to-users-enum.js
 */
const { pool } = require('../../shared/database/database');
const { ALL_ROLES } = require('../constants/roles');

/**
 * Parse the value list out of a MySQL ENUM column type string, e.g.
 *   "enum('user','agent','manager')" -> ['user','agent','manager']
 * @param {string} columnType
 * @returns {string[]}
 */
function parseEnumValues(columnType) {
  const match = /^enum\((.*)\)$/i.exec(String(columnType).trim());
  if (!match) return [];
  return match[1]
    .split(',')
    .map((v) => v.trim().replace(/^'(.*)'$/, '$1').replace(/''/g, "'"));
}

async function addHcmsRolesToUsersEnum() {
  const [cols] = await pool.execute(
    `SELECT COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role'`
  );

  if (cols.length === 0) {
    throw new Error("Could not find `users.role` column in the current database.");
  }

  const { COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE } = cols[0];
  const existing = parseEnumValues(COLUMN_TYPE);

  if (existing.length === 0) {
    throw new Error(`users.role is not an ENUM (found: ${COLUMN_TYPE}). Aborting to avoid data loss.`);
  }

  const missing = ALL_ROLES.filter((r) => !existing.includes(r));
  if (missing.length === 0) {
    console.log('✓ users.role ENUM already includes all HCMS roles:', ALL_ROLES.join(', '));
    return;
  }

  // Union existing + missing, preserving original order then appending new ones.
  const merged = [...existing, ...missing];
  const enumList = merged.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');

  const nullClause = IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
  const defaultClause = COLUMN_DEFAULT != null ? ` DEFAULT '${String(COLUMN_DEFAULT).replace(/'/g, "''")}'` : '';

  const sql = `ALTER TABLE users MODIFY COLUMN role ENUM(${enumList}) ${nullClause}${defaultClause}`;
  await pool.execute(sql);

  console.log('✅ Widened users.role ENUM.');
  console.log('   Added:', missing.join(', '));
  console.log('   Full set:', merged.join(', '));
}

if (require.main === module) {
  addHcmsRolesToUsersEnum()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { addHcmsRolesToUsersEnum, parseEnumValues };
