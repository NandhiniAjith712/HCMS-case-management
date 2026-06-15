const { pool } = require('./database');

async function run() {
  try {
    const [rows] = await pool.execute('SELECT id, sender_email, subject, processing_status, matched_ticket_id, linked_ticket_id, received_at FROM incoming_emails ORDER BY id DESC LIMIT 20');
    console.log('--- RECENT INCOMING EMAILS ---');
    console.log(JSON.stringify(rows, null, 2));
    
    const [tickets] = await pool.execute('SELECT id, title, status, requester_email, created_at FROM tickets ORDER BY id DESC LIMIT 5');
    console.log('--- RECENT TICKETS ---');
    console.log(JSON.stringify(tickets, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
