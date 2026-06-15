const { pool } = require('../database');

const MATCH_LEVELS = {
  EXACT: 'EXACT',
  PRODUCT_ISSUE: 'PRODUCT_ISSUE',
  PRODUCT_MODULE: 'PRODUCT_MODULE',
  PRODUCT_DEFAULT: 'PRODUCT_DEFAULT',
  TENANT_DEFAULT: 'TENANT_DEFAULT',
  SYSTEM_DEFAULT: 'SYSTEM_DEFAULT'
};

const SYSTEM_DEFAULT = {
  response_time_minutes: 480,
  resolution_time_minutes: 480
};

const toNullableInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeIssueTypeId = (value) => {
  if (!value) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || null;
};

let schemaEnsured = false;
let schemaEnsurePromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDdlError = (err) =>
  err?.code === 'ER_LOCK_DEADLOCK' ||
  err?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
  err?.code === 'ER_TABLE_DEF_CHANGED';

const runDdlWithRetry = async (conn, sql, maxAttempts = 3) => {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await conn.execute(sql);
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientDdlError(err) || attempt === maxAttempts) throw err;
      await sleep(150 * attempt);
    }
  }
  if (lastErr) throw lastErr;
};

const ensureSlaResolutionSchema = async () => {
  if (schemaEnsured) return;
  if (schemaEnsurePromise) return schemaEnsurePromise;

  schemaEnsurePromise = (async () => {
    const conn = await pool.getConnection();
    try {
      const [cols] = await conn.execute(
        `SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND (
             (TABLE_NAME = 'sla_configurations' AND COLUMN_NAME IN ('issue_type_id','product_id','module_id')) OR
             (TABLE_NAME = 'sla_timers' AND COLUMN_NAME IN ('sla_configuration_id')) OR
             (TABLE_NAME = 'tickets' AND COLUMN_NAME IN ('issue_type_id','sla_config_id','sla_response_time_minutes','sla_resolution_time_minutes','sla_match_level','sla_response_due_at','sla_resolution_due_at'))
           )`
      );
      const colMap = new Map(cols.map((c) => [`${c.TABLE_NAME}.${c.COLUMN_NAME}`, c]));

      const alterations = [];
      if (!colMap.has('sla_configurations.issue_type_id')) {
        alterations.push("ALTER TABLE sla_configurations ADD COLUMN issue_type_id VARCHAR(100) NULL AFTER module_id");
      }
      if ((colMap.get('sla_configurations.product_id') || {}).IS_NULLABLE === 'NO') {
        alterations.push("ALTER TABLE sla_configurations MODIFY COLUMN product_id INT NULL");
      }
      if ((colMap.get('sla_configurations.module_id') || {}).IS_NULLABLE === 'NO') {
        alterations.push("ALTER TABLE sla_configurations MODIFY COLUMN module_id INT NULL");
      }
      if ((colMap.get('sla_timers.sla_configuration_id') || {}).IS_NULLABLE === 'NO') {
        alterations.push("ALTER TABLE sla_timers MODIFY COLUMN sla_configuration_id INT NULL");
      }
      if (!colMap.has('tickets.issue_type_id')) {
        alterations.push("ALTER TABLE tickets ADD COLUMN issue_type_id VARCHAR(100) NULL AFTER issue_type");
      }
      if (!colMap.has('tickets.sla_config_id')) {
        alterations.push("ALTER TABLE tickets ADD COLUMN sla_config_id INT NULL AFTER module_id");
      }
      if (!colMap.has('tickets.sla_response_time_minutes')) {
        alterations.push("ALTER TABLE tickets ADD COLUMN sla_response_time_minutes INT NULL AFTER sla_config_id");
      }
      if (!colMap.has('tickets.sla_resolution_time_minutes')) {
        alterations.push("ALTER TABLE tickets ADD COLUMN sla_resolution_time_minutes INT NULL AFTER sla_response_time_minutes");
      }
      if (!colMap.has('tickets.sla_match_level')) {
        alterations.push("ALTER TABLE tickets ADD COLUMN sla_match_level ENUM('EXACT','PRODUCT_ISSUE','PRODUCT_MODULE','PRODUCT_DEFAULT','TENANT_DEFAULT','SYSTEM_DEFAULT') NULL AFTER sla_resolution_time_minutes");
      }
      if (!colMap.has('tickets.sla_response_due_at')) {
        alterations.push("ALTER TABLE tickets ADD COLUMN sla_response_due_at DATETIME NULL AFTER sla_match_level");
      }
      if (!colMap.has('tickets.sla_resolution_due_at')) {
        alterations.push("ALTER TABLE tickets ADD COLUMN sla_resolution_due_at DATETIME NULL AFTER sla_response_due_at");
      }

      for (const sql of alterations) {
        try {
          await runDdlWithRetry(conn, sql);
        } catch (err) {
          if (
            err.code !== 'ER_DUP_FIELDNAME' &&
            err.code !== 'ER_BAD_NULL_ERROR' &&
            err.code !== 'ER_DUP_KEYNAME'
          ) {
            throw err;
          }
        }
      }

      try {
        await conn.execute(
          'UPDATE sla_configurations SET issue_type_id = LOWER(REPLACE(TRIM(issue_name), " ", "_")) WHERE issue_type_id IS NULL AND issue_name IS NOT NULL'
        );
      } catch (_) { /* best effort */ }

      try {
        await conn.execute(
          'UPDATE tickets SET issue_type_id = LOWER(REPLACE(TRIM(issue_type), " ", "_")) WHERE issue_type_id IS NULL AND issue_type IS NOT NULL'
        );
      } catch (_) { /* best effort */ }

      schemaEnsured = true;
    } finally {
      schemaEnsurePromise = null;
      conn.release();
    }
  })();

  return schemaEnsurePromise;
};

const resolveSLAForTicket = async (ticketInput, connection = null) => {
  await ensureSlaResolutionSchema();
  const tenantId = toNullableInt(ticketInput?.tenant_id) || 1;
  const productId = toNullableInt(ticketInput?.product_id);
  const moduleId = toNullableInt(ticketInput?.module_id);
  const issueTypeId = normalizeIssueTypeId(ticketInput?.issue_type_id || ticketInput?.issue_type);

  const execute = async (sql, params) => {
    if (connection) return connection.execute(sql, params);
    return pool.execute(sql, params);
  };

  const baseSelect = `
    SELECT id, tenant_id, product_id, module_id, issue_type_id, issue_name,
           response_time_minutes, resolution_time_minutes, escalation_time_minutes, priority_level
    FROM sla_configurations
    WHERE is_active = TRUE AND tenant_id = ?
  `;

  const checks = [
    {
      level: MATCH_LEVELS.EXACT,
      enabled: productId !== null && moduleId !== null && issueTypeId !== null,
      sql: `${baseSelect} AND product_id = ? AND module_id = ? AND issue_type_id = ? ORDER BY id DESC LIMIT 1`,
      params: [tenantId, productId, moduleId, issueTypeId]
    },
    {
      level: MATCH_LEVELS.PRODUCT_ISSUE,
      enabled: productId !== null && issueTypeId !== null,
      sql: `${baseSelect} AND product_id = ? AND module_id IS NULL AND issue_type_id = ? ORDER BY id DESC LIMIT 1`,
      params: [tenantId, productId, issueTypeId]
    },
    {
      level: MATCH_LEVELS.PRODUCT_MODULE,
      enabled: productId !== null && moduleId !== null,
      sql: `${baseSelect} AND product_id = ? AND module_id = ? AND issue_type_id IS NULL ORDER BY id DESC LIMIT 1`,
      params: [tenantId, productId, moduleId]
    },
    {
      level: MATCH_LEVELS.PRODUCT_DEFAULT,
      enabled: productId !== null,
      sql: `${baseSelect} AND product_id = ? AND module_id IS NULL AND issue_type_id IS NULL ORDER BY id DESC LIMIT 1`,
      params: [tenantId, productId]
    },
    {
      level: MATCH_LEVELS.TENANT_DEFAULT,
      enabled: true,
      sql: `${baseSelect} AND product_id IS NULL AND module_id IS NULL AND issue_type_id IS NULL ORDER BY id DESC LIMIT 1`,
      params: [tenantId]
    }
  ];

  for (const check of checks) {
    if (!check.enabled) continue;
    const [rows] = await execute(check.sql, check.params);
    if (rows.length > 0) {
      const row = rows[0];
      return {
        config: row,
        sla_config_id: row.id,
        response_time_minutes: Number(row.response_time_minutes || SYSTEM_DEFAULT.response_time_minutes),
        resolution_time_minutes: Number(row.resolution_time_minutes || SYSTEM_DEFAULT.resolution_time_minutes),
        sla_match_level: check.level
      };
    }
  }

  return {
    config: null,
    sla_config_id: null,
    response_time_minutes: SYSTEM_DEFAULT.response_time_minutes,
    resolution_time_minutes: SYSTEM_DEFAULT.resolution_time_minutes,
    sla_match_level: MATCH_LEVELS.SYSTEM_DEFAULT
  };
};

const applyResolvedSlaToTicket = async ({ ticketId, tenantId, createdAt = null }, connection = null) => {
  const execute = async (sql, params) => {
    if (connection) return connection.execute(sql, params);
    return pool.execute(sql, params);
  };
  const [rows] = await execute(
    'SELECT id, tenant_id, product_id, module_id, issue_type_id, issue_type, created_at, sla_config_id, sla_response_time_minutes, sla_resolution_time_minutes, sla_match_level, sla_response_due_at, sla_resolution_due_at FROM tickets WHERE id = ? LIMIT 1',
    [ticketId]
  );
  if (!rows.length) return null;
  const ticket = rows[0];
  const needsResolve =
    ticket.sla_config_id === null ||
    ticket.sla_config_id === undefined ||
    ticket.sla_response_time_minutes === null ||
    ticket.sla_response_time_minutes === undefined ||
    ticket.sla_resolution_time_minutes === null ||
    ticket.sla_resolution_time_minutes === undefined;

  const resolved = needsResolve
    ? await resolveSLAForTicket({
        tenant_id: tenantId || ticket.tenant_id,
        product_id: ticket.product_id,
        module_id: ticket.module_id,
        issue_type_id: ticket.issue_type_id || ticket.issue_type
      }, connection)
    : {
        config: null,
        sla_config_id: ticket.sla_config_id ?? null,
        response_time_minutes: Number(ticket.sla_response_time_minutes || SYSTEM_DEFAULT.response_time_minutes),
        resolution_time_minutes: Number(ticket.sla_resolution_time_minutes || ticket.sla_response_time_minutes || SYSTEM_DEFAULT.resolution_time_minutes),
        sla_match_level: ticket.sla_match_level ?? null
      };

  // Backward safety: fill missing SLA snapshot fields ONCE; never override non-null values.
  try {
    await ensureSlaResolutionSchema();
    await execute(
      `UPDATE tickets
       SET issue_type_id = COALESCE(issue_type_id, ?),
           sla_config_id = COALESCE(sla_config_id, ?),
           sla_response_time_minutes = COALESCE(sla_response_time_minutes, ?),
           sla_resolution_time_minutes = COALESCE(sla_resolution_time_minutes, ?),
           sla_match_level = COALESCE(sla_match_level, ?),
           sla_response_due_at = COALESCE(sla_response_due_at, DATE_ADD(created_at, INTERVAL COALESCE(sla_response_time_minutes, ?) MINUTE)),
           sla_resolution_due_at = COALESCE(sla_resolution_due_at, DATE_ADD(created_at, INTERVAL COALESCE(sla_resolution_time_minutes, COALESCE(sla_response_time_minutes, ?)) MINUTE))
       WHERE id = ?`,
      [
        normalizeIssueTypeId(ticket.issue_type_id || ticket.issue_type),
        resolved.sla_config_id,
        resolved.response_time_minutes,
        resolved.resolution_time_minutes,
        resolved.sla_match_level,
        resolved.response_time_minutes,
        resolved.resolution_time_minutes,
        ticketId
      ]
    );
  } catch (_) {
    // best effort; do not fail callers
  }

  const base = new Date(createdAt || ticket.created_at || new Date());
  const responseDeadline = new Date(base.getTime() + resolved.response_time_minutes * 60 * 1000);
  const resolutionDeadline = new Date(base.getTime() + resolved.resolution_time_minutes * 60 * 1000);

  const [existingTimers] = await execute(
    'SELECT id, timer_type FROM sla_timers WHERE ticket_id = ?',
    [ticketId]
  );
  if (!existingTimers.length) {
    await execute(
      `INSERT INTO sla_timers (tenant_id, ticket_id, sla_configuration_id, timer_type, sla_deadline, status)
       VALUES (?, ?, ?, 'response', ?, 'active'), (?, ?, ?, 'resolution', ?, 'active')`,
      [ticket.tenant_id || tenantId || 1, ticketId, resolved.sla_config_id, responseDeadline, ticket.tenant_id || tenantId || 1, ticketId, resolved.sla_config_id, resolutionDeadline]
    );
  } else {
    await execute(
      `UPDATE sla_timers
       SET sla_configuration_id = ?,
           sla_deadline = CASE timer_type WHEN 'response' THEN ? WHEN 'resolution' THEN ? ELSE sla_deadline END,
           status = CASE WHEN timer_type IN ('response','resolution') THEN 'active' ELSE status END,
           updated_at = NOW()
       WHERE ticket_id = ?`,
      [resolved.sla_config_id, responseDeadline, resolutionDeadline, ticketId]
    );
  }
  return resolved;
};

module.exports = {
  MATCH_LEVELS,
  SYSTEM_DEFAULT,
  normalizeIssueTypeId,
  ensureSlaResolutionSchema,
  resolveSLAForTicket,
  applyResolvedSlaToTicket
};

