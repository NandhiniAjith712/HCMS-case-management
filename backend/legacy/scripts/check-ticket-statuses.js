const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function checkTicketStatuses() {
  let connection;
  try {
    console.log('🔍 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Connected to database');
    
    // Check all ticket statuses
    console.log('\n📊 Checking ticket statuses...');
    const [tickets] = await connection.execute(`
      SELECT 
        id, 
        issue_title, 
        status, 
        assigned_to,
        product
      FROM tickets 
      ORDER BY id DESC
    `);
    
    console.log(`Total tickets: ${tickets.length}`);
    
    // Group by status
    const statusGroups = {};
    tickets.forEach(ticket => {
      if (!statusGroups[ticket.status]) {
        statusGroups[ticket.status] = [];
      }
      statusGroups[ticket.status].push(ticket);
    });
    
    console.log('\n📋 Tickets grouped by status:');
    Object.keys(statusGroups).forEach(status => {
      console.log(`\n${status}: ${statusGroups[status].length} tickets`);
      statusGroups[status].forEach(ticket => {
        console.log(`  - #${ticket.id}: "${ticket.issue_title}" (assigned to: ${ticket.assigned_to})`);
      });
    });
    
    // Check for agent #59 specifically
    console.log('\n👤 Tickets assigned to agent #59:');
    const agent59Tickets = tickets.filter(t => t.assigned_to === 59);
    agent59Tickets.forEach(ticket => {
      console.log(`  - #${ticket.id}: "${ticket.issue_title}" (${ticket.status})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

checkTicketStatuses();
