// Simulate what the frontend is doing
async function testFrontendAPI() {
  try {
    console.log('🔍 Testing Frontend API Call Simulation...\n');
    
    // Simulate the frontend's fetchSLAConfigurations function
    console.log('1️⃣ Calling SLA API endpoint...');
    const response = await fetch('http://localhost:5000/api/sla/configurations');
    
    console.log('2️⃣ Response status:', response.status);
    console.log('3️⃣ Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const result = await response.json();
      console.log('4️⃣ Response data:', JSON.stringify(result, null, 2));
      
      if (result.success) {
        console.log('\n5️⃣ Creating config map like frontend does...');
        
        // Create a lookup map for quick access (exactly like frontend)
        const configMap = {};
        result.data.forEach(config => {
          const key = `${config.product_id}_${config.module_id}_${config.issue_name}`;
          configMap[key] = config;
          console.log(`   Created key: "${key}"`);
        });
        
        console.log('\n6️⃣ Final config map keys:', Object.keys(configMap));
        
        // Test the ticket matching logic
        console.log('\n7️⃣ Testing ticket matching...');
        const ticket = {
          product_id: 33,
          module_id: 59,
          issue_type: "Technical Support"
        };
        
        const ticketKey = `${ticket.product_id}_${ticket.module_id}_${ticket.issue_type}`;
        console.log(`   Ticket key: "${ticketKey}"`);
        
        const slaConfig = configMap[ticketKey];
        if (slaConfig) {
          console.log('✅ Found SLA config:', slaConfig.response_time_minutes, 'min response');
        } else {
          console.log('❌ No SLA config found for ticket key');
          console.log('   Available keys:', Object.keys(configMap));
        }
        
      } else {
        console.log('❌ API returned success: false');
      }
    } else {
      console.log('❌ API call failed with status:', response.status);
    }
    
  } catch (error) {
    console.error('❌ Error in frontend API simulation:', error);
  }
}

// Run the test
testFrontendAPI();
