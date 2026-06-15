const { pool } = require('../database');

async function main() {
  try {
    const [tickets] = await pool.execute(`
      SELECT t.id, t.issue_title, t.department_id, d.name as department_name, t.assigned_to, a.name as agent_name
      FROM tickets t
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN agents a ON t.assigned_to = a.id
      ORDER BY t.id DESC
      LIMIT 10
    `);
    console.log('--- RECENT TICKETS ---');
    console.table(tickets);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
