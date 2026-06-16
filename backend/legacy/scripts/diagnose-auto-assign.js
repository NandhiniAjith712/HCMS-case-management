/**
 * Diagnose why auto-assignment fails. Run: node diagnose-auto-assign.js
 * Does NOT assign tickets - only reports what would happen.
 */
require('dotenv').config({ path: './config.env' });
const { pool } = require('./database');

async function run() {
  console.log('\n=== Auto-assignment diagnosis ===\n');

  const [latest] = await pool.execute(
    'SELECT id, tenant_id, assigned_to, created_at FROM tickets ORDER BY id DESC LIMIT 1'
  );
  if (!latest.length) {
    console.log('No tickets found.');
    process.exit(0);
  }
  const t = latest[0];
  console.log('Latest ticket:', { id: t.id, tenant_id: t.tenant_id, assigned_to: t.assigned_to, created_at: t.created_at });

  const tenantId = t.tenant_id ?? 1;

  // 1. All FKs on tickets (assigned_to, assigned_by)
  const [fks] = await pool.execute(`
    SELECT COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets'
      AND COLUMN_NAME IN ('assigned_to','assigned_by') AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  console.log('\n1. tickets FKs:');
  fks.forEach(f => console.log('   ', f.CONSTRAINT_NAME, ':', f.COLUMN_NAME, '->', f.REFERENCED_TABLE_NAME + '(id)'));
  const assignedByToAgents = fks.filter(f => f.COLUMN_NAME === 'assigned_by' && f.REFERENCED_TABLE_NAME === 'agents');
  if (assignedByToAgents.length > 0) {
    console.log('   >>> PROBLEM: assigned_by has FK to agents(id). Code sets assigned_by=customer userId (e.g. 119) => UPDATE fails.');
  }

  // 2. Agents for tenant
  const [agents] = await pool.execute(
    `SELECT id, name, role FROM agents WHERE is_active = TRUE AND (tenant_id = ? OR tenant_id IS NULL) AND role IN ('support_agent','agent','support_manager','ceo') LIMIT 5`,
    [tenantId]
  );
  console.log('\n2. Agents for tenant', tenantId, ':', agents.length, agents.length ? agents.map(a => `${a.name}(id=${a.id})`).join(', ') : 'NONE');

  // 3. Try UPDATE with same values as real assignment (WHERE id = -1 so we don't change any row)
  const agentId = agents[0]?.id ?? 503;
  const assignedBy = 119; // customer user id
  try {
    await pool.execute(
      'UPDATE tickets SET assigned_to = ?, assigned_by = ? WHERE id = -1',
      [agentId, assignedBy]
    );
    console.log('\n3. Test UPDATE (dummy WHERE id=-1): OK - no FK error.');
  } catch (err) {
    console.log('\n3. Test UPDATE failed (this is why assignment fails):', err.message);
    console.log('   Code:', err.code);
  }

  // 4. Is assigned_by (user 119) in users?
  const [u] = await pool.execute('SELECT id FROM users WHERE id = ?', [119]);
  console.log('\n4. assigned_by=119 in users?', u.length ? 'yes' : 'no');

  console.log('\n=== End ===\n');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
