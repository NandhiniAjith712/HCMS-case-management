const fs = require('fs');
const path = require('path');

console.log('🔧 WhatsApp Token Update Helper\n');

console.log('📋 Current Configuration:');
console.log('   - File: backend/config.env');
console.log('   - Current Token: EAAZAFlVKZBf1EBPQRaVfLW7Ub4ZANTKvefh2SZBZAUe3LaRKbPDBd9tizKHGZBUZBZApPmZCZA2u7RmMsA3myndsozr3KAkkHX8YyZCdeiWPJ9ayEH5SBL9wOghiWsdyIUlhebiWTeNoorkc9eHZAwupMQrWHaqCjWlAbMScCBjIs8WLGIsSdnH8OXPXtZBY8INijbuuSDZC47hbJOSYZAZAp3QY3RZBbOmZBycGU5j5ey2cJypqRBY6PnOwZDZD');
console.log('   - Status: ❌ EXPIRED');

console.log('\n📝 Steps to Update:');
console.log('1. Go to: https://developers.facebook.com/');
console.log('2. Select your WhatsApp app');
console.log('3. Go to WhatsApp → Getting Started');
console.log('4. Click "Generate Access Token"');
console.log('5. Copy the new token');
console.log('6. Replace the WHATSAPP_ACCESS_TOKEN in config.env');

console.log('\n🔍 After updating, run:');
console.log('   node test-whatsapp-connection.js');

console.log('\n📱 Webhook Setup (After Token Update):');
console.log('1. Start your server: npm run dev');
console.log('2. Use ngrok for local testing: ngrok http 5000');
console.log('3. Set webhook URL in Meta Console: https://your-ngrok-url.ngrok.io/api/whatsapp/webhook');
console.log('4. Set verify token: my_verify_token_123');
