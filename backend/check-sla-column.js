require('dotenv').config({ path: require('path').resolve(__dirname, 'config.env') });
const { pool } = require('./modules/shared/database/database');

async function check() {
  try {
    console.log('Checking sla column in cases table...\n');
    
    const [cases] = await pool.execute(`
      SELECT id, ticket_code, title, category, priority, status, sla, created_at
      FROM cases
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${cases.length} cases:\n`);
    cases.forEach(c => {
      console.log(`ID: ${c.id} - ${c.ticket_code} - ${c.title}`);
      console.log(`  Category: ${c.category}, Priority: ${c.priority}`);
      console.log(`  SLA column value: "${c.sla}"`);
      console.log(`  Created: ${c.created_at}`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

check();
