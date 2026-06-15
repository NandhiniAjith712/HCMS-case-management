const { pool } = require('./database');

async function showCreate(table) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
    console.log(rows[0]['Create Table']);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

const table = process.argv[2] || 'ticket_assignments';
showCreate(table);


