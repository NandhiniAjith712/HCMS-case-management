const mysql = require('mysql2/promise');
require('dotenv').config({ path: './config.env' });

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function deleteAllTickets() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database successfully');

    // First, let's check what tables exist and their current ticket counts
    console.log('\n📊 Checking current database state...');
    
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('Available tables:', tables.map(t => Object.values(t)[0]));

    // Check ticket counts in relevant tables
    const [ticketCount] = await connection.execute('SELECT COUNT(*) as count FROM tickets');
    console.log(`Current tickets: ${ticketCount[0].count}`);

    const [assignedCount] = await connection.execute('SELECT COUNT(*) as count FROM assigned');
    console.log(`Current assignments: ${assignedCount[0].count}`);

    const [repliesCount] = await connection.execute('SELECT COUNT(*) as count FROM tick_system_replies');
    console.log(`Current replies: ${repliesCount[0].count}`);

    const [whatsappCount] = await connection.execute('SELECT COUNT(*) as count FROM tick_system_whatsapp_messages');
    console.log(`Current WhatsApp messages: ${whatsappCount[0].count}`);

    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will delete ALL tickets and related data!');
    console.log('This action cannot be undone.');
    console.log('\nTables that will be affected:');
    console.log('- tickets (main ticket data)');
    console.log('- assigned (ticket assignments)');
    console.log('- tick_system_replies (ticket replies)');
    console.log('- tick_system_whatsapp_messages (WhatsApp messages)');
    
    // For safety, we'll use a transaction and add a small delay
    console.log('\n🔄 Starting deletion process in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Start transaction
    await connection.beginTransaction();
    console.log('✅ Transaction started');

    // Delete in order to respect foreign key constraints
    console.log('\n🗑️  Deleting ticket assignments...');
    await connection.execute('DELETE FROM assigned');
    console.log('✅ Ticket assignments deleted');

    console.log('🗑️  Deleting ticket replies...');
    await connection.execute('DELETE FROM tick_system_replies');
    console.log('✅ Ticket replies deleted');

    console.log('🗑️  Deleting WhatsApp messages...');
    await connection.execute('DELETE FROM tick_system_whatsapp_messages');
    console.log('✅ WhatsApp messages deleted');

    console.log('🗑️  Deleting main tickets...');
    await connection.execute('DELETE FROM tickets');
    console.log('✅ Main tickets deleted');

    // Commit transaction
    await connection.commit();
    console.log('✅ Transaction committed successfully');

    // Verify deletion
    console.log('\n🔍 Verifying deletion...');
    
    const [newTicketCount] = await connection.execute('SELECT COUNT(*) as count FROM tickets');
    const [newAssignedCount] = await connection.execute('SELECT COUNT(*) as count FROM assigned');
    const [newRepliesCount] = await connection.execute('SELECT COUNT(*) as count FROM tick_system_replies');
    const [newWhatsappCount] = await connection.execute('SELECT COUNT(*) as count FROM tick_system_whatsapp_messages');

    console.log(`✅ Tickets after deletion: ${newTicketCount[0].count}`);
    console.log(`✅ Assignments after deletion: ${newAssignedCount[0].count}`);
    console.log(`✅ Replies after deletion: ${newRepliesCount[0].count}`);
    console.log(`✅ WhatsApp messages after deletion: ${newWhatsappCount[0].count}`);

    // Check if other important data is preserved
    console.log('\n🔍 Checking if other data is preserved...');
    
    const [agentsCount] = await connection.execute('SELECT COUNT(*) as count FROM agents');
    const [productsCount] = await connection.execute('SELECT COUNT(*) as count FROM sla_products');
    const [modulesCount] = await connection.execute('SELECT COUNT(*) as count FROM sla_modules');
    const [slaCount] = await connection.execute('SELECT COUNT(*) as count FROM sla_configurations');

    console.log(`✅ Agents preserved: ${agentsCount[0].count}`);
    console.log(`✅ Products preserved: ${productsCount[0].count}`);
    console.log(`✅ Modules preserved: ${modulesCount[0].count}`);
    console.log(`✅ SLA configurations preserved: ${slaCount[0].count}`);

    console.log('\n🎉 SUCCESS: All tickets deleted successfully!');
    console.log('✅ Database structure preserved');
    console.log('✅ Other data (agents, products, modules, SLA) preserved');
    console.log('✅ You can now test ticket creation and assignment functionality');

  } catch (error) {
    console.error(' Error during deletion:', error);
    
    if (connection) {
      try {
        await connection.rollback();
        console.log('🔄 Transaction rolled back due to error');
      } catch (rollbackError) {
        console.error(' Error rolling back transaction:', rollbackError);
      }
    }
    
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.end();
        console.log('🔌 Database connection closed');
      } catch (closeError) {
        console.error(' Error closing connection:', closeError);
      }
    }
  }
}

// Run the function
deleteAllTickets()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
