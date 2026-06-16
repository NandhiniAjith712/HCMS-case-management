const { pool } = require('./database');

/**
 * Script to check and fix the agents table structure and data
 */

async function fixAgentsTable() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Checking agents table structure...');
    
    // Check if agents table exists and has the correct structure
    const [tables] = await connection.execute('SHOW TABLES LIKE "agents"');
    
    if (tables.length === 0) {
      console.log('❌ Agents table does not exist!');
      return;
    }
    
    // Check table structure
    const [columns] = await connection.execute('DESCRIBE agents');
    console.log('📋 Current agents table structure:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Check if required columns exist
    const requiredColumns = ['id', 'name', 'email', 'password_hash', 'role', 'department', 'manager_id', 'is_active', 'created_at', 'last_login'];
    const existingColumns = columns.map(col => col.Field);
    
    console.log('\n🔍 Checking for missing columns...');
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('⚠️  Missing columns:', missingColumns);
      
      // Add missing columns
      for (const column of missingColumns) {
        try {
          let alterStatement = '';
          switch (column) {
            case 'email':
              alterStatement = 'ADD COLUMN email VARCHAR(100) UNIQUE';
              break;
            case 'role':
              alterStatement = 'ADD COLUMN role ENUM("support_agent", "support_manager", "admin") DEFAULT "support_agent"';
              break;
            case 'department':
              alterStatement = 'ADD COLUMN department VARCHAR(100)';
              break;
            case 'manager_id':
              alterStatement = 'ADD COLUMN manager_id INT';
              break;
            case 'is_active':
              alterStatement = 'ADD COLUMN is_active BOOLEAN DEFAULT TRUE';
              break;
            case 'created_at':
              alterStatement = 'ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP';
              break;
            case 'last_login':
              alterStatement = 'ADD COLUMN last_login DATETIME';
              break;
            default:
              console.log(`⚠️  Unknown column: ${column}`);
              continue;
          }
          
          await connection.execute(`ALTER TABLE agents ${alterStatement}`);
          console.log(`✅ Added column: ${column}`);
        } catch (error) {
          console.log(`⚠️  Could not add column ${column}:`, error.message);
        }
      }
    } else {
      console.log('✅ All required columns exist');
    }
    
    // Check existing agents data
    console.log('\n🔍 Checking existing agents data...');
    const [agents] = await connection.execute('SELECT * FROM agents');
    
    if (agents.length === 0) {
      console.log('📝 No agents found in the database');
    } else {
      console.log(`📝 Found ${agents.length} agents:`);
      agents.forEach(agent => {
        console.log(`  - ID: ${agent.id}, Name: ${agent.name}, Email: ${agent.email || 'N/A'}, Role: ${agent.role || 'N/A'}, Active: ${agent.is_active}`);
      });
      
      // Fix any agents with missing required fields
      console.log('\n🔧 Fixing agents with missing data...');
      for (const agent of agents) {
        const updates = [];
        const values = [];
        
        if (!agent.email) {
          updates.push('email = ?');
          values.push(`${agent.name.toLowerCase().replace(/\s+/g, '.')}@company.com`);
        }
        
        if (!agent.role) {
          updates.push('role = ?');
          values.push('support_agent');
        }
        
        if (!agent.is_active) {
          updates.push('is_active = ?');
          values.push(true);
        }
        
        if (updates.length > 0) {
          values.push(agent.id);
          await connection.execute(
            `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`,
            values
          );
          console.log(`✅ Fixed agent ${agent.name} (ID: ${agent.id})`);
        }
      }
    }
    
    console.log('\n🎯 Agents table check completed!');
    
  } catch (error) {
    console.error('❌ Error checking agents table:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Agents Table Fix Script');
    console.log('==========================');
    
    await fixAgentsTable();
    
    console.log('\n✅ Script completed successfully!');
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = {
  fixAgentsTable
};
