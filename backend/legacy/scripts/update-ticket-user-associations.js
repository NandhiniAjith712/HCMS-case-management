const { pool } = require('./database');

async function updateTicketUserAssociations() {
  try {
    console.log('🔄 Starting ticket user association update...');
    
    // Get all tickets that don't have a user_id
    const [ticketsWithoutUser] = await pool.execute(
      'SELECT id, email FROM tickets WHERE user_id IS NULL AND email IS NOT NULL'
    );
    
    console.log(`📊 Found ${ticketsWithoutUser.length} tickets without user associations`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const ticket of ticketsWithoutUser) {
      try {
        // Find user by email
        const [users] = await pool.execute(
          'SELECT id FROM users WHERE email = ?',
          [ticket.email]
        );
        
        if (users.length > 0) {
          // Update ticket with user_id
          await pool.execute(
            'UPDATE tickets SET user_id = ? WHERE id = ?',
            [users[0].id, ticket.id]
          );
          updatedCount++;
          console.log(`✅ Updated ticket ${ticket.id} (${ticket.email}) -> user ${users[0].id}`);
        } else {
          // Create new user for this email
          const [newUser] = await pool.execute(
            'INSERT INTO users (email, name, role) VALUES (?, ?, ?)',
            [ticket.email, ticket.email.split('@')[0], 'user']
          );
          
          // Update ticket with new user_id
          await pool.execute(
            'UPDATE tickets SET user_id = ? WHERE id = ?',
            [newUser.insertId, ticket.id]
          );
          updatedCount++;
          console.log(`✅ Created user for ${ticket.email} and updated ticket ${ticket.id}`);
        }
      } catch (error) {
        console.error(`❌ Error updating ticket ${ticket.id}:`, error.message);
        skippedCount++;
      }
    }
    
    console.log('\n📊 Update Summary:');
    console.log(`✅ Successfully updated: ${updatedCount} tickets`);
    console.log(`⏭️ Skipped: ${skippedCount} tickets`);
    console.log(`📋 Total processed: ${ticketsWithoutUser.length} tickets`);
    
    // Verify the update
    const [remainingTickets] = await pool.execute(
      'SELECT COUNT(*) as count FROM tickets WHERE user_id IS NULL'
    );
    console.log(`🔍 Remaining tickets without user_id: ${remainingTickets[0].count}`);
    
  } catch (error) {
    console.error('❌ Error in update process:', error);
  } finally {
    await pool.end();
  }
}

// Run the update
updateTicketUserAssociations().catch(console.error); 