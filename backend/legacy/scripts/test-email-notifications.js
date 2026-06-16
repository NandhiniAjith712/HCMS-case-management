const emailService = require('./services/emailService');
require('dotenv').config({ path: './config.env' });

async function testEmailNotifications() {
  console.log('🧪 Testing Email Notification System...\n');

  try {
    // Test 1: Test email configuration
    console.log('📧 Test 1: Testing email configuration...');
    const configTest = await emailService.testEmailConfig();
    
    if (configTest.success) {
      console.log('✅ Email configuration is valid\n');
    } else {
      console.log('❌ Email configuration failed:', configTest.error);
      console.log('\n⚠️  Please check your email configuration in config.env:');
      console.log('   - EMAIL_USER: Your Gmail address');
      console.log('   - EMAIL_PASS: Your Gmail App Password (not regular password)');
      console.log('   - Make sure you have 2FA enabled and generated an App Password\n');
      return;
    }

    // Test 2: Send a test agent reply notification
    console.log('📬 Test 2: Sending test agent reply notification...');
    const testEmail = process.env.EMAIL_USER; // Send to the same email for testing
    
    const replyResult = await emailService.sendAgentReplyNotification(
      testEmail,
      'Test Customer',
      12345,
      'Test Support Ticket - Email Notification System',
      'Test Agent',
      'Hello! This is a test reply from our support agent. The email notification system is working correctly. You should be able to see this message formatted nicely in your email client.'
    );

    if (replyResult.success) {
      console.log(`✅ Test agent reply notification sent successfully!`);
      console.log(`   📧 Email sent to: ${testEmail}`);
      console.log(`   📨 Message ID: ${replyResult.messageId}\n`);
    } else {
      console.log('❌ Failed to send test agent reply notification:', replyResult.error);
    }

    // Test 3: Send a welcome email
    console.log('🎉 Test 3: Sending test welcome email...');
    
    const welcomeResult = await emailService.sendWelcomeEmail(
      testEmail,
      'Test Customer'
    );

    if (welcomeResult.success) {
      console.log(`✅ Test welcome email sent successfully!`);
      console.log(`   📧 Email sent to: ${testEmail}`);
      console.log(`   📨 Message ID: ${welcomeResult.messageId}\n`);
    } else {
      console.log('❌ Failed to send test welcome email:', welcomeResult.error);
    }

    console.log('🎯 Email notification testing completed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Email service configured');
    console.log(`   ${replyResult.success ? '✅' : '❌'} Agent reply notifications`);
    console.log(`   ${welcomeResult.success ? '✅' : '❌'} Welcome emails`);
    
    if (replyResult.success && welcomeResult.success) {
      console.log('\n🎉 All tests passed! Email notification system is working properly.');
      console.log('\n📧 Check your email inbox for the test notifications.');
    } else {
      console.log('\n⚠️  Some tests failed. Please check the error messages above.');
    }

  } catch (error) {
    console.error('❌ Error during email testing:', error);
  }
}

// Run the test
testEmailNotifications();
