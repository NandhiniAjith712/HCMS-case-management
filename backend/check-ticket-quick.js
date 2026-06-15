require('dotenv').config({ path: './config.env' });
const { pool } = require('./database');

async function run() {
  // All tickets from this sender (last 7 days)
  const [all] = await pool.execute(
    `SELECT id, issue_title, email, created_at, assigned_to, issue_type FROM tickets 
     WHERE LOWER(email) = 'nandhu7246@gmail.com' 
     AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY created_at DESC`
  );
  console.log('Recent tickets from nandhu7246@gmail.com (last 7 days):');
  all.forEach(t => console.log('  #' + t.id, '|', t.issue_title, '| assigned_to:', t.assigned_to, '| type:', t.issue_type, '|', t.created_at));

  // Any ticket with "ticket test" or "creation" in subject
  const [match] = await pool.execute(
    `SELECT id, issue_title, email, created_at, assigned_to FROM tickets 
     WHERE (LOWER(issue_title) LIKE '%ticket test%' OR LOWER(issue_title) LIKE '%creation%')
     ORDER BY created_at DESC LIMIT 10`
  );
  console.log('\nTickets with "ticket test" or "creation" in subject:');
  match.forEach(t => console.log('  #' + t.id, '|', t.issue_title, '|', t.email, '|', t.created_at));
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
