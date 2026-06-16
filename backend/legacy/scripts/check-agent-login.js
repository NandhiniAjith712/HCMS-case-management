#!/usr/bin/env node
/**
 * Debug script: Check if an agent can login
 * Usage: node check-agent-login.js <email>
 * Example: node check-agent-login.js nandhu7246@gmail.com
 */
require('dotenv').config({ path: './config.env' });
const { pool } = require('./database');

const email = process.argv[2];
if (!email) {
  console.log('Usage: node check-agent-login.js <email>');
  process.exit(1);
}

const normalizedEmail = String(email).trim().toLowerCase();

(async () => {
  try {
    const [agents] = await pool.execute(
      'SELECT id, name, email, role, is_active, password_hash IS NOT NULL as has_password, password_setup_token IS NOT NULL as has_setup_token FROM agents WHERE LOWER(TRIM(email)) = ? OR email = ?',
      [normalizedEmail, email]
    );

    console.log('\n--- Agent Login Check ---');
    console.log('Email searched:', email, '(normalized:', normalizedEmail + ')');
    console.log('Agents found:', agents.length);

    if (agents.length === 0) {
      console.log('\nNo agent found with this email. Check:');
      console.log('  1. Was the staff created in Business Dashboard?');
      console.log('  2. Is the email correct?');
      process.exit(1);
    }

    agents.forEach((a, i) => {
      console.log(`\nAgent ${i + 1}:`, {
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        is_active: !!a.is_active,
        has_password: !!a.has_password,
        has_setup_token: !!a.has_setup_token
      });
      if (!a.has_password) console.log('  -> Password not set yet. Use setup link.');
      if (!a.is_active) console.log('  -> Account inactive. Complete password setup first.');
    });

    console.log('\n');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
