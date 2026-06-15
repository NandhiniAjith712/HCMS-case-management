const { pool } = require('./database');

async function addCustomerRepliesSupport() {
  try {
    console.log('🔄 Adding customer replies support to replies table...');
    
    // Add new columns to support customer replies
    await pool.execute(`
      ALTER TABLE replies 
      ADD COLUMN customer_name VARCHAR(100) NULL AFTER agent_name,
      ADD COLUMN is_customer_reply BOOLEAN DEFAULT FALSE AFTER message
    `);
    
    console.log('✅ Successfully added customer replies support to replies table');
    
    // Update existing replies to mark them as agent replies
    await pool.execute(`
      UPDATE replies 
      SET is_customer_reply = FALSE 
      WHERE is_customer_reply IS NULL
    `);
    
    console.log('✅ Updated existing replies to mark as agent replies');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding customer replies support:', error);
    process.exit(1);
  }
}

addCustomerRepliesSupport(); 