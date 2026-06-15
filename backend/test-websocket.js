const WebSocket = require('ws');

// Test WebSocket connection
async function testWebSocket() {
  console.log('🧪 Testing WebSocket connection...');
  
  try {
    const ws = new WebSocket('ws://localhost:5000/ws');
    
    ws.on('open', () => {
      console.log('✅ WebSocket connection established successfully');
      
      // Test sending a message
      const testMessage = {
        type: 'JOIN_TICKET',
        ticketId: 1,
        userId: 1,
        userType: 'agent'
      };
      
      ws.send(JSON.stringify(testMessage));
      console.log('📤 Sent test message:', testMessage);
      
      // Close connection after test
      setTimeout(() => {
        ws.close();
        console.log('🔌 Test completed, connection closed');
      }, 2000);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log('📨 Received message:', message);
      } catch (error) {
        console.log('📨 Received raw message:', data.toString());
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log('🔌 Connection closed:', code, reason);
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        console.log('⏰ Test timeout, closing connection');
      }
    }, 10000);
    
  } catch (error) {
    console.error('❌ Failed to create WebSocket connection:', error.message);
  }
}

// Test HTTP health endpoint first
async function testHealthEndpoint() {
  console.log('🏥 Testing HTTP health endpoint...');
  
  try {
    const response = await fetch('http://localhost:5000/health');
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Health endpoint working:', data);
      return true;
    } else {
      console.log('❌ Health endpoint failed:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Health endpoint error:', error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting WebSocket tests...\n');
  
  // Test health endpoint first
  const healthOk = await testHealthEndpoint();
  
  if (healthOk) {
    console.log('\n🔌 Health endpoint OK, testing WebSocket...\n');
    await testWebSocket();
  } else {
    console.log('\n❌ Health endpoint failed, server may not be running');
    console.log('💡 Make sure to start the server first: node server.js');
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { testWebSocket, testHealthEndpoint };
