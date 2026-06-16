const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function assignTicketsToAdmin() {
  let connection;
  try {
    console.log('🔍 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Connected to database');
    
    // Assign unassigned tickets to agent #59 (admin)
    console.log('📝 Assigning unassigned tickets to agent #59...');
    
    const [result] = await connection.execute(`
      UPDATE tickets 
      SET assigned_to = 59 
      WHERE assigned_to IS NULL OR assigned_to = 38
    `);
    
    console.log(`✅ Updated ${result.affectedRows} tickets to be assigned to agent #59`);
    
    // Show tickets for agent #59
    const [agent59Tickets] = await connection.execute(`
      SELECT 
        id, 
        issue_title, 
        status, 
        assigned_to,
        created_at
      FROM tickets 
      WHERE assigned_to = 59
      ORDER BY id DESC
    `);
    
    console.log('\n👤 Tickets now assigned to agent #59:');
    const statusGroups = {};
    agent59Tickets.forEach(ticket => {
      if (!statusGroups[ticket.status]) {
        statusGroups[ticket.status] = [];
      }
      statusGroups[ticket.status].push(ticket);
    });
    
    Object.keys(statusGroups).forEach(status => {
      console.log(`\n${status}: ${statusGroups[status].length} tickets`);
      statusGroups[status].forEach(ticket => {
        console.log(`  - #${ticket.id}: "${ticket.issue_title}"`);
      });
    });
    
    console.log(`\n🎉 Total tickets for agent #59: ${agent59Tickets.length}`);
    
  } catch (error) {
    console.error(' Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

assignTicketsToAdmin();
