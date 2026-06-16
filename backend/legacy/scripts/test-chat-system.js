const axios = require('axios');
require('dotenv').config({ path: './config.env' });

const API_BASE = process.env.API_BASE_URL || 'http://localhost:5000/api';

console.log('🧪 Chat System Test');
console.log('===================');
console.log(`API Base: ${API_BASE}`);
console.log('');

// Test data
const testTicket = {
  id: 1,
  name: 'John Doe',
  issue_title: 'Test Issue',
  description: 'This is a test ticket for chat system',
  created_at: new Date().toISOString()
};

const testUser = {
  id: 1,
  name: 'Test Agent',
  email: 'agent@test.com'
};

async function createTestTicket() {
  try {
    console.log('📝 Creating test ticket...');
    
    const ticketData = {
      name: testTicket.name,
      email: 'john.doe@test.com',
      description: testTicket.description,
      issue_title: testTicket.issue_title,
      issue_type: 'Technical',
      priority: 'medium',
      status: 'new'
    };

    const response = await axios.post(`${API_BASE}/tickets`, ticketData);
    
    if (response.data.success) {
      testTicket.id = response.data.data.id;
      console.log('✅ Test ticket created with ID:', testTicket.id);
    } else {
      console.log('⚠️ Could not create test ticket, using ID 1');
    }
  } catch (error) {
    console.log('⚠️ Could not create test ticket, using ID 1');
    console.log('   Error:', error.response?.data?.message || error.message);
  }
}

async function testChatSystem() {
  try {
    console.log('📋 Testing Chat System...\n');

    // First, try to create a test ticket
    await createTestTicket();

    // Test 1: Get chat messages
    console.log('1️⃣ Testing GET /chat/messages/:ticketId');
    try {
      const response = await axios.get(`${API_BASE}/chat/messages/${testTicket.id}`);
      console.log('✅ Success:', response.data.success);
      console.log('📊 Messages count:', response.data.data.length);
      console.log('📋 Ticket info:', response.data.ticket ? '✅' : '❌');
      if (response.data.ticket) {
        console.log('   Ticket name:', response.data.ticket.name);
      }
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
    }

    console.log('');

    // Test 2: Add a chat message
    console.log('2️⃣ Testing POST /chat/messages');
    try {
      const messageData = {
        ticketId: testTicket.id,
        senderType: 'agent',
        senderId: testUser.id,
        senderName: testUser.name,
        message: 'Hello! This is a test message from the chat system.'
      };

      const response = await axios.post(`${API_BASE}/chat/messages`, messageData);
      console.log('✅ Success:', response.data.success);
      console.log('📝 Message ID:', response.data.data.id);
      console.log('💬 Message:', response.data.data.message);
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
      if (error.response?.data?.error) {
        console.log('   Error details:', error.response.data.error);
      }
    }

    console.log('');

    // Test 3: Add a customer message
    console.log('3️⃣ Testing POST /chat/messages (customer)');
    try {
      const messageData = {
        ticketId: testTicket.id,
        senderType: 'customer',
        senderId: null,
        senderName: testTicket.name,
        message: 'Hi! I have a question about my ticket.'
      };

      const response = await axios.post(`${API_BASE}/chat/messages`, messageData);
      console.log('✅ Success:', response.data.success);
      console.log('📝 Message ID:', response.data.data.id);
      console.log('💬 Message:', response.data.data.message);
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
      if (error.response?.data?.error) {
        console.log('   Error details:', error.response.data.error);
      }
    }

    console.log('');

    // Test 4: Mark messages as read
    console.log('4️⃣ Testing PUT /chat/messages/read/:ticketId');
    try {
      const readData = {
        userId: testUser.id,
        userType: 'agent'
      };

      const response = await axios.put(`${API_BASE}/chat/messages/read/${testTicket.id}`, readData);
      console.log('✅ Success:', response.data.success);
      if (response.data.data && response.data.data.updatedCount !== undefined) {
        console.log('📊 Updated count:', response.data.data.updatedCount);
      } else {
        console.log('📊 Updated count: N/A');
      }
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
    }

    console.log('');

    // Test 5: Get unread count
    console.log('5️⃣ Testing GET /chat/unread/:ticketId/:userType');
    try {
      const response = await axios.get(`${API_BASE}/chat/unread/${testTicket.id}/agent`);
      console.log('✅ Success:', response.data.success);
      console.log('📊 Unread count:', response.data.data.unreadCount);
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
    }

    console.log('');

    // Test 6: Join chat session
    console.log('6️⃣ Testing POST /chat/session');
    try {
      const sessionData = {
        ticketId: testTicket.id,
        userId: testUser.id,
        userType: 'agent',
        userName: testUser.name
      };

      const response = await axios.post(`${API_BASE}/chat/session`, sessionData);
      console.log('✅ Success:', response.data.success);
      console.log('🔗 Session ID:', response.data.data.sessionId);
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
      if (error.response?.data?.error) {
        console.log('   Error details:', error.response.data.error);
      }
    }

    console.log('');

    // Test 7: Update typing status
    console.log('7️⃣ Testing PUT /chat/typing');
    try {
      const typingData = {
        sessionId: `session_${testTicket.id}_${Date.now()}`,
        userId: testUser.id,
        userType: 'agent',
        isTyping: true
      };

      const response = await axios.put(`${API_BASE}/chat/typing`, typingData);
      console.log('✅ Success:', response.data.success);
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
    }

    console.log('');

    // Test 8: Get chat session
    console.log('8️⃣ Testing GET /chat/session/:ticketId');
    try {
      const response = await axios.get(`${API_BASE}/chat/session/${testTicket.id}`);
      console.log('✅ Success:', response.data.success);
      console.log('📊 Sessions count:', response.data.data.length);
    } catch (error) {
      console.log('❌ Failed:', error.response?.data?.message || error.message);
    }

    console.log('\n🎉 Chat System Test Completed!');
    console.log('================================');
    console.log('📝 Check the results above to verify all endpoints are working.');
    console.log('🔗 You can now test the real-time chat functionality in the frontend.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testChatSystem(); 