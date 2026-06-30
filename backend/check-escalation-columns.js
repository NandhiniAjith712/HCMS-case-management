const { pool } = require('./modules/shared/database/database');

async function checkEscalationColumns() {
  try {
    const [rows] = await pool.execute(
      'SHOW COLUMNS FROM tickets WHERE Field IN ("escalation_level", "escalation_count", "last_escalated_at", "is_escalated")'
    );
    
    console.log('Escalation columns in tickets table:');
    console.log(JSON.stringify(rows, null, 2));
    
    if (rows.length === 0) {
      console.log('\n❌ No escalation columns found. The ALTER TABLE statements may not have run yet.');
      console.log('The columns will be added when the database initialization runs.');
    } else {
      console.log(`\n✅ Found ${rows.length} escalation columns.`);
    }
  } catch (error) {
    console.error('Error checking columns:', error.message);
  } finally {
    await pool.end();
  }
}

checkEscalationColumns();
