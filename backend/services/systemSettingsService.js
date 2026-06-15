const { pool } = require('../database');

const DEFAULTS = {
  ai_ticket_allocation_enabled: 'true'
};

let settingsSchemaEnsured = false;

async function ensureSystemSettingsSchema() {
  if (settingsSchemaEnsured) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        \`value\` TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    // Additive-only: never break ticket flows if schema cannot be ensured.
    console.warn('⚠️ ensureSystemSettingsSchema:', e?.message || e);
  }

  // Best-effort defaults (do not overwrite existing values).
  try {
    await pool.execute(
      `INSERT IGNORE INTO system_settings (\`key\`, \`value\`) VALUES (?, ?)`,
      ['ai_ticket_allocation_enabled', DEFAULTS.ai_ticket_allocation_enabled]
    );
  } catch (e) {
    console.warn('⚠️ ensureSystemSettingsSchema default insert:', e?.message || e);
  }

  settingsSchemaEnsured = true;
}

async function getSetting(key) {
  await ensureSystemSettingsSchema();
  try {
    const [rows] = await pool.execute(
      'SELECT `value` FROM system_settings WHERE `key` = ? LIMIT 1',
      [String(key || '').trim()]
    );
    return rows?.[0]?.value ?? null;
  } catch (e) {
    console.warn('⚠️ getSetting failed:', e?.message || e);
    return DEFAULTS[String(key || '').trim()] ?? null;
  }
}

async function setSetting(key, value) {
  await ensureSystemSettingsSchema();
  const k = String(key || '').trim();
  const v = value == null ? null : String(value);
  await pool.execute(
    `INSERT INTO system_settings (\`key\`, \`value\`)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = CURRENT_TIMESTAMP`,
    [k, v]
  );
}

async function getBooleanSetting(key, defaultValue = true) {
  const v = await getSetting(key);
  if (v == null) return !!defaultValue;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(s)) return false;
  return !!defaultValue;
}

module.exports = {
  ensureSystemSettingsSchema,
  getSetting,
  setSetting,
  getBooleanSetting
};

