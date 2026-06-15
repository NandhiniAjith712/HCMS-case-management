const { pool } = require('./database');

async function setupSLATables() {
  try {
    console.log('🔄 Setting up SLA Management Tables...');
    
    // Create modules table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS modules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Modules table created');
    
    // Create SLA configurations table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sla_configurations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        module_id INT NOT NULL,
        issue_name VARCHAR(100) NOT NULL,
        issue_description TEXT,
        priority_level ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P2',
        response_time_minutes INT NOT NULL COMMENT 'Response time in minutes',
        resolution_time_minutes INT NOT NULL COMMENT 'Resolution time in minutes',
        is_active BOOLEAN DEFAULT TRUE,
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY unique_module_sla (module_id)
      )
    `);
    console.log('✅ SLA Configurations table created');
    
    // Check if we have any products to add sample data
    const [products] = await pool.execute('SELECT id FROM products LIMIT 1');
    
    if (products.length > 0) {
      const productId = products[0].id;
      
      // Add sample modules
      await pool.execute(`
        INSERT INTO modules (product_id, name, description, created_by) VALUES
        (?, 'User Authentication', 'Login, logout, password reset functionality', 1),
        (?, 'User Management', 'User creation, profile management, roles', 1),
        (?, 'Security', 'Access control, permissions, audit logs', 1)
      `, [productId, productId, productId]);
      console.log('✅ Sample modules added');
      
      // Get the created modules
      const [modules] = await pool.execute('SELECT id FROM modules WHERE product_id = ?', [productId]);
      
      if (modules.length > 0) {
        // Add sample SLA configurations
        await pool.execute(`
          INSERT INTO sla_configurations (product_id, module_id, issue_name, issue_description, priority_level, response_time_minutes, resolution_time_minutes, is_active, created_by) VALUES
          (?, ?, 'Login Issues', 'User cannot login to system', 'P1', 30, 60, 1, 1),
          (?, ?, 'Password Reset', 'User forgot password', 'P2', 60, 120, 1, 1),
          (?, ?, 'User Creation', 'New user account creation', 'P2', 120, 240, 1, 1),
          (?, ?, 'Security Breach', 'Critical security issues', 'P0', 15, 30, 1, 1)
        `, [productId, modules[0].id, productId, modules[0].id, productId, modules[1].id, productId, modules[2].id]);
        console.log('✅ Sample SLA configurations added');
      }
    }
    
    console.log('🎉 SLA Management Tables setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up SLA tables:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('ℹ️ Some data already exists, skipping...');
    } else {
      console.error('❌ Setup failed:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

setupSLATables(); 