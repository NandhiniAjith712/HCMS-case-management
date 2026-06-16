/**
 * Check pre-requisites for SLA feature testing (excluding WhatsApp)
 * Run: node check-sla-prereqs.js
 */
require('dotenv').config({ path: './config.env' });
const { pool } = require('./database');
const nodemailer = require('nodemailer');

async function check() {
  console.log('\n=== SLA Feature Pre-requisites Check ===\n');

  let allOk = true;

  // 1. SMTP / Email
  console.log('1. SMTP / Email Configuration');
  const smtpUser = process.env.SMTP_EMAIL || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASS;
  if (!smtpUser || !smtpPass) {
    console.log('   ❌ SMTP credentials missing (SMTP_EMAIL/SMTP_PASSWORD or EMAIL_USER/EMAIL_PASS)');
    allOk = false;
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_SERVER || process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: { user: smtpUser, pass: smtpPass }
      });
      await transporter.verify();
      console.log('   ✅ SMTP configured and verified');
    } catch (e) {
      console.log('   ❌ SMTP verification failed:', e.message);
      allOk = false;
    }
  }

  // 2. Database
  console.log('\n2. Database Connection');
  try {
    const [conn] = await pool.execute('SELECT 1');
    console.log('   ✅ Database connected');
  } catch (e) {
    console.log('   ❌ Database connection failed:', e.message);
    allOk = false;
  }

  // 3. Tenants
  console.log('\n3. Tenants');
  try {
    const [tenants] = await pool.execute("SELECT id, name, status FROM tenants WHERE status = 'active'");
    if (tenants.length === 0) {
      console.log('   ❌ No active tenants found');
      allOk = false;
    } else {
      console.log(`   ✅ ${tenants.length} active tenant(s): ${tenants.map(t => t.name).join(', ')}`);
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message);
    allOk = false;
  }

  // 4. Products
  console.log('\n4. Products');
  try {
    const [products] = await pool.execute('SELECT id, name FROM products WHERE status = ?', ['active']);
    if (products.length === 0) {
      console.log('   ❌ No active products found');
      allOk = false;
    } else {
      console.log(`   ✅ ${products.length} product(s): ${products.map(p => p.name).join(', ')}`);
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message);
    allOk = false;
  }

  // 5. Modules
  console.log('\n5. Modules');
  try {
    const [modules] = await pool.execute('SELECT id, name, product_id FROM modules WHERE status = ?', ['active']);
    if (modules.length === 0) {
      console.log('   ❌ No active modules found');
      allOk = false;
    } else {
      console.log(`   ✅ ${modules.length} module(s): ${modules.map(m => m.name).join(', ')}`);
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message);
    allOk = false;
  }

  // 6. SLA Configurations
  console.log('\n6. SLA Configurations');
  try {
    const [configs] = await pool.execute(
      'SELECT id, issue_name, response_time_minutes, module_id FROM sla_configurations WHERE is_active = TRUE'
    );
    if (configs.length === 0) {
      console.log('   ❌ No active SLA configurations found');
      allOk = false;
    } else {
      console.log(`   ✅ ${configs.length} SLA config(s): ${configs.map(c => `${c.issue_name} (${c.response_time_minutes}min)`).join(', ')}`);
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message);
    allOk = false;
  }

  // 7. Agents
  console.log('\n7. Active Agents');
  try {
    const [agents] = await pool.execute(
      "SELECT id, name, email, role FROM agents WHERE is_active = TRUE"
    );
    if (agents.length === 0) {
      console.log('   ❌ No active agents found');
      allOk = false;
    } else {
      const withEmail = agents.filter(a => a.email);
      console.log(`   ✅ ${agents.length} agent(s): ${agents.map(a => a.name).join(', ')}`);
      if (withEmail.length < agents.length) {
        console.log(`   ⚠️  ${agents.length - withEmail.length} agent(s) missing email (won't receive SLA reminders)`);
      }
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message);
    allOk = false;
  }

  // 8. New columns (SLA features)
  console.log('\n8. SLA Feature Columns');
  try {
    const [cols] = await pool.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets' AND COLUMN_NAME IN ('sla_first_response_met','sla_reminder_30_sent','sla_reminder_15_sent','inactivity_reminder_level')",
      [process.env.DB_NAME || 'tick_system']
    );
    const found = cols.map(c => c.COLUMN_NAME);
    const required = ['sla_first_response_met','sla_reminder_30_sent','sla_reminder_15_sent','inactivity_reminder_level'];
    const missing = required.filter(r => !found.includes(r));
    if (missing.length > 0) {
      console.log(`   ⚠️  Missing columns: ${missing.join(', ')}. Restart backend to add them.`);
    } else {
      console.log('   ✅ All SLA columns present');
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message);
  }

  console.log('\n========================================');
  console.log(allOk ? '✅ All pre-requisites OK' : '❌ Some pre-requisites missing or failed');
  console.log('========================================\n');
  process.exit(allOk ? 0 : 1);
}

check().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
