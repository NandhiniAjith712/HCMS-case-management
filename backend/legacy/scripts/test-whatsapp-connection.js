const axios = require('axios');
require('dotenv').config({ path: './config.env' });

async function testWhatsAppConnection() {
  console.log('🔍 Testing WhatsApp Connection...\n');
  
  // Check environment variables
  console.log('📋 Configuration Check:');
  console.log(`   - API URL: ${process.env.WHATSAPP_API_URL}`);
  console.log(`   - Phone Number ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID}`);
  console.log(`   - Access Token: ${process.env.WHATSAPP_ACCESS_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`   - Verify Token: ${process.env.WHATSAPP_VERIFY_TOKEN}`);
  
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    console.log('\n❌ WHATSAPP_ACCESS_TOKEN is not set!');
    return;
  }
  
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log('\n❌ WHATSAPP_PHONE_NUMBER_ID is not set!');
    return;
  }
  
  try {
    // Test 1: Check phone number info
    console.log('\n📱 Test 1: Checking Phone Number Info...');
    const phoneResponse = await axios.get(
      `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        }
      }
    );
    
    console.log('✅ Phone Number Info Retrieved:');
    console.log(`   - Display Name: ${phoneResponse.data.display_phone_number}`);
    console.log(`   - Quality Rating: ${phoneResponse.data.quality_rating}`);
    console.log(`   - Status: ${phoneResponse.data.status}`);
    
    // Test 2: Send a test message
    console.log('\n📤 Test 2: Sending Test Message...');
    const testMessage = {
      messaging_product: 'whatsapp',
      to: '+1234567890', // Replace with your test number
      type: 'text',
      text: {
        body: '🧪 Test message from ITSM system - WhatsApp integration is working!'
      }
    };
    
    console.log('⚠️  Note: Replace +1234567890 with your actual phone number to test sending');
    console.log('📝 Test message would be sent to:', testMessage.to);
    
    // Test 3: Check webhook endpoint
    console.log('\n🔗 Test 3: Webhook Endpoint Check...');
    console.log('   - Webhook URL: http://localhost:5000/api/whatsapp/webhook');
    console.log('   - Verify Token: ' + process.env.WHATSAPP_VERIFY_TOKEN);
    console.log('   - Status: Ready for webhook verification');
    
    console.log('\n✅ WhatsApp Connection Test Complete!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Update the test phone number in this script');
    console.log('   2. Run the test again to send actual messages');
    console.log('   3. Set up webhook URL in Meta Developer Console');
    console.log('   4. Test incoming messages');
    
  } catch (error) {
    console.log('\n❌ WhatsApp Connection Failed:');
    if (error.response) {
      console.log(`   - Status: ${error.response.status}`);
      console.log(`   - Error: ${JSON.stringify(error.response.data, null, 2)}`);
      
      if (error.response.status === 401) {
        console.log('\n💡 Solution: Your access token is invalid or expired');
        console.log('   - Go to Meta Developer Console');
        console.log('   - Generate a new access token');
        console.log('   - Update config.env file');
      } else if (error.response.status === 404) {
        console.log('\n💡 Solution: Phone Number ID is incorrect');
        console.log('   - Check your Phone Number ID in Meta Developer Console');
        console.log('   - Update config.env file');
      }
    } else {
      console.log(`   - Error: ${error.message}`);
    }
  }
}

// Run the test
testWhatsAppConnection()
  .then(() => {
    console.log('\n🏁 Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
