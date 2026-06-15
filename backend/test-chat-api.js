const http = require('http');

function testChatAPI() {
  const postData = JSON.stringify({
    ticketId: 19,
    senderType: 'agent',
    senderId: 1,
    senderName: 'Test Agent',
    message: 'Test reply from agent to customer',
    messageType: 'text'
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/chat/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`📡 Response Status: ${res.statusCode}`);
    console.log(`📋 Response Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`📨 Response Body: ${data}`);
      
      if (res.statusCode === 201) {
        console.log('✅ Chat message created successfully!');
        console.log('📧 Check server logs for email notification status');
      } else {
        console.log('❌ Failed to create chat message');
      }
    });
  });

  req.on('error', (e) => {
    console.error(`❌ Request error: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

console.log('🧪 Testing Chat API Endpoint...');
console.log('📝 Creating agent reply message...');
testChatAPI();
