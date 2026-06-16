const axios = require('axios');
require('dotenv').config({ path: './config.env' });

// WhatsApp API configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "521803094347148";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

console.log('🔍 WhatsApp Integration Test');
console.log('============================');
console.log(`API URL: ${WHATSAPP_API_URL}`);
console.log(`Phone Number ID: ${WHATSAPP_PHONE_NUMBER_ID}`);
console.log(`Access Token: ${WHATSAPP_ACCESS_TOKEN ? '✅ Set' : '❌ Not set'}`);
console.log('');

// Test configuration
async function testWhatsAppConfig() {
  try {
    console.log('📋 Testing WhatsApp Configuration...');
    
    if (!WHATSAPP_ACCESS_TOKEN) {
      console.log('❌ Access token is not set');
      return false;
    }
    
    if (!WHATSAPP_PHONE_NUMBER_ID) {
      console.log('❌ Phone number ID is not set');
      return false;
    }
    
    console.log('✅ Configuration looks good');
    return true;
  } catch (error) {
    console.log('❌ Configuration test failed:', error.message);
    return false;
  }
}

// Test API connection
async function testAPIConnection() {
  try {
    console.log('🌐 Testing API Connection...');
    
    const response = await axios.get(`${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}`, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ API connection successful');
    console.log('📊 Phone number info:', response.data);
    return true;
  } catch (error) {
    console.log('❌ API connection failed:');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    return false;
  }
}

// Test sending a message
async function testSendMessage() {
  try {
    console.log('📤 Testing Message Sending...');
    
    const testPhoneNumber = '+918825734812'; // Replace with your test number
    const testMessage = '🧪 Test message from ITSM system - ' + new Date().toISOString();
    
    console.log(`📱 Sending to: ${testPhoneNumber}`);
    console.log(`💬 Message: ${testMessage}`);
    
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: testPhoneNumber,
        type: 'text',
        text: {
          body: testMessage
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    console.log('✅ Message sent successfully!');
    console.log('📊 Response:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Message sending failed:');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting WhatsApp Integration Tests...\n');
  
  const configOk = await testWhatsAppConfig();
  if (!configOk) {
    console.log('\n❌ Configuration test failed. Please check your config.env file.');
    return;
  }
  
  console.log('');
  const apiOk = await testAPIConnection();
  if (!apiOk) {
    console.log('\n❌ API connection failed. Please check your credentials.');
    return;
  }
  
  console.log('');
  const messageOk = await testSendMessage();
  
  console.log('\n📊 Test Summary:');
  console.log('================');
  console.log(`Configuration: ${configOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API Connection: ${apiOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Message Sending: ${messageOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (configOk && apiOk && messageOk) {
    console.log('\n🎉 All tests passed! WhatsApp integration is working.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
  }
}

// Run the tests
runTests().catch(console.error); 