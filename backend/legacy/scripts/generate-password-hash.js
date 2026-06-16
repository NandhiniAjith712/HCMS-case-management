// Quick script to generate bcrypt password hashes for test users
const bcrypt = require('bcryptjs');

const password = process.argv[2] || 'password123';

console.log('\n🔐 Password Hash Generator');
console.log('========================\n');
console.log(`Password: ${password}`);
console.log(`Hash: ${bcrypt.hashSync(password, 10)}\n`);

// Generate hash for common test passwords
console.log('Common test passwords:');
console.log('---------------------');
['password123', 'admin123', 'test123', 'password'].forEach(pwd => {
    console.log(`${pwd.padEnd(15)} → ${bcrypt.hashSync(pwd, 10)}`);
});

console.log('\nUsage: node generate-password-hash.js [password]');
console.log('Example: node generate-password-hash.js mypassword\n');




