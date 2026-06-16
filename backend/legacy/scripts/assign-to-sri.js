const { pool } = require('./database');

async function assignToSri() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔧 Assigning all unassigned tickets to sri...');
    
    // Step 1: Find the user named "sri"
    console.log('\n👤 Step 1: Finding user named "sri"...');
    const [sriUsers] = await connection.execute(`
      SELECT id, name, email, role, is_active 
      FROM users 
      WHERE name LIKE '%sri%' AND is_active = TRUE
      ORDER BY id ASC
    `);
    
    if (sriUsers.length === 0) {
      console.log('❌ No user named "sri" found!');
      return;
    }
    
    const sri = sriUsers[0];
    console.log(`✅ Found user: ${sri.name} (ID: ${sri.id}) - ${sri.email} - Role: ${sri.role}`);
    
    // Step 2: Find all unassigned tickets
    console.log('\n📋 Step 2: Finding unassigned tickets...');
    const [unassignedTickets] = await connection.execute(`
      SELECT id, name, email, status, created_at 
      FROM tickets 
      WHERE assigned_to IS NULL AND status IN ('new', 'in_progress')
      ORDER BY created_at ASC
    `);
    
    console.log(`Found ${unassignedTickets.length} unassigned tickets`);
    
    if (unassignedTickets.length === 0) {
      console.log('✅ No unassigned tickets found - all tickets are assigned!');
      return;
    }
    
    // Step 3: Assign all tickets to sri
    console.log('\n🎯 Step 3: Assigning all tickets to sri...');
    let assignedCount = 0;
    
    for (const ticket of unassignedTickets) {
      try {
        // Update ticket assignment
        await connection.execute(
          'UPDATE tickets SET assigned_to = ?, assigned_by = ? WHERE id = ?',
          [sri.id, sri.id, ticket.id]
        );
        
        // Log assignment
        await connection.execute(
          `INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_reason) 
           VALUES (?, ?, ?, ?)`,
          [ticket.id, sri.id, sri.id, 'Assigned to sri - single support executive']
        );
        
        console.log(`✅ Ticket ${ticket.id} assigned to ${sri.name} (ID: ${sri.id})`);
        assignedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to assign ticket ${ticket.id}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Assignment completed: ${assignedCount} tickets assigned to ${sri.name}`);
    
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
      console.log('\n🎉 SUCCESS: All tickets are now assigned to sri!');
    } else {
      console.log(`\n⚠️ WARNING: ${stats.unassigned_tickets} tickets still unassigned`);
    }
    
  } catch (error) {
    console.error('❌ Error during assignment process:', error.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

// Run the assignment
assignToSri();
