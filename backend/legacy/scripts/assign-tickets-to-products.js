const mysql = require('mysql2/promise');
require('dotenv').config({ path: './config.env' });

async function assignTicketsToProducts() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ticketing_system'
    });

    console.log('🔧 Assigning tickets to products...\n');

    // Get available products
    const [products] = await connection.execute('SELECT id, name FROM products WHERE status = \'active\'');
    console.log('📦 Available products:');
    products.forEach(product => {
      console.log(`  ${product.id}: ${product.name}`);
    });

    // Get tickets without product_id
    const [ticketsWithoutProduct] = await connection.execute(`
      SELECT id, name, email, description, created_at 
      FROM tickets 
      WHERE product_id IS NULL OR product_id = 0
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log(`\n📊 Found ${ticketsWithoutProduct.length} tickets without product assignment`);

    if (ticketsWithoutProduct.length === 0) {
      console.log('✅ All tickets already have product assignments');
      return;
    }

    // Assign tickets to products in a round-robin fashion
    let productIndex = 0;
    for (const ticket of ticketsWithoutProduct) {
      const product = products[productIndex % products.length];
      
      await connection.execute(
        'UPDATE tickets SET product_id = ? WHERE id = ?',
        [product.id, ticket.id]
      );
      
      console.log(`✅ Assigned ticket ${ticket.id} (${ticket.name}) to ${product.name}`);
      
      productIndex++;
    }

    console.log('\n🎉 Successfully assigned tickets to products!');

    // Show updated statistics
    console.log('\n📊 Updated ticket distribution:');
    const [updatedStats] = await connection.execute(`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        COUNT(t.id) as ticket_count
      FROM products p
      LEFT JOIN tickets t ON p.id = t.product_id
      GROUP BY p.id, p.name
      ORDER BY p.id
    `);

    updatedStats.forEach(row => {
      console.log(`  ${row.product_name}: ${row.ticket_count} tickets`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

assignTicketsToProducts(); 