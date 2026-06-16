/**
 * Fix tickets assignment FKs so auto-assignment works:
 * - assigned_to -> agents(id) (code sets agent.id)
 * - assigned_by -> users(id) only (code sets customer userId; drop any assigned_by -> agents)
 * Run: node fix-ticket-assigned-foreign-key.js
 */
require('dotenv').config({ path: './config.env' });
const { pool } = require('./database');

async function fixAssignedForeignKey() {
  const connection = await pool.getConnection();
  try {
    console.log('🔧 Fixing tickets assignment foreign keys...\n');

    // 1. assigned_to: ensure it references agents(id)
    const [assignedToFks] = await connection.execute(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets'
        AND COLUMN_NAME = 'assigned_to' AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    for (const fk of assignedToFks) {
      try {
        await connection.execute(`ALTER TABLE tickets DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
        console.log(`   Dropped assigned_to FK: ${fk.CONSTRAINT_NAME}`);
      } catch (e) {
        console.log(`   ⚠️  Could not drop ${fk.CONSTRAINT_NAME}: ${e.message}`);
      }
    }
    try {
      await connection.execute(
        'ALTER TABLE tickets ADD CONSTRAINT fk_assigned_to FOREIGN KEY (assigned_to) REFERENCES agents(id) ON DELETE SET NULL'
      );
      console.log('   ✅ assigned_to -> agents(id)\n');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME' || (e.message && e.message.includes('Duplicate'))) {
        console.log('   ℹ️  assigned_to already has FK to agents.\n');
      } else {
        console.log(`   ⚠️  ${e.message}\n`);
      }
    }

    // 2. assigned_by: drop any FK to agents(id) so we can set customer userId (e.g. 119)
    const [assignedByFks] = await connection.execute(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets'
        AND COLUMN_NAME = 'assigned_by' AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    for (const fk of assignedByFks) {
      if (fk.REFERENCED_TABLE_NAME === 'agents') {
        try {
          await connection.execute(`ALTER TABLE tickets DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
          console.log(`   Dropped assigned_by->agents FK: ${fk.CONSTRAINT_NAME}`);
        } catch (e) {
          console.log(`   ⚠️  Could not drop ${fk.CONSTRAINT_NAME}: ${e.message}`);
        }
      }
    }
    // Ensure assigned_by -> users(id) exists
    const hasAssignedByUsers = assignedByFks.some(f => f.REFERENCED_TABLE_NAME === 'users');
    if (!hasAssignedByUsers) {
      try {
        await connection.execute(
          'ALTER TABLE tickets ADD CONSTRAINT fk_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL'
        );
        console.log('   ✅ assigned_by -> users(id)');
      } catch (e) {
        console.log(`   ⚠️  assigned_by FK to users: ${e.message}`);
      }
    } else {
      console.log('   ℹ️  assigned_by already has FK to users.');
    }

    console.log('\n🎉 Done. New tickets should auto-assign immediately.');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

if (require.main === module) {
  fixAssignedForeignKey();
}

module.exports = { fixAssignedForeignKey };
