const { pool } = require('./database');

async function checkTicketProducts() {
  try {
    console.log('🔍 Checking ticket product associations...');
    
    // Get all tickets with their product information
    const [tickets] = await pool.execute(`
      SELECT id, name, email, product, product_id, status, created_at 
      FROM tickets 
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Found ${tickets.length} tickets`);
    
    // Group tickets by product
    const productStats = {};
    
    tickets.forEach(ticket => {
      const productKey = ticket.product_id || ticket.product || 'Unknown';
      if (!productStats[productKey]) {
        productStats[productKey] = {
          count: 0,
          tickets: []
        };
      }
      productStats[productKey].count++;
      productStats[productKey].tickets.push({
        id: ticket.id,
        name: ticket.name,
        email: ticket.email,
        status: ticket.status,
        product: ticket.product,
        product_id: ticket.product_id
      });
    });
    
    console.log('\n📦 Product Statistics:');
    Object.entries(productStats).forEach(([product, stats]) => {
      console.log(`\n${product}:`);
      console.log(`  Total tickets: ${stats.count}`);
      console.log(`  Sample tickets:`, stats.tickets.slice(0, 3).map(t => `#${t.id} (${t.status})`));
    });
    
    // Check for tickets without product_id
    const ticketsWithoutProductId = tickets.filter(t => !t.product_id);
    if (ticketsWithoutProductId.length > 0) {
      console.log(`\n⚠️ Found ${ticketsWithoutProductId.length} tickets without product_id:`);
      ticketsWithoutProductId.slice(0, 5).forEach(ticket => {
        console.log(`  Ticket #${ticket.id}: ${ticket.name} (${ticket.email}) - Product: "${ticket.product}"`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking ticket products:', error);
  } finally {
    process.exit(0);
  }
}

checkTicketProducts(); 