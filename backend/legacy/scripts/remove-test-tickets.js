const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function removeTestEscalatedTickets() {
  let connection;
  try {
    console.log('🔍 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Connected to database');
    
    // Remove the test escalated tickets I created
    console.log('🗑️ Removing test escalated tickets...');
    
    const [result] = await connection.execute(`
      DELETE FROM tickets 
      WHERE issue_title IN (
        'CRITICAL: Authentication Bypass Vulnerability',
        'URGENT: Payment System Down - Revenue Impact', 
        'EMERGENCY: Database Corruption Detected'
      )
    `);
    
    console.log(`✅ Removed ${result.affectedRows} test escalated tickets`);
    
    // Show remaining tickets
    const [remainingTickets] = await connection.execute(`
      SELECT 
        id, 
        issue_title, 
        status, 
        assigned_to
      FROM tickets 
      ORDER BY id DESC
    `);
    
    console.log('\n📋 Remaining tickets:');
    const statusGroups = {};
    remainingTickets.forEach(ticket => {
      if (!statusGroups[ticket.status]) {
        statusGroups[ticket.status] = [];
      }
      statusGroups[ticket.status].push(ticket);
    });
    
    Object.keys(statusGroups).forEach(status => {
      console.log(`\n${status}: ${statusGroups[status].length} tickets`);
      statusGroups[status].forEach(ticket => {
        console.log(`  - #${ticket.id}: "${ticket.issue_title}" (assigned to: ${ticket.assigned_to})`);
      });
    });
    
  } catch (error) {
    console.error(' Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

removeTestEscalatedTickets();
