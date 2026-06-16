const { pool } = require('./database');

async function syncAgentNames() {
  const connection = await pool.getConnection();
  try {
    console.log('🔧 Syncing agent names from agents → users (by email)...');

    // Normalize collations on the fly to avoid mismatch (compare as binary-safe)
    const [result] = await connection.execute(`
      UPDATE users u
      JOIN agents a ON CONVERT(a.email USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(u.email USING utf8mb4) COLLATE utf8mb4_unicode_ci
      SET u.name = a.name
      WHERE u.role IN ('agent','support_agent')
    `);

    console.log(`✅ Updated names for ${result.affectedRows} user(s).`);
  } catch (e) {
    console.error('❌ Sync failed:', e.message);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

if (require.main === module) {
  syncAgentNames();
}

module.exports = { syncAgentNames };


