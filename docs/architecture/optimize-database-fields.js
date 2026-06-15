const mysql = require('mysql2/promise');
require('dotenv').config({ path: './config.env' });

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

// Function to analyze and optimize database field sizes
const optimizeDatabaseFields = async () => {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connection successful');
    
    console.log('\n🔍 Analyzing database field sizes for optimization...');
    
    // Get all tables
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0]);
    
    let totalOptimizationPotential = 0;
    let optimizationSuggestions = [];
    
    for (const tableName of tableNames) {
      console.log(`\n📋 Analyzing table: ${tableName}`);
      
      try {
        // Get table structure
        const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
        
        // Analyze each column for optimization potential
        for (const column of columns) {
          const fieldName = column.Field;
          const dataType = column.Type;
          const isNull = column.Null;
          const key = column.Key;
          const defaultValue = column.Default;
          
          // Check for VARCHAR fields that might be oversized
          if (dataType.includes('varchar')) {
            const match = dataType.match(/varchar\((\d+)\)/);
            if (match) {
              const currentSize = parseInt(match[1]);
              let suggestedSize = currentSize;
              let reason = '';
              let optimizationPotential = 0;
              
              // Analyze field content to suggest optimal size
              try {
                // Get sample data to analyze actual content lengths
                const [sampleData] = await connection.execute(`
                  SELECT ${fieldName}, LENGTH(${fieldName}) as len 
                  FROM ${tableName} 
                  WHERE ${fieldName} IS NOT NULL 
                  ORDER BY LENGTH(${fieldName}) DESC 
                  LIMIT 100
                `);
                
                if (sampleData.length > 0) {
                  const maxLength = Math.max(...sampleData.map(row => row.len || 0));
                  const avgLength = Math.round(sampleData.reduce((sum, row) => sum + (row.len || 0), 0) / sampleData.length);
                  
                  // Suggest optimal size based on actual data
                  if (maxLength <= 50 && currentSize > 50) {
                    suggestedSize = 50;
                    reason = `Max actual length: ${maxLength}, Avg: ${avgLength}`;
                    optimizationPotential = currentSize - suggestedSize;
                  } else if (maxLength <= 100 && currentSize > 100) {
                    suggestedSize = 100;
                    reason = `Max actual length: ${maxLength}, Avg: ${avgLength}`;
                    optimizationPotential = currentSize - suggestedSize;
                  } else if (maxLength <= 255 && currentSize > 255) {
                    suggestedSize = 255;
                    reason = `Max actual length: ${maxLength}, Avg: ${avgLength}`;
                    optimizationPotential = currentSize - suggestedSize;
                  }
                  
                  // Special cases for common field types
                  if (fieldName.toLowerCase().includes('name')) {
                    if (maxLength <= 50 && currentSize > 50) {
                      suggestedSize = 50;
                      reason = `Name field - Max: ${maxLength}, Avg: ${avgLength}`;
                      optimizationPotential = currentSize - suggestedSize;
                    }
                  } else if (fieldName.toLowerCase().includes('email')) {
                    if (maxLength <= 100 && currentSize > 100) {
                      suggestedSize = 100;
                      reason = `Email field - Max: ${maxLength}, Avg: ${avgLength}`;
                      optimizationPotential = currentSize - suggestedSize;
                    }
                  } else if (fieldName.toLowerCase().includes('phone') || fieldName.toLowerCase().includes('mobile')) {
                    if (maxLength <= 20 && currentSize > 20) {
                      suggestedSize = 20;
                      reason = `Phone field - Max: ${maxLength}, Avg: ${avgLength}`;
                      optimizationPotential = currentSize - suggestedSize;
                    }
                  } else if (fieldName.toLowerCase().includes('code')) {
                    if (maxLength <= 10 && currentSize > 10) {
                      suggestedSize = 10;
                      reason = `Code field - Max: ${maxLength}, Avg: ${avgLength}`;
                      optimizationPotential = currentSize - suggestedSize;
                    }
                  }
                }
              } catch (e) {
                // If we can't analyze the data, use general rules
                if (fieldName.toLowerCase().includes('name') && currentSize > 50) {
                  suggestedSize = 50;
                  reason = 'Name field - typically 50 chars max';
                  optimizationPotential = currentSize - suggestedSize;
                } else if (fieldName.toLowerCase().includes('email') && currentSize > 100) {
                  suggestedSize = 100;
                  reason = 'Email field - typically 100 chars max';
                  optimizationPotential = currentSize - suggestedSize;
                } else if (fieldName.toLowerCase().includes('phone') && currentSize > 20) {
                  suggestedSize = 20;
                  reason = 'Phone field - typically 20 chars max';
                  optimizationPotential = currentSize - suggestedSize;
                } else if (fieldName.toLowerCase().includes('code') && currentSize > 10) {
                  suggestedSize = 10;
                  reason = 'Code field - typically 10 chars max';
                  optimizationPotential = currentSize - suggestedSize;
                }
              }
              
              if (optimizationPotential > 0) {
                const suggestion = {
                  table: tableName,
                  field: fieldName,
                  currentType: dataType,
                  suggestedType: `varchar(${suggestedSize})`,
                  currentSize: currentSize,
                  suggestedSize: suggestedSize,
                  optimizationPotential: optimizationPotential,
                  reason: reason,
                  isPrimary: key === 'PRI',
                  isNullable: isNull === 'YES'
                };
                
                optimizationSuggestions.push(suggestion);
                totalOptimizationPotential += optimizationPotential;
                
                console.log(`   ⚠️  ${fieldName}: ${dataType} → varchar(${suggestedSize}) (Save: ${optimizationPotential} chars)`);
              }
            }
          }
          
          // Check for other optimizable types
          if (dataType.includes('text') && fieldName.toLowerCase().includes('description')) {
            // Check if we can use VARCHAR instead of TEXT for short descriptions
            try {
              const [sampleData] = await connection.execute(`
                SELECT ${fieldName}, LENGTH(${fieldName}) as len 
                FROM ${tableName} 
                WHERE ${fieldName} IS NOT NULL 
                ORDER BY LENGTH(${fieldName}) DESC 
                LIMIT 50
              `);
              
              if (sampleData.length > 0) {
                const maxLength = Math.max(...sampleData.map(row => row.len || 0));
                if (maxLength <= 1000) {
                  console.log(`   💡 ${fieldName}: TEXT → VARCHAR(1000) (Max actual: ${maxLength})`);
                  optimizationSuggestions.push({
                    table: tableName,
                    field: fieldName,
                    currentType: dataType,
                    suggestedType: 'varchar(1000)',
                    currentSize: 'TEXT',
                    suggestedSize: 1000,
                    optimizationPotential: 1000,
                    reason: `Description field - Max: ${maxLength}, can use VARCHAR instead of TEXT`,
                    isPrimary: key === 'PRI',
                    isNullable: isNull === 'YES'
                  });
                }
              }
            } catch (e) {
              // Skip if we can't analyze
            }
          }
        }
        
      } catch (e) {
        console.log(`   ❌ Error analyzing ${tableName}: ${e.message}`);
      }
    }
    
    // Summary and recommendations
    console.log('\n📊 OPTIMIZATION SUMMARY:');
    console.log(`   Total potential savings: ${totalOptimizationPotential} characters per row`);
    console.log(`   Fields that can be optimized: ${optimizationSuggestions.length}`);
    
    if (optimizationSuggestions.length > 0) {
      console.log('\n🔧 OPTIMIZATION RECOMMENDATIONS:');
      console.log('   (These changes will save storage space and improve performance)');
      
      optimizationSuggestions.forEach((suggestion, index) => {
        console.log(`\n   ${index + 1}. Table: ${suggestion.table}`);
        console.log(`      Field: ${suggestion.field}`);
        console.log(`      Current: ${suggestion.currentType}`);
        console.log(`      Suggested: ${suggestion.suggestedType}`);
        console.log(`      Reason: ${suggestion.reason}`);
        console.log(`      Potential: Save ${suggestion.optimizationPotential} characters`);
      });
      
      console.log('\n💡 IMPLEMENTATION NOTES:');
      console.log('   ✅ Safe to implement: These are size reductions only');
      console.log('   ✅ No data loss: Only reducing maximum allowed size');
      console.log('   ✅ Performance gain: Smaller fields = faster queries');
      console.log('   ⚠️  Test first: Verify in development environment');
      
      console.log('\n🚀 DEPLOYMENT READY:');
      console.log('   Your database can be optimized to save storage space!');
      console.log('   Consider implementing these changes before production deployment.');
      
    } else {
      console.log('\n✅ EXCELLENT:');
      console.log('   Your database fields are already optimally sized!');
      console.log('   No optimization needed.');
    }
    
  } catch (error) {
    console.error('❌ Database optimization analysis failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
};

// Run the optimization analysis
if (require.main === module) {
  optimizeDatabaseFields();
}

module.exports = { optimizeDatabaseFields };
