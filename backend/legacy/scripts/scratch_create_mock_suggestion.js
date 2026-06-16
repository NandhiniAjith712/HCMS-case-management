const { pool } = require('./database');

async function run() {
  try {
    // Let's set email 314's processing_status to 'pending_continuation_review' and matched_ticket_id to 252
    const [result] = await pool.execute(
      'UPDATE incoming_emails SET processing_status = "pending_continuation_review", matched_ticket_id = 252, ai_confidence_score = 0.65, ai_continuation_reason = "Customer is reporting the identical database system error loading page within 2 hours of the original ticket." WHERE id = 314'
    );
    console.log('✅ Successfully updated email 314 to pending_continuation_review!');
    console.log('Rows affected:', result.affectedRows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
