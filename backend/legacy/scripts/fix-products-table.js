const { pool } = require('./database');

const fixProductsTable = async () => {
  try {
    console.log('🔧 Fixing Products Table Structure...');
    const connection = await pool.getConnection();
    
    // Add missing columns to products table
    const columnsToAdd = [
      { name: 'sla_time_minutes', type: 'INT NOT NULL DEFAULT 480 COMMENT "SLA time in minutes (8 hours default)"' },
      { name: 'priority_level', type: 'ENUM("P0", "P1", "P2", "P3") DEFAULT "P2"' },
      { name: 'escalation_time_minutes', type: 'INT DEFAULT 240 COMMENT "Time before escalation in minutes (4 hours default)"' },
      { name: 'escalation_level', type: 'ENUM("manager", "technical_manager", "ceo") DEFAULT "manager"' }
    ];
    
    for (const column of columnsToAdd) {
      try {
        await connection.execute(`ALTER TABLE products ADD COLUMN ${column.name} ${column.type}`);
        console.log(`✅ Added column: ${column.name}`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`ℹ️ Column ${column.name} already exists`);
        } else {
          console.error(`❌ Error adding column ${column.name}:`, error.message);
        }
      }
    }
    
    // Verify the table structure
    const [columns] = await connection.execute(`DESCRIBE products`);
    console.log('\n📋 Updated Products table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    
    connection.release();
    console.log('\n✅ Products table structure fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing products table:', error);
  }
};

fixProductsTable()
  .then(() => {
    console.log('🎉 Table structure fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Table structure fix failed:', error);
    process.exit(1);
  }); 