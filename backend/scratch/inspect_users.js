const { pool } = require('../database');

async function main() {
  try {
    const [agents] = await pool.execute('SELECT id, name, email, role, primary_department_id, is_active FROM agents');
    console.log('--- AGENTS ---');
    console.table(agents);

    const [users] = await pool.execute('SELECT id, name, email, role FROM users');
    console.log('--- USERS ---');
    console.table(users);

    const [permissions] = await pool.execute('SELECT * FROM manager_department_permissions');
    console.log('--- MANAGER PERMISSIONS ---');
    console.table(permissions);

    const [departments] = await pool.execute('SELECT id, name, status FROM departments');
    console.log('--- DEPARTMENTS ---');
    console.table(departments);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
