const { pool } = require('./database');

async function checkChatMessages() {
  try {
    console.log('🔍 Checking recent chat messages for ticket #19...\n');
    
    const [messages] = await pool.execute(`
      SELECT 
        id, 
        sender_name, 
        sender_type, 
        message, 
        created_at 
      FROM chat_messages 
      WHERE ticket_id = 19 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    if (messages.length === 0) {
      console.log('❌ No chat messages found for ticket #19');
      return;
    }
    
    console.log(`📝 Found ${messages.length} chat messages:\n`);
    messages.forEach((m, index) => {
      console.log(`${index + 1}. ID: ${m.id}`);
      console.log(`   👤 Sender: ${m.sender_name} (${m.sender_type})`);
      console.log(`   💬 Message: ${m.message.substring(0, 60)}${m.message.length > 60 ? '...' : ''}`);
      console.log(`   ⏰ Created: ${m.created_at}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkChatMessages();
