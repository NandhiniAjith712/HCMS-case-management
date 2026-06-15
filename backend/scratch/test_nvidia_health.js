require('dotenv').config({ path: './config.env' });
const { getNvidiaClient } = require('../services/nvidiaAiService');

async function run() {
  console.log('🧪 Starting NVIDIA AI health check...');
  try {
    const client = getNvidiaClient();
    const result = await client.healthCheck();
    console.log('📊 NVIDIA AI Health Check Result:', result);
  } catch (err) {
    console.error('❌ NVIDIA AI health check failed:', err);
  }
}

run();
