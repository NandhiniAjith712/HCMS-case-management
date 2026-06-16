const { pool } = require('../database');
async function run() {
  try {
    const queries = [
      "ALTER TABLE incoming_emails ADD COLUMN email_type ENUM('valid_user_mail', 'spam', 'auto_reply', 'delivery_failure', 'ignored', 'system') DEFAULT 'valid_user_mail'",
      "ALTER TABLE incoming_emails MODIFY COLUMN processing_status ENUM('pending','processed','review_required','ignored','spam','pending_review','approved','converted_to_ticket') DEFAULT 'pending_review'",
      "ALTER TABLE incoming_emails ADD COLUMN existing_user_id INT NULL",
      "ALTER TABLE incoming_emails ADD COLUMN created_user_id INT NULL",
      "ALTER TABLE incoming_emails ADD COLUMN duplicate_flag BOOLEAN DEFAULT FALSE",
      "ALTER TABLE incoming_emails ADD COLUMN reviewed_by INT NULL",
      "ALTER TABLE incoming_emails ADD COLUMN reviewed_at DATETIME NULL"
    ];
    for (const q of queries) {
      try {
        await pool.execute(q);
        console.log(`✅ Executed: ${q.substring(0, 50)}...`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME' || err.message.includes('Duplicate column name')) {
           console.log(`⚠️ Column already exists, skipping: ${q.substring(0, 50)}...`);
        } else {
          throw err;
        }
      }
    }
    console.log('✅ Final: incoming_emails table updated successfully');
  } catch(e) {
    console.error('❌ Schema update failed:', e.message);
  } finally {
    process.exit(0);
  }
}
run();
