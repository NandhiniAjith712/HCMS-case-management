const { pool } = require('./database');

async function checkProductNames() {
  try {
    console.log('🔍 Checking unique product names in tickets...');
    
    const [products] = await pool.execute(`
      SELECT DISTINCT product 
      FROM tickets 
      WHERE product IS NOT NULL AND product != '' 
      ORDER BY product
    `);
    
    console.log('📦 Unique product names in tickets:');
    products.forEach(p => {
      console.log(`  - "${p.product}"`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkProductNames(); 