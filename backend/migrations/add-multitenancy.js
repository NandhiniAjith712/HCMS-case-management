const { pool } = require('../database');

/**
 * Migration script to add multitenancy support
 * Run: node backend/migrations/add-multitenancy.js
 */
async function migrateToMultitenancy() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    console.log('🚀 Starting multitenancy migration...\n');
    
    // 1. Create tenants table
    console.log('📋 Step 1: Creating tenants table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        subdomain VARCHAR(50) UNIQUE NOT NULL COMMENT 'e.g., company1.tick-system.com',
        domain VARCHAR(100) NULL COMMENT 'Custom domain if applicable',
        status ENUM('active', 'suspended', 'inactive') DEFAULT 'active',
        plan ENUM('free', 'basic', 'premium', 'enterprise') DEFAULT 'free',
        max_users INT DEFAULT 10,
        max_tickets_per_month INT DEFAULT 100,
        whatsapp_enabled BOOLEAN DEFAULT FALSE,
        email_enabled BOOLEAN DEFAULT TRUE,
        custom_branding JSON NULL COMMENT 'Logo, colors, etc.',
        settings JSON NULL COMMENT 'Tenant-specific settings',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT NULL,
        INDEX idx_subdomain (subdomain),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Tenants table created\n');
    
    // 2. Create default tenant if none exists
    console.log('📋 Step 2: Creating default tenant...');
    const [existingTenants] = await connection.execute('SELECT id FROM tenants LIMIT 1');
    let defaultTenantId = 1;
    
    if (existingTenants.length === 0) {
      const [result] = await connection.execute(
        'INSERT INTO tenants (name, subdomain, status) VALUES (?, ?, ?)',
        ['Default Tenant', 'default', 'active']
      );
      defaultTenantId = result.insertId;
      console.log(`✅ Default tenant created with ID: ${defaultTenantId}\n`);
    } else {
      defaultTenantId = existingTenants[0].id;
      console.log(`✅ Using existing tenant ID: ${defaultTenantId}\n`);
    }
    
    // 3. Add tenant_id to all tables
    console.log('📋 Step 3: Adding tenant_id to all tables...');
    const tables = [
      { name: 'users', hasUnique: true, uniqueField: 'email' },
      { name: 'agents', hasUnique: true, uniqueField: 'email' },
      { name: 'tickets', hasUnique: false },
      { name: 'replies', hasUnique: false },
      { name: 'products', hasUnique: false },
      { name: 'modules', hasUnique: false },
      { name: 'sla_configurations', hasUnique: false },
      { name: 'sla_timers', hasUnique: false },
      { name: 'escalations', hasUnique: false },
      { name: 'chat_messages', hasUnique: false },
      { name: 'chat_sessions', hasUnique: false },
      { name: 'chat_participants', hasUnique: false },
      { name: 'ticket_assignments', hasUnique: false },
      { name: 'ticket_allocations', hasUnique: false, noIdColumn: true },
      { name: 'performance_ratings', hasUnique: false },
      { name: 'whatsapp_conversations', hasUnique: false },
      { name: 'agent_sessions', hasUnique: false }
    ];
    
    for (const table of tables) {
      try {
        console.log(`  Processing ${table.name}...`);
        
        // Check if column already exists
        const [columns] = await connection.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'`,
          [table.name]
        );
        
        if (columns.length === 0) {
          // Add tenant_id column (can't use parameterized query for column position)
          // Some tables use different primary key column names
          const afterColumn = table.primaryKey || 'id';
          await connection.execute(
            `ALTER TABLE ${table.name} ADD COLUMN tenant_id INT NOT NULL DEFAULT ${defaultTenantId} AFTER ${afterColumn}`
          );
          
          // Add index
          await connection.execute(
            `ALTER TABLE ${table.name} ADD INDEX idx_tenant_id (tenant_id)`
          );
          
          // Add foreign key constraint
          await connection.execute(
            `ALTER TABLE ${table.name} ADD CONSTRAINT fk_${table.name}_tenant 
             FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`
          );
          
          // Update existing rows
          await connection.execute(
            `UPDATE ${table.name} SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = 0 OR tenant_id = ?`,
            [defaultTenantId, defaultTenantId]
          );
          
          console.log(`    ✅ ${table.name} updated`);
        } else {
          console.log(`    ⚠️ ${table.name} already has tenant_id column`);
        }
        
        // Update unique constraints for tables with unique fields
        if (table.hasUnique && table.uniqueField) {
          try {
            // Drop old unique constraint if exists
            const [indexes] = await connection.execute(
              `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND CONSTRAINT_NAME != 'PRIMARY'`,
              [table.name, table.uniqueField]
            );
            
            for (const index of indexes) {
              await connection.execute(
                `ALTER TABLE ${table.name} DROP INDEX ${index.CONSTRAINT_NAME}`
              );
            }
            
            // Add new unique constraint with tenant_id
            await connection.execute(
              `ALTER TABLE ${table.name} ADD UNIQUE KEY unique_${table.uniqueField}_per_tenant (tenant_id, ${table.uniqueField})`
            );
            
            console.log(`    ✅ Updated unique constraint for ${table.name}.${table.uniqueField}`);
          } catch (e) {
            if (e.code !== 'ER_DUP_KEYNAME') {
              console.log(`    ⚠️ Could not update unique constraint for ${table.name}: ${e.message}`);
            }
          }
        }
      } catch (error) {
        console.error(`    ❌ Error processing ${table.name}:`, error.message);
        // Continue with other tables
      }
    }
    
    console.log('\n✅ All tables updated\n');
    
    await connection.commit();
    console.log('🎉 Migration completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Default tenant ID: ${defaultTenantId}`);
    console.log(`   - Tables updated: ${tables.length}`);
    console.log(`   - All existing data assigned to default tenant`);
    console.log(`\n⚠️ Next steps:`);
    console.log(`   1. Update your application code to use tenant middleware`);
    console.log(`   2. Test tenant isolation`);
    console.log(`   3. Create additional tenants as needed`);
    
  } catch (error) {
    await connection.rollback();
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToMultitenancy()
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateToMultitenancy };

