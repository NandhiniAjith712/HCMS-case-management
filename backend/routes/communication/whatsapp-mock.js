const express = require('express');
const router = express.Router();

// Mock WhatsApp service for development
class MockWhatsAppService {
  constructor() {
    this.messages = [];
  }

  async sendMessage(phoneNumber, message) {
    const mockMessage = {
      id: `mock_${Date.now()}`,
      phoneNumber,
      message,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };

    this.messages.push(mockMessage);
    
    console.log('📱 [MOCK] WhatsApp message sent:');
    console.log(`   To: ${phoneNumber}`);
    console.log(`   Message: ${message}`);
    console.log(`   ID: ${mockMessage.id}`);
    console.log('   Status: ✅ Delivered (Mock)');
    
    return mockMessage;
  }

  getMessages() {
    return this.messages;
  }

  clearMessages() {
    this.messages = [];
    return { success: true, message: 'Mock messages cleared' };
  }
}

const mockWhatsApp = new MockWhatsAppService();

// Mock send endpoint
router.post('/send', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    const result = await mockWhatsApp.sendMessage(phoneNumber, message);
    
    res.json({
      success: true,
      message: 'Mock WhatsApp message sent successfully',
      data: result
    });
  } catch (error) {
    console.error('Error in mock send endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get mock messages
router.get('/messages', (req, res) => {
  res.json({
    success: true,
    data: mockWhatsApp.getMessages()
  });
});

// Clear mock messages
router.delete('/messages', (req, res) => {
  const result = mockWhatsApp.clearMessages();
  res.json(result);
});

// Status endpoint
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Mock WhatsApp service is running',
    timestamp: new Date().toISOString(),
    mode: 'mock',
    messageCount: mockWhatsApp.getMessages().length
  });
});

module.exports = router; 