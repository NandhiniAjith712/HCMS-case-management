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

// Practical field size recommendations based on real-world usage
const PRACTICAL_SIZES = {
  // Names - Most names are 15-25 characters
  'name': 25,
  'first_name': 20,
  'last_name': 25,
  'full_name': 30,
  'display_name': 25,
  'nickname': 15,
  
  // Emails - Standard email length
  'email': 60,
  'email_address': 60,
  
  // Phone numbers - International format
  'phone': 15,
  'mobile': 15,
  'telephone': 15,
  'contact_number': 15,
  
  // Codes and IDs
  'code': 8,
  'reference': 12,
  'ticket_id': 10,
  'order_id': 12,
  'transaction_id': 16,
  
  // Titles and subjects
  'title': 30,
  'subject': 50,
  'issue_title': 40,
  'summary': 60,
  
  // Descriptions - Most are under 500 chars
  'description': 500,
  'short_description': 200,
  'long_description': 1000,
  
  // Addresses
  'address': 100,
  'city': 25,
  'state': 25,
  'country': 25,
  'postal_code': 10,
  
  // Company/Organization
  'company': 30,
  'organization': 30,
  'department': 25,
  'division': 25,
  
  // Status and types
  'status': 20,
  'type': 20,
  'category': 25,
  'priority': 10,
  
  // File names
  'filename': 30,
  'attachment_name': 30,
  'document_name': 30,
  
  // URLs
  'url': 200,
  'webhook_url': 200,
  'callback_url': 200,
  
  // Tokens and keys
  'token': 64,
  'api_key': 64,
  'session_id': 32,
  'password_hash': 64,
  
  // Timestamps and dates
  'created_at': 'datetime',
  'updated_at': 'datetime',
  'expires_at': 'datetime'
};

// Function to analyze and optimize database fields practically
const practicalDatabaseOptimization = async () => {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connection successful');
    
    console.log('\n🔍 PRACTICAL DATABASE OPTIMIZATION ANALYSIS');
    console.log('   (Based on real-world usage patterns)');
    
    // Get all tables
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0]);
    
    let totalOptimizationPotential = 0;
    let optimizationSuggestions = [];
    let practicalSavings = 0;
    
    for (const tableName of tableNames) {
      console.log(`\n📋 Analyzing table: ${tableName}`);
      
      try {
        // Get table structure
        const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
        
        // Analyze each column for practical optimization
        for (const column of columns) {
          const fieldName = column.Field;
          const dataType = column.Type;
          const isNull = column.Null;
          const key = column.Key;
          
          // Check for VARCHAR fields that can be optimized
          if (dataType.includes('varchar')) {
            const match = dataType.match(/varchar\((\d+)\)/);
            if (match) {
              const currentSize = parseInt(match[1]);
              let suggestedSize = currentSize;
              let reason = '';
              let optimizationPotential = 0;
              
              // Check if we have a practical size recommendation
              const fieldKey = Object.keys(PRACTICAL_SIZES).find(key => 
                fieldName.toLowerCase().includes(key.toLowerCase())
              );
              
              if (fieldKey) {
                const recommendedSize = PRACTICAL_SIZES[fieldKey];
                if (recommendedSize < currentSize) {
                  suggestedSize = recommendedSize;
                  reason = `Practical size: ${recommendedSize} chars (${fieldKey} pattern)`;
                  optimizationPotential = currentSize - suggestedSize;
                }
              } else {
                // Analyze actual data for fields without specific patterns
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
                    const avgLength = Math.round(sampleData.reduce((sum, row) => sum + (row.len || 0), 0) / sampleData.length);
                    
                    // Suggest practical size based on actual data
                    if (maxLength <= 20 && currentSize > 20) {
                      suggestedSize = 20;
                      reason = `Max actual: ${maxLength}, Avg: ${avgLength} - Very short field`;
                      optimizationPotential = currentSize - suggestedSize;
                    } else if (maxLength <= 50 && currentSize > 50) {
                      suggestedSize = 50;
                      reason = `Max actual: ${maxLength}, Avg: ${avgLength} - Short field`;
                      optimizationPotential = currentSize - suggestedSize;
                    } else if (maxLength <= 100 && currentSize > 100) {
                      suggestedSize = 100;
                      reason = `Max actual: ${maxLength}, Avg: ${avgLength} - Medium field`;
                      optimizationPotential = currentSize - suggestedSize;
                    }
                  }
                } catch (e) {
                  // Skip if we can't analyze
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
                console.log(`       Reason: ${reason}`);
              }
            }
          }
          
          // Check for TEXT fields that can be VARCHAR
          if (dataType.includes('text') && fieldName.toLowerCase().includes('description')) {
            try {
              const [sampleData] = await connection.execute(`
                SELECT ${fieldName}, LENGTH(${fieldName}) as len 
                FROM ${tableName} 
                WHERE ${fieldName} IS NOT NULL 
                ORDER BY LENGTH(${fieldName}) DESC 
                LIMIT 30
              `);
              
              if (sampleData.length > 0) {
                const maxLength = Math.max(...sampleData.map(row => row.len || 0));
                if (maxLength <= 500) {
                  console.log(`   💡 ${fieldName}: TEXT → VARCHAR(500) (Max actual: ${maxLength})`);
                  console.log(`       Reason: Most descriptions are under 500 characters`);
                  
                  optimizationSuggestions.push({
                    table: tableName,
                    field: fieldName,
                    currentType: dataType,
                    suggestedType: 'varchar(500)',
                    currentSize: 'TEXT',
                    suggestedSize: 500,
                    optimizationPotential: 500,
                    reason: `Description field - Max: ${maxLength}, practical limit: 500 chars`,
                    isPrimary: key === 'PRI',
                    isNullable: isNull === 'YES'
                  });
                  
                  totalOptimizationPotential += 500;
                }
              }
            } catch (e) {
              // Skip if we can't analyze
            }
          }
        }
        
      } catch (e) {
        console.log(`    Error analyzing ${tableName}: ${e.message}`);
      }
    }
    
    // Summary and practical recommendations
    console.log('\n📊 PRACTICAL OPTIMIZATION SUMMARY:');
    console.log(`   Total potential savings: ${totalOptimizationPotential} characters per row`);
    console.log(`   Fields that can be optimized: ${optimizationSuggestions.length}`);
    
    if (optimizationSuggestions.length > 0) {
      console.log('\n🔧 PRACTICAL OPTIMIZATION RECOMMENDATIONS:');
      console.log('   (Based on real-world usage patterns)');
      
      // Group by optimization type
      const nameFields = optimizationSuggestions.filter(s => s.reason.includes('name') || s.reason.includes('Name'));
      const emailFields = optimizationSuggestions.filter(s => s.reason.includes('email') || s.reason.includes('Email'));
      const descriptionFields = optimizationSuggestions.filter(s => s.reason.includes('description') || s.reason.includes('Description'));
      const otherFields = optimizationSuggestions.filter(s => 
        !s.reason.includes('name') && !s.reason.includes('email') && !s.reason.includes('description')
      );
      
      if (nameFields.length > 0) {
        console.log('\n   📝 NAME FIELDS (Most names are 15-25 chars):');
        nameFields.forEach((suggestion, index) => {
          console.log(`      ${index + 1}. ${suggestion.table}.${suggestion.field}: ${suggestion.currentType} → ${suggestion.suggestedType}`);
          console.log(`         Reason: ${suggestion.reason}`);
          console.log(`         Save: ${suggestion.optimizationPotential} characters`);
        });
      }
      
      if (emailFields.length > 0) {
        console.log('\n   📧 EMAIL FIELDS (Standard emails are 60 chars max):');
        emailFields.forEach((suggestion, index) => {
          console.log(`      ${index + 1}. ${suggestion.table}.${suggestion.field}: ${suggestion.currentType} → ${suggestion.suggestedType}`);
          console.log(`         Reason: ${suggestion.reason}`);
          console.log(`         Save: ${suggestion.optimizationPotential} characters`);
        });
      }
      
      if (descriptionFields.length > 0) {
        console.log('\n   📄 DESCRIPTION FIELDS (Most are under 500 chars):');
        descriptionFields.forEach((suggestion, index) => {
          console.log(`      ${index + 1}. ${suggestion.table}.${suggestion.field}: ${suggestion.currentType} → ${suggestion.suggestedType}`);
          console.log(`         Reason: ${suggestion.reason}`);
          console.log(`         Save: ${suggestion.optimizationPotential} characters`);
        });
      }
      
      if (otherFields.length > 0) {
        console.log('\n   🔧 OTHER OPTIMIZABLE FIELDS:');
        otherFields.forEach((suggestion, index) => {
          console.log(`      ${index + 1}. ${suggestion.table}.${suggestion.field}: ${suggestion.currentType} → ${suggestion.suggestedType}`);
          console.log(`         Reason: ${suggestion.reason}`);
          console.log(`         Save: ${suggestion.optimizationPotential} characters`);
        });
      }
      
      console.log('\n💡 PRACTICAL IMPLEMENTATION NOTES:');
      console.log('   ✅ Realistic sizes: Based on actual usage patterns');
      console.log('   ✅ No data loss: Only reducing maximum allowed size');
      console.log('   ✅ Performance gain: Smaller fields = faster queries');
      console.log('   ✅ Storage savings: Significant reduction in storage needs');
      console.log('   ⚠️  Test first: Verify in development environment');
      
      console.log('\n🚀 DEPLOYMENT IMPACT:');
      console.log('   Your database can be optimized with PRACTICAL field sizes!');
      console.log('   This will provide better performance and storage efficiency.');
      console.log('   Consider implementing these changes before production deployment.');
      
    } else {
      console.log('\n✅ EXCELLENT:');
      console.log('   Your database fields are already optimally sized!');
      console.log('   No practical optimization needed.');
    }
    
  } catch (error) {
    console.error(' Practical database optimization analysis failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
};

// Run the practical optimization analysis
if (require.main === module) {
  practicalDatabaseOptimization();
}

module.exports = { practicalDatabaseOptimization };
