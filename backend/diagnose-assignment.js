/**
 * Diagnose why a ticket is not auto-assigned.
 * Run: node diagnose-assignment.js [ticketId]
 * Example: node diagnose-assignment.js 1275
 */

require('dotenv').config({ path: './config.env' });
const { pool } = require('./database');
const TicketAssignmentService = require('./utils/ticketAssignment');

async function main() {
  const ticketId = parseInt(process.argv[2] || '1275', 10);
  
  console.log(`\n🔍 Diagnosing ticket #${ticketId} auto-assignment...\n`);
  
  const connection = await pool.getConnection();
  
  try {
    // 1. Ticket details
    const [tickets] = await connection.execute(
      'SELECT id, tenant_id, assigned_to, assigned_by, status, created_at FROM tickets WHERE id = ?',
      [ticketId]
    );
    
    if (tickets.length === 0) {
      console.log(`❌ Ticket #${ticketId} not found.`);
      process.exit(1);
    }
    
    const ticket = tickets[0];
    console.log('📋 Ticket:', {
      id: ticket.id,
      tenant_id: ticket.tenant_id,
      assigned_to: ticket.assigned_to,
      assigned_by: ticket.assigned_by,
      status: ticket.status,
      created_at: ticket.created_at
    });
    
    // 2. Agents table structure
    const [cols] = await connection.execute(
      "SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME IN ('tenant_id', 'role', 'is_active')"
    );
    const hasTenantId = cols.some(c => c.COLUMN_NAME === 'tenant_id');
    console.log('\n📋 Agents table: tenant_id=', hasTenantId ? 'YES' : 'NO', '| role:', cols.find(c => c.COLUMN_NAME === 'role')?.COLUMN_TYPE || '?');
    
    // 3. All support agents
    const agentQuery = hasTenantId
      ? `SELECT id, name, email, role, tenant_id, is_active FROM agents WHERE role IN ('support_agent', 'agent') ORDER BY tenant_id, id`
      : `SELECT id, name, email, role, is_active FROM agents WHERE role IN ('support_agent', 'agent') ORDER BY id`;
    const [agents] = await connection.execute(agentQuery);
    
    console.log(`\n👥 Support agents (role in support_agent/agent): ${agents.length}`);
    agents.forEach(a => {
      const active = a.is_active ? '✓' : '✗';
      const tenant = hasTenantId ? ` tenant=${a.tenant_id}` : '';
      console.log(`   - ${a.id}: ${a.name} (${a.email}) role=${a.role} active=${active}${tenant}`);
    });
    
    if (agents.length === 0) {
      console.log('\n⚠️ No support agents found. Check agents table for role = support_agent or agent, and is_active = TRUE.');
    }
    
    // 4. Tenant match
    const tenantId = ticket.tenant_id || 1;
    const matchingAgents = hasTenantId
      ? agents.filter(a => a.tenant_id === tenantId || a.tenant_id == null)
      : agents;
    console.log(`\n🎯 Agents matching ticket tenant_id ${tenantId}: ${matchingAgents.length}`);
    
    // 5. tickets.assigned_to FK
    const [fk] = await connection.execute(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets' AND COLUMN_NAME = 'assigned_to'
    `);
    console.log('\n🔗 tickets.assigned_to FK:', fk.length ? `→ ${fk[0].REFERENCED_TABLE_NAME}(${fk[0].REFERENCED_COLUMN_NAME})` : 'none');
    if (fk.length && fk[0].REFERENCED_TABLE_NAME === 'users') {
      console.log('   ⚠️ FK references users(id) but assignment uses agents - ensure agent ids exist in users or FK may block update.');
    }
    
    // 6. Try assignment
    console.log('\n🎯 Attempting assignment...');
    try {
      await TicketAssignmentService.assignTicketEqually(ticketId, null, tenantId);
      console.log('✅ Assignment successful!');
      const [updated] = await connection.execute(
        'SELECT assigned_to FROM tickets WHERE id = ?',
        [ticketId]
      );
      if (updated.length && updated[0].assigned_to) {
        const [a] = await connection.execute(
          'SELECT name, email FROM agents WHERE id = ?',
          [updated[0].assigned_to]
        );
        console.log(`   Assigned to: ${a.length ? a[0].name : updated[0].assigned_to}`);
      }
    } catch (err) {
      console.log('❌ Assignment failed:', err.message);
    }
    
    console.log('\n');
  } finally {
    connection.release();
    process.exit(0);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
