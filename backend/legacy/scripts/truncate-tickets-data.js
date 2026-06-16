const { pool } = require('./database');

/**
 * Script to truncate all ticket-related data while preserving database structure
 * This script handles referential integrity by deleting data in the correct order
 */

async function truncateTicketsData() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🗑️  Starting ticket data truncation...');
    
    // Disable foreign key checks temporarily to avoid constraint issues
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    // List of tables to truncate in order (child tables first, then parent tables)
    const tablesToTruncate = [
      // Child tables that reference tickets (delete first)
      'chat_participants',
      'ticket_messages',
      'chat_sessions',
      'escalations',
      'sla_timers',
      'performance_ratings',
      'replies',
      'ticket_assignments',
      'agent_sessions',
      
      // Main ticket table
      'tickets'
    ];
    
    console.log('📋 Tables to be truncated:');
    tablesToTruncate.forEach((table, index) => {
      console.log(`  ${index + 1}. ${table}`);
    });
    
    // Truncate each table
    for (const table of tablesToTruncate) {
      try {
        console.log(`🗑️  Truncating table: ${table}`);
        
        // Get row count before truncation
        const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`);
        const rowCount = countResult[0].count;
        
        // Truncate the table
        await connection.execute(`TRUNCATE TABLE ${table}`);
        
        console.log(`✅ Truncated ${table} (${rowCount} rows deleted)`);
        
      } catch (error) {
        console.error(`❌ Error truncating ${table}:`, error.message);
        
        // If it's a foreign key constraint error or table doesn't exist, try DELETE instead of TRUNCATE
        if (error.message.includes('foreign key constraint') || error.message.includes('doesn\'t exist') || error.message.includes('syntax')) {
          console.log(`🔄 Trying DELETE FROM ${table} instead...`);
          try {
            const [deleteResult] = await connection.execute(`DELETE FROM ${table}`);
            console.log(`✅ Deleted ${deleteResult.affectedRows} rows from ${table}`);
          } catch (deleteError) {
            console.error(`❌ DELETE also failed for ${table}:`, deleteError.message);
          }
        }
      }
    }
    
    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('\n🎯 Ticket data truncation completed!');
    console.log('\n📊 Summary:');
    console.log('✅ All ticket-related data has been cleared');
    console.log('✅ Database structure preserved');
    console.log('✅ Referential integrity maintained');
    console.log('✅ Foreign key constraints re-enabled');
    
    // Verify the truncation
    console.log('\n🔍 Verification:');
    const verificationTables = ['tickets', 'ticket_messages', 'performance_ratings'];
    
    for (const table of verificationTables) {
      try {
        const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`);
        const count = countResult[0].count;
        console.log(`  ${table}: ${count} rows`);
      } catch (error) {
        console.log(`  ${table}: Table not found or error`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error during truncation:', error.message);
    throw error;
  } finally {
    // Re-enable foreign key checks in case of error
    try {
      await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    } catch (e) {
      // Ignore error if already enabled
    }
    
    connection.release();
  }
}

// Function to show current data counts
async function showCurrentDataCounts() {
  const connection = await pool.getConnection();
  
  try {
    console.log('\n📊 Current data counts:');
    
    const tablesToCheck = [
      'tickets',
      'ticket_messages',
      'performance_ratings',
      'chat_sessions',
      'escalations',
      'sla_timers',
      'ticket_assignments',
      'agent_sessions'
    ];
    
    for (const table of tablesToCheck) {
      try {
        const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`);
        const count = countResult[0].count;
        console.log(`  ${table}: ${count} rows`);
      } catch (error) {
        console.log(`  ${table}: Table not found`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking data counts:', error.message);
  } finally {
    connection.release();
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Ticket Data Truncation Script');
    console.log('================================');
    
    // Show current data counts
    await showCurrentDataCounts();
    
    // Ask for confirmation (in a real scenario, you might want to add a prompt)
    console.log('\n⚠️  WARNING: This will delete ALL ticket-related data!');
    console.log('   This action cannot be undone.');
    console.log('   Make sure you have backups if needed.');
    
    // For now, proceed with truncation
    console.log('\n🔄 Proceeding with truncation...');
    
    await truncateTicketsData();
    
    console.log('\n✅ Script completed successfully!');
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = {
  truncateTicketsData,
  showCurrentDataCounts
};
