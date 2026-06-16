const { pool } = require('./database');

const seedSLAData = async () => {
  try {
    console.log('🌱 Seeding SLA data...');
    const connection = await pool.getConnection();

    // Clear existing data
    await connection.execute('DELETE FROM sla_configurations');
    await connection.execute('DELETE FROM modules');
    await connection.execute('DELETE FROM products');

    // Insert sample products with SLA times
    const products = [
      {
        name: 'VOC (Voice of Customer)',
        description: 'Customer feedback and survey management system',
        sla_time_minutes: 480, // 8 hours
        priority_level: 'P2',
        status: 'active'
      },
      {
        name: 'GRC (Governance, Risk, Compliance)',
        description: 'Governance, risk management, and compliance platform',
        sla_time_minutes: 240, // 4 hours
        priority_level: 'P1',
        status: 'active'
      },
      {
        name: 'Authentication System',
        description: 'User authentication and authorization system',
        sla_time_minutes: 60, // 1 hour
        priority_level: 'P0',
        status: 'active'
      },
      {
        name: 'Financial Management',
        description: 'Financial reporting and management system',
        sla_time_minutes: 120, // 2 hours
        priority_level: 'P1',
        status: 'active'
      },
      {
        name: 'Reporting Tools',
        description: 'Business intelligence and reporting platform',
        sla_time_minutes: 480, // 8 hours
        priority_level: 'P2',
        status: 'active'
      },
      {
        name: 'Email System',
        description: 'Email management and communication system',
        sla_time_minutes: 30, // 30 minutes - for testing short SLA
        priority_level: 'P0',
        status: 'active'
      }
    ];

    for (const product of products) {
      const [result] = await connection.execute(`
        INSERT INTO products (name, description, sla_time_minutes, priority_level, status) 
        VALUES (?, ?, ?, ?, ?)
      `, [product.name, product.description, product.sla_time_minutes, product.priority_level, product.status]);
      
      const productId = result.insertId;
      console.log(`✅ Created product: ${product.name} (ID: ${productId})`);
      console.log(`   - SLA Time: ${product.sla_time_minutes} minutes`);
      console.log(`   - Priority: ${product.priority_level}`);
    }

    connection.release();
    console.log('✅ SLA data seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding SLA data:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seedSLAData()
    .then(() => {
      console.log('🎉 SLA seeding completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 SLA seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedSLAData }; 