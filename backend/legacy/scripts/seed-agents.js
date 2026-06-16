/**
 * Seed staff members into the agents table.
 * Staff (admin, executives, managers, CEO) must be in agents table for Global Login
 * to redirect them to the correct dashboards (Agent/Manager/CEO).
 *
 * Run: node seed-agents.js
 */

const { pool } = require('./database');
const { hashPassword } = require('./middleware/auth');

// Agents table uses: support_agent, support_manager, ceo
// Auth uses: support_agent, support_manager, ceo (agents table roles)
const STAFF_ACCOUNTS = [
  { email: 'admin@company.com', name: 'System Administrator', password: 'admin123', role: 'support_agent' },
  { email: 'ceo@company.com', name: 'CEO Executive', password: 'ceo123', role: 'ceo' },
  { email: 'manager@company.com', name: 'Support Manager', password: 'manager123', role: 'support_manager' },
  { email: 'executive1@company.com', name: 'Support Executive 1', password: 'exec123', role: 'support_agent' },
  { email: 'executive2@company.com', name: 'Support Executive 2', password: 'exec123', role: 'support_agent' }
];

async function seedAgents() {
  try {
    console.log('🌱 Seeding staff into agents table...\n');

    for (const staff of STAFF_ACCOUNTS) {
      const [existing] = await pool.execute('SELECT id FROM agents WHERE email = ?', [staff.email]);

      if (existing.length > 0) {
        console.log(`⏭️  Agent already exists: ${staff.name} (${staff.email})`);
        continue;
      }

      const hashedPassword = await hashPassword(staff.password);

      // Try with tenant_id and login_id first (multitenancy setup), fallback to basic columns
      try {
        const [columns] = await pool.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME IN ('tenant_id', 'login_id')`
        );
        const hasTenantId = columns.some(c => c.COLUMN_NAME === 'tenant_id');
        const hasLoginId = columns.some(c => c.COLUMN_NAME === 'login_id');

        const department = staff.role === 'ceo' ? 'Executive' : 'Support';
        const loginId = staff.email.split('@')[0];

        if (hasTenantId && hasLoginId) {
          await pool.execute(
            `INSERT INTO agents (tenant_id, name, email, login_id, password_hash, role, department, is_active)
             VALUES (1, ?, ?, ?, ?, ?, ?, TRUE)`,
            [staff.name, staff.email, loginId, hashedPassword, staff.role, department]
          );
        } else if (hasTenantId) {
          await pool.execute(
            `INSERT INTO agents (tenant_id, name, email, password_hash, role, department, is_active)
             VALUES (1, ?, ?, ?, ?, ?, TRUE)`,
            [staff.name, staff.email, hashedPassword, staff.role, department]
          );
        } else {
          await pool.execute(
            `INSERT INTO agents (name, email, password_hash, role, department, is_active)
             VALUES (?, ?, ?, ?, ?, TRUE)`,
            [staff.name, staff.email, hashedPassword, staff.role, department]
          );
        }
      } catch (err) {
        console.error(`   Insert failed for ${staff.email}, trying basic format:`, err.message);
        await pool.execute(
          `INSERT INTO agents (name, email, password_hash, role, department, is_active)
           VALUES (?, ?, ?, ?, ?, TRUE)`,
          [staff.name, staff.email, hashedPassword, staff.role, 'Support']
        );
      }

      console.log(`✅ Created agent: ${staff.name} (${staff.email}) - role: ${staff.role}`);
    }

    console.log('\n✅ Agents seeding completed!');
    console.log('\n📋 Staff Login Credentials (use these at /login):');
    console.log('   Admin:      admin@company.com / admin123');
    console.log('   CEO:        ceo@company.com / ceo123');
    console.log('   Manager:    manager@company.com / manager123');
    console.log('   Executive 1: executive1@company.com / exec123');
    console.log('   Executive 2: executive2@company.com / exec123');

  } catch (error) {
    console.error('❌ Error seeding agents:', error);
  } finally {
    process.exit(0);
  }
}

seedAgents();
