const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function assignTicketsToAgents() {
  let connection;
  try {
    console.log('🔍 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Connected to database');
    
    // Get all active agents
    const [agents] = await connection.execute('SELECT id, name, role FROM agents WHERE is_active = TRUE AND role = "support_agent"');
    console.log(`Found ${agents.length} support executives`);
    
    if (agents.length === 0) {
      console.log(' No support executives found');
      return;
    }
    
    // Get unassigned tickets
    const [unassignedTickets] = await connection.execute(`
      SELECT id, issue_title, status 
      FROM tickets 
      WHERE assigned_to IS NULL 
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${unassignedTickets.length} unassigned tickets`);
    
    if (unassignedTickets.length === 0) {
      console.log(' No unassigned tickets found');
      return;
    }
    
    // Assign tickets to agents in round-robin fashion
    let agentIndex = 0;
    for (const ticket of unassignedTickets) {
      const agent = agents[agentIndex % agents.length];
      
      await connection.execute(
        'UPDATE tickets SET assigned_to = ? WHERE id = ?',
        [agent.id, ticket.id]
      );
      
      console.log(`✅ Assigned Ticket #${ticket.id} ("${ticket.issue_title}") to Agent #${agent.id} (${agent.name})`);
      
      agentIndex++;
    }
    
    console.log('\n🎉 All tickets have been assigned!');
    
    // Show final assignment
    const [finalAssignments] = await connection.execute(`
      SELECT 
        t.id,
        t.issue_title,
        t.status,
        t.assigned_to,
        a.name as agent_name
      FROM tickets t
      LEFT JOIN agents a ON t.assigned_to = a.id
      ORDER BY t.created_at DESC
    `);
    
    console.log('\n📋 Final ticket assignments:');
    finalAssignments.forEach(ticket => {
      console.log(`- Ticket #${ticket.id}: "${ticket.issue_title}" (${ticket.status}) - Assigned to: ${ticket.agent_name || 'None'}`);
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

assignTicketsToAgents();
