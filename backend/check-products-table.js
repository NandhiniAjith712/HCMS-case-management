const { pool } = require('./database');

const checkProductsTable = async () => {
  try {
    console.log('🔍 Checking Products Table...');
    const connection = await pool.getConnection();
    
    // Check if products table exists
    const [tables] = await connection.execute(`
      SHOW TABLES LIKE 'products'
    `);
    
    if (tables.length === 0) {
      console.log('❌ Products table does not exist!');
      return;
    }
    
    console.log('✅ Products table exists');
    
    // Get table structure
    const [columns] = await connection.execute(`
      DESCRIBE products
    `);
    
    console.log('📋 Products table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    
    // Check if table has data
    const [products] = await connection.execute(`
      SELECT COUNT(*) as count FROM products
    `);
    
    console.log(`📊 Total products: ${products[0].count}`);
    
    if (products[0].count > 0) {
      const [sampleProducts] = await connection.execute(`
        SELECT id, name, description, status FROM products LIMIT 3
      `);
      
      console.log('📋 Sample products:');
      sampleProducts.forEach(product => {
        console.log(`  - ${product.name} (ID: ${product.id}, Status: ${product.status})`);
      });
    }
    
    connection.release();
    console.log('✅ Products table check completed!');
    
  } catch (error) {
    console.error('❌ Error checking products table:', error);
  }
};

checkProductsTable()
  .then(() => {
    console.log('🎉 Check completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Check failed:', error);
    process.exit(1);
  }); 