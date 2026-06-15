const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../config.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'itsm',
  port: process.env.DB_PORT || 3306
};

async function migrate() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    console.log('🚀 Running Department and Manager Hierarchy migrations...');

    // 1. Create departments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        name VARCHAR(100) NOT NULL,
        status ENUM('active','inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_departments_tenant_name (tenant_id, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Created departments table.');

    // 2. Seed default departments
    const defaultDepartments = ['HR', 'Marketing', 'Tech Support', 'Finance', 'Operations'];
    for (const dept of defaultDepartments) {
      try {
        await connection.execute(
          'INSERT IGNORE INTO departments (tenant_id, name) VALUES (1, ?)',
          [dept]
        );
      } catch (err) {
        console.warn(`Could not seed department ${dept}:`, err.message);
      }
    }
    console.log('✅ Seeded default departments.');

    // 3. Add primary_department_id to agents table if not exists
    const [agentCols] = await connection.execute('SHOW COLUMNS FROM agents');
    const agentColNames = agentCols.map(c => c.Field);
    if (!agentColNames.includes('primary_department_id')) {
      await connection.execute(`
        ALTER TABLE agents 
        ADD COLUMN primary_department_id INT NULL AFTER department,
        ADD CONSTRAINT fk_agents_primary_department FOREIGN KEY (primary_department_id) REFERENCES departments(id) ON DELETE SET NULL
      `);
      console.log('✅ Added primary_department_id to agents table.');
    } else {
      console.log('ℹ️ primary_department_id already exists in agents.');
    }

    // 4. Add primary_department_id to users table if not exists
    const [userCols] = await connection.execute('SHOW COLUMNS FROM users');
    const userColNames = userCols.map(c => c.Field);
    if (!userColNames.includes('primary_department_id')) {
      await connection.execute(`
        ALTER TABLE users 
        ADD COLUMN primary_department_id INT NULL AFTER department,
        ADD CONSTRAINT fk_users_primary_department FOREIGN KEY (primary_department_id) REFERENCES departments(id) ON DELETE SET NULL
      `);
      console.log('✅ Added primary_department_id to users table.');
    } else {
      console.log('ℹ️ primary_department_id already exists in users.');
    }

    // 5. Create manager_department_permissions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS manager_department_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manager_id INT NOT NULL,
        department_id INT NOT NULL,
        can_view TINYINT(1) DEFAULT 0,
        can_update TINYINT(1) DEFAULT 0,
        can_assign TINYINT(1) DEFAULT 0,
        can_close TINYINT(1) DEFAULT 0,
        can_view_reports TINYINT(1) DEFAULT 0,
        can_manage_escalations TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_manager_dept (manager_id, department_id),
        CONSTRAINT fk_mdp_manager FOREIGN KEY (manager_id) REFERENCES agents(id) ON DELETE CASCADE,
        CONSTRAINT fk_mdp_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Created manager_department_permissions table.');

    // 6. Add department_id column to tickets table if not exists (so tickets can have a department!)
    const [ticketCols] = await connection.execute('SHOW COLUMNS FROM tickets');
    const ticketColNames = ticketCols.map(c => c.Field);
    if (!ticketColNames.includes('department_id')) {
      await connection.execute(`
        ALTER TABLE tickets 
        ADD COLUMN department_id INT NULL AFTER module_id,
        ADD CONSTRAINT fk_tickets_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      `);
      console.log('✅ Added department_id to tickets table.');
    } else {
      console.log('ℹ️ department_id already exists in tickets.');
    }

    console.log('🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await connection.end();
  }
}

migrate();
