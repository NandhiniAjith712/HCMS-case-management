const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function checkProductsAndCreateEscalatedTickets() {
  let connection;
  try {
    console.log('🔍 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Connected to database');
    
    // First, check what products exist
    console.log('\n📦 Checking existing products...');
    const [products] = await connection.execute('SELECT id, name FROM products WHERE status = \'active\'');
    console.log(`Found ${products.length} active products:`);
    products.forEach(product => {
      console.log(`  - ID: ${product.id}, Name: ${product.name}`);
    });
    
    if (products.length === 0) {
      console.log('❌ No active products found. Cannot create escalated tickets.');
      return;
    }
    
    // Use the first available product
    const productId = products[0].id;
    const productName = products[0].name;
    
    console.log(`\n📝 Creating escalated tickets using product: ${productName} (ID: ${productId})`);
    
    // Create escalated tickets with valid product_id
    const escalatedTickets = [
      {
        name: 'John Doe',
        email: 'john@example.com',
        mobile: '1234567890',
        product: productName,
        product_id: productId,
        module: 'Authentication',
        module_id: 1,
        description: 'Critical security issue - users can bypass authentication',
        issue_type: 'Security Breach',
        issue_title: 'CRITICAL: Authentication Bypass Vulnerability',
        status: 'escalated',
        user_id: 1,
        assigned_to: 59, // Assign to agent #59 (admin)
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        mobile: '0987654321',
        product: productName,
        product_id: productId,
        module: 'Payment System',
        module_id: 2,
        description: 'Payment processing completely down - customers cannot make purchases',
        issue_type: 'System Outage',
        issue_title: 'URGENT: Payment System Down - Revenue Impact',
        status: 'escalated',
        user_id: 2,
        assigned_to: 59, // Assign to agent #59 (admin)
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        mobile: '5555555555',
        product: productName,
        product_id: productId,
        module: 'Database',
        module_id: 3,
        description: 'Database corruption detected - data integrity at risk',
        issue_type: 'Data Loss',
        issue_title: 'EMERGENCY: Database Corruption Detected',
        status: 'escalated',
        user_id: 3,
        assigned_to: 38, // Assign to agent #38 (agent1)
        created_at: new Date(),
        updated_at: new Date()
      }
    ];
    
    for (const ticket of escalatedTickets) {
      const [result] = await connection.execute(`
        INSERT INTO tickets (
          name, email, mobile, product, product_id, module, module_id,
          description, issue_type, issue_title, status, user_id, assigned_to,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        ticket.name, ticket.email, ticket.mobile, ticket.product, ticket.product_id,
        ticket.module, ticket.module_id, ticket.description, ticket.issue_type,
        ticket.issue_title, ticket.status, ticket.user_id, ticket.assigned_to,
        ticket.created_at, ticket.updated_at
      ]);
      
      console.log(`✅ Created escalated ticket #${result.insertId}: "${ticket.issue_title}"`);
    }
    
    console.log('\n🎉 Escalated tickets created successfully!');
    
    // Show final ticket statuses
    const [finalTickets] = await connection.execute(`
      SELECT 
        id, 
        issue_title, 
        status, 
        assigned_to,
        created_at
      FROM tickets 
      ORDER BY id DESC
    `);
    
    console.log('\n📋 Final ticket statuses:');
    const statusGroups = {};
    finalTickets.forEach(ticket => {
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
    
    // Show escalated tickets for agent #59
    console.log('\n🚨 Escalated tickets for agent #59:');
    const agent59Escalated = finalTickets.filter(t => t.assigned_to === 59 && t.status === 'escalated');
    agent59Escalated.forEach(ticket => {
      console.log(`  - #${ticket.id}: "${ticket.issue_title}"`);
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

checkProductsAndCreateEscalatedTickets();
