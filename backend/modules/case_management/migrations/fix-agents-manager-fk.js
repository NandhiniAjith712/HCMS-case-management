/**
 * Migration: Fix agents.manager_id foreign key
 * Change from REFERENCES users(id) to REFERENCES agents(id) (self-referential)
 * So support_agents can correctly reference their manager (support_manager) in the same table.
 *
 * Run: node backend/migrations/fix-agents-manager-fk.js
 */
const { pool } = require('../../shared/database/database');

async function up() {
  const connection = await pool.getConnection();
  try {
    console.log('🔧 Fixing agents.manager_id foreign key...');

    // 1. Find the existing FK constraint name on manager_id
    const [createTable] = await connection.execute('SHOW CREATE TABLE agents');
    const createSql = createTable[0]['Create Table'] || '';

    const fkMatch = createSql.match(/CONSTRAINT `([^`]+)` FOREIGN KEY \(`manager_id`\) REFERENCES `users`/);
    if (fkMatch) {
      const constraintName = fkMatch[1];
      await connection.execute(`ALTER TABLE agents DROP FOREIGN KEY \`${constraintName}\``);
      console.log(`✅ Dropped old FK: ${constraintName}`);
    } else {
      console.log('⚠️ No manager_id FK found referencing users (may already be fixed or never existed)');
    }

    // 2. Clean invalid manager_id values (must reference existing agent ids)
    const [agents] = await connection.execute('SELECT id FROM agents');
    const validIds = new Set(agents.map((a) => a.id));
    const [withManager] = await connection.execute(
      'SELECT id, manager_id FROM agents WHERE manager_id IS NOT NULL'
    );
    for (const row of withManager) {
      if (!validIds.has(row.manager_id)) {
        await connection.execute('UPDATE agents SET manager_id = NULL WHERE id = ?', [row.id]);
        console.log(`  Cleaned invalid manager_id for agent id=${row.id}`);
      }
    }

    // 3. Add new self-referential FK (may already exist)
    try {
      await connection.execute(`
        ALTER TABLE agents
        ADD CONSTRAINT fk_agents_manager
        FOREIGN KEY (manager_id) REFERENCES agents(id) ON DELETE SET NULL
      `);
      console.log('✅ Added FK: manager_id REFERENCES agents(id)');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_FK_DUP_NAME') {
        console.log('⚠️ FK fk_agents_manager already exists');
      } else {
        throw e;
      }
    }
  } finally {
    connection.release();
  }
}

async function down() {
  const connection = await pool.getConnection();
  try {
    await connection.execute('ALTER TABLE agents DROP FOREIGN KEY fk_agents_manager');
    console.log('✅ Dropped fk_agents_manager');
    // Optionally restore old FK - skipping for simplicity
  } catch (e) {
    if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log('⚠️ FK fk_agents_manager does not exist');
    } else {
      throw e;
    }
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  up()
    .then(() => {
      console.log('✅ Migration complete');
      process.exit(0);
    })
    .catch((e) => {
      console.error('❌ Migration failed:', e);
      process.exit(1);
    });
}

module.exports = { up, down };
