/**
 * Diagnose why ticket #1283 was not assigned. Does NOT assign the ticket.
 */
require('dotenv').config({ path: './config.env' });
const { pool } = require('./database');

async function run() {
  const ticketId = 1283;
  console.log('\n=== Diagnosing ticket #' + ticketId + ' (assignment not performed) ===\n');

  const [tickets] = await pool.execute(
    'SELECT id, tenant_id, assigned_to, assigned_by, status, created_at, product_id, module_id FROM tickets WHERE id = ?',
    [ticketId]
  );
  if (tickets.length === 0) {
    console.log('Ticket #' + ticketId + ' not found.');
    process.exit(1);
  }
  const t = tickets[0];
  console.log('1. TICKET');
  console.log('   id:', t.id, '| tenant_id:', t.tenant_id, '| assigned_to:', t.assigned_to, '| status:', t.status);
  console.log('   created_at:', t.created_at);
  console.log('   product_id:', t.product_id, '| module_id:', t.module_id);

  const tenantId = t.tenant_id || 1;
  console.log('\n2. AGENTS FOR TENANT', tenantId, '(support_agent / agent only)');
  const [agents] = await pool.execute(
    `SELECT id, name, email, role, tenant_id, is_active FROM agents 
     WHERE is_active = TRUE AND role IN ('support_agent', 'agent') AND (tenant_id = ? OR tenant_id IS NULL)`,
    [tenantId]
  );
  console.log('   Count:', agents.length);
  agents.forEach(a => console.log('   -', a.id, a.name, a.role, 'tenant_id=' + a.tenant_id));

  console.log('\n3. ALL ACTIVE STAFF (any role) for tenant', tenantId);
  const [allStaff] = await pool.execute(
    `SELECT id, name, email, role, tenant_id FROM agents 
     WHERE is_active = TRUE AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY role`,
    [tenantId]
  );
  console.log('   Count:', allStaff.length);
  allStaff.forEach(a => console.log('   -', a.id, a.name, a.role));

  console.log('\n4. WOULD UPDATE MATCH?');
  const [updCheck] = await pool.execute(
    'SELECT id FROM tickets WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)',
    [ticketId, tenantId]
  );
  console.log('   UPDATE tickets SET assigned_to=? WHERE id=? AND (tenant_id=? OR tenant_id IS NULL)');
  console.log('   Rows that would match:', updCheck.length, updCheck.length ? '=> UPDATE would apply.' : '=> UPDATE would affect 0 rows (tenant mismatch?).');

  console.log('\n5. FOREIGN KEY CHECK (tickets.assigned_to / assigned_by)');
  const [fkInfo] = await pool.execute(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME 
     FROM information_schema.KEY_COLUMN_USAGE 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets' AND REFERENCED_TABLE_NAME IS NOT NULL AND COLUMN_NAME IN ('assigned_to','assigned_by')`
  );
  fkInfo.forEach(f => console.log('   ', f.COLUMN_NAME, '->', f.REFERENCED_TABLE_NAME + '(' + f.REFERENCED_COLUMN_NAME + ')'));

  const agentIds = agents.map(a => a.id);
  const [usersMatch] = await pool.execute(
    'SELECT id FROM users WHERE id IN (?)',
    [agentIds.length ? agentIds : [0]]
  );
  const userIds = new Set((usersMatch || []).map(r => r.id));
  const missingInUsers = agentIds.filter(id => !userIds.has(id));
  if (missingInUsers.length > 0) {
    console.log('   Agent IDs that are NOT in users table:', missingInUsers.join(', '));
    console.log('   => UPDATE tickets SET assigned_to=<agent_id> would FAIL (FK to users(id)).');
  } else {
    console.log('   All agent IDs exist in users table => FK would allow UPDATE.');
  }

  console.log('\n6. POSSIBLE CAUSES');
  if (agents.length === 0 && allStaff.length > 0) {
    console.log('   - No support_agent/agent for this tenant; only managers/ceo. Assignment fallback should still pick them.');
  } else if (agents.length === 0 && allStaff.length === 0) {
    console.log('   - No active agents for this tenant => assignTicketEqually would throw "No active agents available".');
  }
  if (updCheck.length === 0) {
    console.log('   - Ticket tenant_id does not match request tenant => UPDATE would affect 0 rows.');
  }
  if (missingInUsers.length > 0) {
    console.log('   - ROOT CAUSE: tickets.assigned_to has FK to users(id), but code sets agent.id. Agent IDs', missingInUsers.join(','), 'not in users => UPDATE fails, ticket stays unassigned.');
  }
  console.log('\n=== End diagnosis ===\n');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
