const http = require('http');

const API_BASE = 'http://localhost:5000/api';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(body);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (error) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testSLAEndpoints() {
  console.log('🧪 Testing SLA Endpoints...\n');
  
  try {
    // Test 1: Get SLA configurations
    console.log('1️⃣ Testing GET /api/sla/configurations');
    const getResponse = await makeRequest('GET', '/api/sla/configurations');
    console.log('   Status:', getResponse.status);
    console.log('   Response:', getResponse.data);
    console.log('');
    
    // Test 2: Get products
    console.log('2️⃣ Testing GET /api/sla/products');
    const productsResponse = await makeRequest('GET', '/api/sla/products');
    console.log('   Status:', productsResponse.status);
    console.log('   Response:', productsResponse.data);
    console.log('');
    
    // Test 3: Get modules
    console.log('3️⃣ Testing GET /api/sla/modules');
    const modulesResponse = await makeRequest('GET', '/api/sla/modules');
    console.log('   Status:', modulesResponse.status);
    console.log('   Response:', modulesResponse.data);
    console.log('');
    
    // Test 4: Test PUT endpoint (if we have an existing SLA config)
    if (getResponse.data.success && getResponse.data.data && getResponse.data.data.length > 0) {
      const firstConfig = getResponse.data.data[0];
      console.log('4️⃣ Testing PUT /api/sla/configurations/:id');
      console.log('   Using config ID:', firstConfig.id);
      
      const updateData = {
        issue_name: firstConfig.issue_name + ' (Updated)',
        issue_description: 'Test update',
        response_time_minutes: firstConfig.response_time_minutes,
        resolution_time_minutes: firstConfig.resolution_time_minutes,
        priority_level: firstConfig.priority_level,
        is_active: firstConfig.is_active
      };
      
      const putResponse = await makeRequest('PUT', `/api/sla/configurations/${firstConfig.id}`, updateData);
      console.log('   Status:', putResponse.status);
      console.log('   Response:', putResponse.data);
      console.log('');
    } else {
      console.log('4️⃣ Skipping PUT test - no existing SLA configurations found');
      console.log('');
    }
    
    console.log('✅ SLA endpoint testing completed!');
    
  } catch (error) {
    console.error('❌ Error testing SLA endpoints:', error);
  }
}

// Run the test
testSLAEndpoints();
