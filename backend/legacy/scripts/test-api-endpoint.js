const fetch = require('node-fetch');

async function testApiEndpoint() {
  try {
    console.log('🔍 Testing API endpoint...');
    
    const testData = {
      name: 'admin',
      password: 'admin123'
    };
    
    console.log('📝 Sending test data:', testData);
    
    const response = await fetch('http://localhost:5000/api/agents/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log('📡 Response status:', response.status);
    
    const data = await response.json();
    console.log('📥 Response data:', data);
    
    if (response.ok) {
      console.log('✅ API test successful!');
    } else {
      console.log('❌ API test failed:', data.message);
    }
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
  }
}

testApiEndpoint().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
