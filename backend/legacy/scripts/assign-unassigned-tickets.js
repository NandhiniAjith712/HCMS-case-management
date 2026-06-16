/**
 * Assign all unassigned tickets to available agents.
 * Uses agents table (support_agent role).
 * Handles all tenants including tenant_id NULL.
 * Run: node assign-unassigned-tickets.js
 */

const { pool } = require('./database');
const TicketAssignmentService = require('./utils/ticketAssignment');

async function main() {
  try {
    console.log('🎯 Assigning unassigned tickets...\n');
    const [tickets] = await pool.execute(
      `SELECT id, tenant_id FROM tickets 
       WHERE assigned_to IS NULL AND status IN ('new', 'in_progress', 'escalated') 
       ORDER BY created_at ASC`
    );
    if (tickets.length === 0) {
      console.log('✅ No unassigned tickets found.');
      process.exit(0);
      return;
    }
    console.log(`📋 Found ${tickets.length} unassigned tickets\n`);
    let total = 0;
    for (const t of tickets) {
      try {
        const tenantId = t.tenant_id || 1;
        await TicketAssignmentService.assignTicketEqually(t.id, null, tenantId);
        total++;
        console.log(`  ✅ Ticket #${t.id} assigned`);
      } catch (err) {
        console.warn(`  ⚠️ Ticket #${t.id}: ${err.message}`);
      }
    }
    console.log(`\n✅ ${total} tickets assigned. Refresh your Agent Dashboard to see them.`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

main();
