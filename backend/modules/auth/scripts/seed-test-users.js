/**
 * Seed idempotent test users for the HCMS auth module (one per role).
 *
 * Safe to run repeatedly: existing emails are updated (password + role),
 * missing ones are inserted. Intended for local/dev verification only.
 *
 * Run:  node modules/auth/scripts/seed-test-users.js
 */
const path = require('path');
// Load env BEFORE requiring the DB module (database.js reads env at import time).
require('dotenv').config({ path: path.resolve(__dirname, '../../shared/config/config.env') });

const bcrypt = require('bcryptjs');
const { pool } = require('../../shared/database/database');
const { ROLES } = require('../constants/roles');

const PASSWORD = 'Test@123';
const TENANT_ID = 1;

const TEST_USERS = [
  { name: 'Test Employee',        email: 'employee@hcms.test', role: ROLES.EMPLOYEE,        department: 'Operations' },
  { name: 'Test HR',              email: 'hr@hcms.test',       role: ROLES.HR,              department: 'Human Resources' },
  { name: 'Test Department Head', email: 'depthead@hcms.test', role: ROLES.DEPARTMENT_HEAD, department: 'Engineering' },
  { name: 'Test Admin',           email: 'admin@hcms.test',    role: ROLES.ADMIN,           department: 'IT' }
];

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const u of TEST_USERS) {
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [u.email]
    );

    if (existing.length > 0) {
      await pool.execute(
        'UPDATE users SET name = ?, password = ?, role = ?, department = ?, tenant_id = ? WHERE id = ?',
        [u.name, passwordHash, u.role, u.department, TENANT_ID, existing[0].id]
      );
      console.log(`↻ Updated ${u.email}  (role=${u.role})`);
    } else {
      await pool.execute(
        'INSERT INTO users (name, email, password, role, department, tenant_id) VALUES (?, ?, ?, ?, ?, ?)',
        [u.name, u.email, passwordHash, u.role, u.department, TENANT_ID]
      );
      console.log(`＋ Inserted ${u.email}  (role=${u.role})`);
    }
  }

  console.log(`\n✅ Done. All test users use password: ${PASSWORD}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
