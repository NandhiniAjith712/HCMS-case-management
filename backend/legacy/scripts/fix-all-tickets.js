const { pool } = require('./database');

async function fixAllTickets() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔧 Fixing all ticket assignment issues...');
    console.log('=====================================');
    
    // Step 1: Check current unassigned tickets
    console.log('\n📋 Step 1: Checking current unassigned tickets...');
    const [unassignedTickets] = await connection.execute(`
      SELECT id, name, email, status, assigned_to, created_at 
      FROM tickets 
      WHERE assigned_to IS NULL AND status IN ('new', 'in_progress')
      ORDER BY created_at ASC
    `);
    
    console.log(`Found ${unassignedTickets.length} unassigned tickets`);
    
    if (unassignedTickets.length === 0) {
      console.log('✅ No unassigned tickets found - all tickets are assigned!');
      return;
    }
    
    // Step 2: Check available support executives
    console.log('\n👥 Step 2: Checking available support executives...');
    const [supportExecutives] = await connection.execute(`
      SELECT id, name, email, role, is_active
      FROM users 
      WHERE role = 'support_agent' AND is_active = TRUE
      ORDER BY id ASC
    `);
    
    console.log(`Found ${supportExecutives.length} active support executives:`);
    supportExecutives.forEach(exec => {
      console.log(`  - ${exec.name} (ID: ${exec.id}) - ${exec.email}`);
    });
    
    if (supportExecutives.length === 0) {
      console.log('❌ No support executives found! Cannot assign tickets.');
      return;
    }
    
    // Step 3: Assign tickets using round-robin method
    console.log('\n🎯 Step 3: Assigning tickets to support executives...');
    let assignedCount = 0;
    
    for (let i = 0; i < unassignedTickets.length; i++) {
      const ticket = unassignedTickets[i];
      const executive = supportExecutives[i % supportExecutives.length]; // Round-robin assignment
      
      try {
        // Update ticket assignment
        await connection.execute(
          'UPDATE tickets SET assigned_to = ?, assigned_by = ? WHERE id = ?',
          [executive.id, executive.id, ticket.id]
        );
        
        // Log assignment
        await connection.execute(
          `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_reason) 
           VALUES (?, ?, ?, ?)`,
          [ticket.id, executive.id, executive.id, 'Manual assignment fix']
        );
        
        console.log(`✅ Ticket ${ticket.id} assigned to ${executive.name} (ID: ${executive.id})`);
        assignedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to assign ticket ${ticket.id}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Assignment completed: ${assignedCount} tickets assigned`);
    
    // Step 4: Verify assignments
    console.log('\n🔍 Step 4: Verifying assignments...');
    const [verificationTickets] = await connection.execute(`
      SELECT t.id, t.name, t.status, t.assigned_to, u.name as assigned_to_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id IN (${unassignedTickets.map(t => t.id).join(',')})
    `);
    
    console.log('Verification results:');
    verificationTickets.forEach(ticket => {
      if (ticket.assigned_to_name) {
        console.log(`  ✅ Ticket ${ticket.id}: Assigned to ${ticket.assigned_to_name}`);
      } else {
        console.log(`  ❌ Ticket ${ticket.id}: Still unassigned`);
      }
    });
    
    // Step 5: Final check
    console.log('\n📊 Step 5: Final status check...');
    const [finalCheck] = await connection.execute(`
      SELECT COUNT(*) as total_tickets,
             COUNT(assigned_to) as assigned_tickets,
             COUNT(*) - COUNT(assigned_to) as unassigned_tickets
      FROM tickets 
      WHERE status IN ('new', 'in_progress')
    `);
    
    const stats = finalCheck[0];
    console.log(`Total active tickets: ${stats.total_tickets}`);
    console.log(`Assigned tickets: ${stats.assigned_tickets}`);
    console.log(`Unassigned tickets: ${stats.unassigned_tickets}`);
    
    if (stats.unassigned_tickets === 0) {
      console.log('\n🎉 SUCCESS: All tickets are now assigned!');
    } else {
      console.log(`\n⚠️ WARNING: ${stats.unassigned_tickets} tickets still unassigned`);
    }
    
  } catch (error) {
    console.error('❌ Error during fix process:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

// Run the fix
fixAllTickets();
