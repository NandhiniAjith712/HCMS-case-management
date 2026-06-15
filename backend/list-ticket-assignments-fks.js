const { pool } = require('./database');

async function listFks() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ticket_assignments'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY CONSTRAINT_NAME
    `);
    console.log('\nForeign keys on ticket_assignments:');
    for (const r of rows) {
      console.log(`- ${r.CONSTRAINT_NAME}: ${r.COLUMN_NAME} -> ${r.REFERENCED_TABLE_NAME}(id)`);
    }
  } finally {
    connection.release();
    process.exit(0);
  }
}

listFks();


