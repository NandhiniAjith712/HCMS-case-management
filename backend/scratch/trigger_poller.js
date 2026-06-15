require('dotenv').config({ path: './config.env' });
const { processInbox } = require('../services/incomingEmailService');

async function run() {
  console.log('🚀 Manually triggering processInbox()...');
  try {
    await processInbox();
    console.log('✅ processInbox completed!');
  } catch (err) {
    console.error('❌ processInbox error:', err);
  }
}

run();
