const { pool } = require('../../shared/database/database');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('🔄 Adding super_admin role to agents table...');

    // Add super_admin to the role enum in agents table
    await connection.execute(`
      ALTER TABLE agents
      MODIFY COLUMN role ENUM('support_agent', 'support_manager', 'ceo', 'super_admin') DEFAULT 'support_agent'
    `);

    console.log('✅ super_admin role added to agents table');

    // Update any existing super_admin or system_admin roles to super_admin
    await connection.execute(`
      UPDATE agents 
      SET role = 'super_admin' 
      WHERE role IN ('super_admin', 'system_admin')
    `);

    console.log('✅ Existing super_admin/system_admin roles normalized');

    await connection.commit();
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    await connection.rollback();
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    connection.release();
  }
}

migrate();
