const emailService = require('../services/emailService');

async function test() {
  console.log('🧪 Starting direct SMTP rejection email test...');
  const res = await emailService.sendPersonalDomainRejection('20.5b4loukyarao@gmail.com', 'Loukya Rao');
  console.log('📊 Result:', res);
}

test();
