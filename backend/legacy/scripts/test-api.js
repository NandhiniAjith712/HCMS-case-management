const http = require('http');

const makeRequest = (path) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
};

const testAPI = async () => {
  try {
    console.log('🧪 Testing API endpoints...');
    
    // Test SLA products endpoint
    console.log('\n1️⃣ Testing /api/sla/products...');
    const data = await makeRequest('/api/sla/products');
    
    if (data.success) {
      console.log('✅ API is working!');
      console.log(`📊 Found ${data.data.length} products:`);
      data.data.forEach(product => {
        console.log(`  - ${product.name} (ID: ${product.id}, Status: ${product.status})`);
      });
    } else {
      console.log('❌ API returned error:', data.message);
    }
    
    // Test health endpoint
    console.log('\n2️⃣ Testing /health...');
    const healthData = await makeRequest('/health');
    console.log('✅ Health check:', healthData.message);
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
  }
};

testAPI()
  .then(() => {
    console.log('\n🎉 API testing completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 API testing failed:', error);
    process.exit(1);
  }); 