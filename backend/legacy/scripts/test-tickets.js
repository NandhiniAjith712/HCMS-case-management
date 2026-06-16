const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function testTickets() {
  let connection;
  try {
    console.log('🔍 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Connected to database');
    
    // Check if tickets table exists and has data
    console.log('\n📊 Checking tickets table...');
    const [tickets] = await connection.execute('SELECT COUNT(*) as count FROM tickets');
    console.log(`Total tickets: ${tickets[0].count}`);
    
    if (tickets[0].count > 0) {
      // Get sample tickets
      const [sampleTickets] = await connection.execute(`
        SELECT 
          id, 
          issue_title, 
          status, 
          assigned_to,
          created_at,
          product,
          user_id
        FROM tickets 
        ORDER BY created_at DESC 
        LIMIT 10
      `);
      
      console.log('\n📋 Sample tickets:');
      sampleTickets.forEach(ticket => {
        console.log(`- Ticket #${ticket.id}: "${ticket.issue_title}" (${ticket.status}) - Assigned to: ${ticket.assigned_to || 'None'}`);
      });
    }
    
    // Check agents table
    console.log('\n👥 Checking agents table...');
    const [agents] = await connection.execute('SELECT id, name, email, role FROM agents WHERE is_active = TRUE');
    console.log(`Active agents: ${agents.length}`);
    
    if (agents.length > 0) {
      console.log('\n👤 Active agents:');
      agents.forEach(agent => {
        console.log(`- Agent #${agent.id}: ${agent.name} (${agent.email}) - Role: ${agent.role}`);
      });
    }
    
    // Check if there are tickets assigned to agents
    console.log('\n🔗 Checking ticket assignments...');
    const [assignedTickets] = await connection.execute(`
      SELECT 
        t.id,
        t.issue_title,
        t.status,
        t.assigned_to,
        a.name as agent_name
      FROM tickets t
      LEFT JOIN agents a ON t.assigned_to = a.id
      WHERE t.assigned_to IS NOT NULL
      ORDER BY t.created_at DESC
      LIMIT 10
    `);
    
    console.log(`Tickets assigned to agents: ${assignedTickets.length}`);
    if (assignedTickets.length > 0) {
      console.log('\n📋 Assigned tickets:');
      assignedTickets.forEach(ticket => {
        console.log(`- Ticket #${ticket.id}: "${ticket.issue_title}" (${ticket.status}) - Assigned to: ${ticket.agent_name || 'Unknown'}`);
      });
    }
    
    // Check unassigned tickets
    console.log('\n🔍 Checking unassigned tickets...');
    const [unassignedTickets] = await connection.execute(`
      SELECT 
        id,
        issue_title,
        status,
        created_at
      FROM tickets
      WHERE assigned_to IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`Unassigned tickets: ${unassignedTickets.length}`);
    if (unassignedTickets.length > 0) {
      console.log('\n📋 Unassigned tickets:');
      unassignedTickets.forEach(ticket => {
        console.log(`- Ticket #${ticket.id}: "${ticket.issue_title}" (${ticket.status}) - Created: ${ticket.created_at}`);
      });
    }
    
  } catch (error) {
    console.error(' Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

testTickets();
