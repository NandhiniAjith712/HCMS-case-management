const { pool } = require('./database');
const fs = require('fs');
const path = require('path');

async function runSQLScript() {
  try {
    console.log('🔧 Running SQL script to add response/resolution time fields...');
    
    // Read the SQL script
    const sqlScript = fs.readFileSync(path.join(__dirname, 'add-response-resolution-fields.sql'), 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('📝 Executing:', statement.trim().substring(0, 50) + '...');
        await pool.execute(statement.trim());
      }
    }
    
    console.log('✅ SQL script executed successfully!');
    console.log('📊 Added fields: first_response_at, resolved_at');
    console.log('📊 Added indexes for better performance');
    console.log('📊 Updated existing tickets with timestamps');
    
  } catch (error) {
    console.error('❌ Error running SQL script:', error);
  } finally {
    process.exit(0);
  }
}

runSQLScript();
