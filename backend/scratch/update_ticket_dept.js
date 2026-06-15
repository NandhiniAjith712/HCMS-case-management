const { pool } = require('../database');

async function main() {
  try {
    const [result] = await pool.execute(
      'UPDATE tickets SET department_id = 2 WHERE id = 260'
    );
    if (result.affectedRows > 0) {
      console.log('✅ Successfully updated ticket 260 department_id to 2 (Marketing)');
    } else {
      console.log('❌ Could not find ticket 260');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
