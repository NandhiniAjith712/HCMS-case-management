const { pool } = require('../../shared/database/database');
const TicketAssignmentService = require('../../shared/utils/ticketAssignment');
const { getNvidiaClient } = require('./nvidiaAiService');
const { getBooleanSetting } = require('./systemSettingsService');

const SUPPORT_LEVELS = new Set(['L1', 'L2', 'L3']);
const PROF_SCORE = { Beginner: 1, Intermediate: 2, Expert: 3 };
const AUTO_ASSIGN_ROLE_SQL = "AND LOWER(COALESCE(a.role, '')) IN ('support_agent', 'agent')";

let ticketAssignmentMetaEnsured = false;
async function ensureTicketAssignmentMetaColumns() {
  if (ticketAssignmentMetaEnsured) return;
  const alters = [
    "ALTER TABLE tickets ADD COLUMN assignment_source ENUM('ai','fallback','fallback_l1_least_load','manual') NULL AFTER assigned_by",
    'ALTER TABLE tickets ADD COLUMN assignment_reason VARCHAR(255) NULL AFTER assignment_source'
  ];
  for (const sql of alters) {
    try {
      await pool.execute(sql);
    } catch (e) {
      if (e?.code !== 'ER_DUP_FIELDNAME') {
        // Keep additive-only behavior: do not fail ticket flows.
        console.warn('⚠️ ensureTicketAssignmentMetaColumns:', e?.message || e);
      }
    }
  }
  // If assignment_source exists but enum is old, widen it (best-effort).
  try {
    await pool.execute(
      "ALTER TABLE tickets MODIFY COLUMN assignment_source ENUM('ai','fallback','fallback_l1_least_load','manual') NULL"
    );
  } catch (e) {
    // Ignore if not supported / no permission / already widened.
  }
  ticketAssignmentMetaEnsured = true;
}

let agentSkillsEnsured = false;
async function ensureAgentSkillsTable() {
  if (agentSkillsEnsured) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS agent_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        agent_id INT NOT NULL,
        domain VARCHAR(80) NOT NULL,
        sub_skill VARCHAR(80) NOT NULL,
        proficiency ENUM('Beginner','Intermediate','Expert') NOT NULL DEFAULT 'Beginner',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_agent_skill (tenant_id, agent_id, domain, sub_skill),
        KEY idx_agent_skill_lookup (tenant_id, domain, sub_skill, proficiency),
        KEY idx_agent_skill_agent (tenant_id, agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.warn('⚠️ ensureAgentSkillsTable:', e?.message || e);
  }
  agentSkillsEnsured = true;
}

let agentRoutingColumnsEnsured = false;
async function ensureAgentRoutingColumns() {
  if (agentRoutingColumnsEnsured) return;
  // Keep additive-only: best-effort schema smoothing so allocator SQL won't crash.
  const alters = [
    "ALTER TABLE agents ADD COLUMN level ENUM('L1','L2','L3') NULL DEFAULT NULL",
    "ALTER TABLE agents ADD COLUMN availability_status ENUM('available', 'unavailable', 'on_leave') NOT NULL DEFAULT 'available'"
  ];
  for (const sql of alters) {
    try {
      await pool.execute(sql);
    } catch (e) {
      if (e?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('⚠️ ensureAgentRoutingColumns:', e?.message || e);
      }
    }
  }
  agentRoutingColumnsEnsured = true;
}

let ticketRoutingColumnsEnsured = false;
async function ensureTicketRoutingColumns() {
  if (ticketRoutingColumnsEnsured) return;
  // Some environments have older tickets schema; allocator/workload queries must not crash.
  const alters = [
    "ALTER TABLE tickets ADD COLUMN current_level ENUM('L1','L2','L3','MANAGER') NOT NULL DEFAULT 'L1' AFTER assigned_to",
    'ALTER TABLE tickets ADD COLUMN current_owner_id INT NULL AFTER current_level'
  ];
  for (const sql of alters) {
    try {
      await pool.execute(sql);
    } catch (e) {
      if (e?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('⚠️ ensureTicketRoutingColumns:', e?.message || e);
      }
    }
  }
  ticketRoutingColumnsEnsured = true;
}

async function hasTicketColumn(columnName) {
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tickets'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [columnName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function ticketOwnerExprSql() {
  // Avoid referencing missing columns in SQL text (MySQL parses column names even inside COALESCE).
  const hasOwner = await hasTicketColumn('current_owner_id');
  return hasOwner ? 'COALESCE(t.current_owner_id, t.assigned_to)' : 't.assigned_to';
}

async function hasTable(tableName) {
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
       LIMIT 1`,
      [tableName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function getLinkedGroupInfo({ tenantId, ticketId }) {
  const hasItems = await hasTable('ticket_link_group_items');
  if (!hasItems) return { groupId: null, primaryTicketId: null };
  const [g] = await pool.execute(
    `SELECT group_id
     FROM ticket_link_group_items
     WHERE tenant_id = ? AND ticket_id = ?
     LIMIT 1`,
    [tenantId, ticketId]
  );
  const groupId = Number(g?.[0]?.group_id || 0) || null;
  if (!groupId) return { groupId: null, primaryTicketId: null };
  const [gr] = await pool.execute(
    `SELECT primary_ticket_id
     FROM ticket_link_groups
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, groupId]
  );
  const primaryTicketId = Number(gr?.[0]?.primary_ticket_id || 0) || null;
  return { groupId, primaryTicketId };
}

function normalizeLevel(v) {
  const upper = String(v || '').trim().toUpperCase();
  return SUPPORT_LEVELS.has(upper) ? upper : 'L1';
}

function clampText(v, n) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.length > n ? s.slice(0, n) : s;
}

function levelRank(level) {
  const l = normalizeLevel(level);
  if (l === 'L3') return 3;
  if (l === 'L2') return 2;
  return 1;
}

function bumpLevelForDevSignals(analysis, ticket) {
  // If ticket content clearly indicates code/API debugging, ensure at least L2.
  const domain = String(analysis?.required_domain || '').toLowerCase();
  const sub = String(analysis?.required_sub_skill || '').toLowerCase();
  const text = `${ticket?.issue_title || ''}\n${ticket?.issue_type || ''}\n${ticket?.description || ''}`.toLowerCase();

  const devSignal =
    domain === 'development' ||
    domain === 'access' ||
    sub.includes('api') ||
    sub.includes('auth') ||
    sub.includes('sso') ||
    sub.includes('login') ||
    text.includes('api') ||
    text.includes('auth') ||
    text.includes('login') ||
    text.includes('log in') ||
    text.includes('sign in') ||
    text.includes('sso') ||
    text.includes('mfa') ||
    text.includes('unauthorized') ||
    text.includes('forbidden') ||
    text.includes('token') ||
    text.includes('endpoint') ||
    text.includes('500') ||
    text.includes('debug') ||
    text.includes('exception') ||
    text.includes('stack trace') ||
    text.includes('code fix') ||
    text.includes('code-level');

  if (devSignal) {
    const current = normalizeLevel(analysis?.required_level);
    if (levelRank(current) < 2) {
      return {
        ...analysis,
        required_domain: analysis.required_domain || 'Development',
        required_sub_skill: analysis.required_sub_skill || 'Auth',
        required_level: 'L2'
      };
    }
  }
  return analysis;
}

function bumpLevelForDeploymentSignals(analysis, ticket) {
  // If ticket indicates production outage / post-release instability, ensure L3 Deployment.
  const domain = String(analysis?.required_domain || '').toLowerCase();
  const sub = String(analysis?.required_sub_skill || '').toLowerCase();
  const text = `${ticket?.issue_title || ''}\n${ticket?.issue_type || ''}\n${ticket?.description || ''}`.toLowerCase();

  const hasOutageSignal =
    text.includes('service unavailable') ||
    text.includes('503') ||
    text.includes('502') ||
    text.includes('504') ||
    text.includes('gateway') ||
    text.includes('bad gateway') ||
    text.includes('outage') ||
    text.includes('down') ||
    text.includes('cannot open') ||
    text.includes("can't open") ||
    text.includes('not opening') ||
    text.includes('page not loading');

  const hasReleaseSignal =
    text.includes('deploy') ||
    text.includes('deployment') ||
    text.includes('release') ||
    text.includes('latest update') ||
    text.includes('after the update') ||
    text.includes('after update') ||
    text.includes('after the release') ||
    text.includes('since the update') ||
    text.includes('since update') ||
    text.includes('production');

  const hasPerfSignal =
    text.includes('slow') ||
    text.includes('latency') ||
    text.includes('takes too long') ||
    text.includes('timeout') ||
    text.includes('spinning') ||
    text.includes('stuck loading');

  const deploySignal =
    domain === 'deployment' ||
    sub.includes('ci/cd') ||
    sub.includes('kubernetes') ||
    sub.includes('docker') ||
    sub.includes('pipeline') ||
    hasOutageSignal ||
    (hasPerfSignal && hasReleaseSignal);

  if (deploySignal) {
    const current = normalizeLevel(analysis?.required_level);
    if (levelRank(current) < 3) {
      return {
        ...analysis,
        required_domain: 'Deployment',
        required_sub_skill: analysis.required_sub_skill || (text.includes('kubernetes') || text.includes('k8s') ? 'Kubernetes' : 'CI/CD'),
        required_level: 'L3'
      };
    }
  }
  return analysis;
}

function withTimeout(promise, ms) {
  const t = Number(ms || 0) || 0;
  if (t <= 0) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout after ${t}ms`)), t);
    Promise.resolve(promise)
      .then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

function heuristicAnalyzeTicket({ issueTitle, description, issueType }) {
  const text = `${issueTitle || ''}\n${issueType || ''}\n${description || ''}`.toLowerCase();
  const has = (w) => text.includes(w);

  // Auth/login tickets: user-facing language often says "login/sign in" rather than "auth".
  if (
    has('login') ||
    has('log in') ||
    has('sign in') ||
    has('sso') ||
    has('mfa') ||
    has('unauthorized') ||
    has('forbidden') ||
    has('token expired')
  ) {
    return {
      required_domain: 'Development',
      required_sub_skill: 'Auth',
      required_level: 'L2',
      confidence: 'low',
      reason: 'Login/SSO/MFA access issue detected; routed to L2 Development (Auth).'
    };
  }

  // Deployment / release instability: user wording often says "service unavailable" / "slow after update".
  const outageSignal =
    has('service unavailable') ||
    has('bad gateway') ||
    has('gateway') ||
    has('502') ||
    has('503') ||
    has('504') ||
    has('outage') ||
    (has('down') && (has('prod') || has('production') || has('app')));
  const releaseSignal =
    has('deploy') ||
    has('deployment') ||
    has('release') ||
    has('latest update') ||
    has('after update') ||
    has('after the update') ||
    has('since update') ||
    has('since the update') ||
    has('production');
  const perfSignal =
    has('slow') ||
    has('latency') ||
    has('timeout') ||
    has('spinning') ||
    has('stuck loading') ||
    has('not loading') ||
    has('page not loading');

  if (has('ci/cd') || has('cicd') || has('pipeline') || has('docker') || has('kubernetes') || has('k8s') || has('helm')) {
    return {
      required_domain: 'Deployment',
      required_sub_skill: has('kubernetes') || has('k8s') ? 'Kubernetes' : 'CI/CD',
      required_level: 'L3',
      confidence: 'low',
      reason: 'Deployment pipeline/infra keyword detected (CI/CD/Kubernetes); routed to L3 Deployment support.'
    };
  }
  if (outageSignal || (perfSignal && releaseSignal)) {
    return {
      required_domain: 'Deployment',
      required_sub_skill: 'Release',
      required_level: 'L3',
      confidence: 'low',
      reason: 'Post-release instability/outage signal detected; routed to L3 Deployment support.'
    };
  }

  if (has('deploy') || has('pipeline') || has('ci/cd') || has('cicd') || has('docker') || has('kubernetes') || has('k8s')) {
    return {
      required_domain: 'Deployment',
      required_sub_skill: has('kubernetes') || has('k8s') ? 'Kubernetes' : 'CI/CD',
      required_level: 'L3',
      confidence: 'low',
      reason: 'Deployment pipeline failure detected (CI/CD/Kubernetes); routed to L3 Deployment support.'
    };
  }
  if (has('test') || has('qa') || has('regression') || has('selenium') || has('playwright')) {
    return {
      required_domain: 'Testing',
      required_sub_skill: 'QA',
      required_level: 'L1',
      confidence: 'low',
      reason: 'Testing/QA request detected (regression/validation); routed to L1 Testing support.'
    };
  }
  if (has('api') || has('auth') || has('endpoint') || has('500') || has('exception') || has('stack trace') || has('code fix') || has('debug')) {
    const sub = has('auth') ? 'Auth' : 'API';
    return {
      required_domain: 'Development',
      required_sub_skill: sub,
      required_level: 'L2',
      confidence: 'low',
      reason: `Backend ${sub} issue detected (API/debugging/code fix); routed to L2 Development support.`
    };
  }
  return {
    required_domain: 'Other',
    required_sub_skill: 'General',
    required_level: 'L1',
    confidence: 'low',
    reason: 'General support request; routed to L1 support for initial triage.'
  };
}

async function analyzeTicketRequiredSkills({ issueTitle, description, issueType }) {
  const client = getNvidiaClient();
  const prompt = `
You are helping route IT support tickets to agents by skill.
Given ticket details, extract:
- required_domain: one of ["Development","Testing","Deployment","Configuration","Data","Infrastructure","Access","Billing","Support","Other"]
- required_sub_skill: short 1-3 words, e.g. "Auth", "API", "Config", "Payments", "SSO"
- required_level: one of ["L1","L2","L3"] where L3 is highest complexity.
  Mapping guidance:
  - L1: basic how-to, simple checks, known fixes, standard testing requests
  - L2: requires code-level fix, backend/API debugging, deeper configuration or data investigation
  - L3: production deployment outage, complex infra/CI/CD, high-risk rollback, multi-system impact
- confidence: one of ["low","medium","high"]
- reason: short explanation <= 140 chars, no sensitive data.

Ticket:
Title: ${clampText(issueTitle, 180)}
Issue type: ${clampText(issueType, 80)}
Description: ${clampText(description, 1800)}
  `.trim();

  const system = 'You classify ticket routing needs for internal staff only.';
  // Keep allocator fast. If NVIDIA is slow/unavailable, use heuristic routing.
  const timeoutMs = Number(process.env.AI_ROUTING_MODEL_TIMEOUT_MS || 1500);
  const json = await withTimeout(client.jsonResponse(prompt, system, 0, 220), timeoutMs)
    .catch(() => null);
  if (!json) return heuristicAnalyzeTicket({ issueTitle, description, issueType });

  const required_domain = clampText(json?.required_domain, 80) || 'Other';
  const required_sub_skill = clampText(json?.required_sub_skill, 80) || 'General';
  const required_level = normalizeLevel(json?.required_level);
  const confidence = String(json?.confidence || '').trim().toLowerCase();
  const reason = clampText(json?.reason, 140) || 'Matched based on ticket content.';
  return { required_domain, required_sub_skill, required_level, confidence, reason };
}

async function findBestAgentByDomain({ tenantId, required_domain, required_level, departmentId = null }) {
  await ensureAgentSkillsTable();
  await ensureAgentRoutingColumns();
  await ensureTicketRoutingColumns();
  const level = normalizeLevel(required_level);
  const dom = String(required_domain || '').trim();
  const reqRank = levelRank(level);
  const ownerExpr = await ticketOwnerExprSql();

  let sql = `
    SELECT
      a.id,
      a.name,
      a.email,
      a.level,
      CASE COALESCE(a.level, 'L1')
        WHEN 'L1' THEN 1
        WHEN 'L2' THEN 2
        WHEN 'L3' THEN 3
        ELSE 1
      END AS lvl_rank,
      MAX(CASE s.proficiency
        WHEN 'Expert' THEN 3
        WHEN 'Intermediate' THEN 2
        ELSE 1
      END) AS prof_score,
      COALESCE(w.active_tickets, 0) AS active_tickets
    FROM agents a
    JOIN agent_skills s
      ON s.agent_id = a.id
     AND s.tenant_id = ?
     AND LOWER(TRIM(s.domain)) = LOWER(TRIM(?))
    LEFT JOIN (
      SELECT
        ${ownerExpr} AS agent_id,
        COUNT(*) AS active_tickets
      FROM tickets t
      WHERE ${ownerExpr} IS NOT NULL
        AND t.status IN ('new', 'in_progress', 'escalated')
        AND (t.tenant_id = ? OR t.tenant_id IS NULL)
      GROUP BY ${ownerExpr}
    ) w ON w.agent_id = a.id
    WHERE a.is_active = TRUE
  `;
  const params = [tenantId, dom, tenantId];
  if (departmentId) {
    sql += ` AND a.primary_department_id = ?`;
    params.push(departmentId);
  }
  sql += `
    AND (CASE COALESCE(a.level, 'L1')
      WHEN 'L1' THEN 1
      WHEN 'L2' THEN 2
      WHEN 'L3' THEN 3
      ELSE 1
    END) >= ?
    GROUP BY a.id, a.name, a.email, a.level, w.active_tickets
    ORDER BY lvl_rank ASC, prof_score DESC, active_tickets ASC, a.id ASC
    LIMIT 1
  `;
  params.push(reqRank);

  try {
    const [rows] = await pool.execute(sql, params);
    return rows?.[0] || null;
  } catch (e) {
    // If older DB lacks current_owner_id or other newer columns, fail gracefully to allow other fallbacks.
    console.warn('⚠️ findBestAgentByDomain failed:', e?.message || e);
    return null;
  }
}

async function findBestAgentBySkill({ tenantId, required_domain, required_sub_skill, required_level, departmentId = null }) {
  await ensureAgentSkillsTable();
  await ensureAgentRoutingColumns();
  await ensureTicketRoutingColumns();
  const level = normalizeLevel(required_level);
  const dom = String(required_domain || '').trim();
  const sub = String(required_sub_skill || '').trim();
  const reqRank = levelRank(level);
  const ownerExpr = await ticketOwnerExprSql();

  let sql = `
    SELECT
      a.id,
      a.name,
      a.email,
      a.level,
      CASE COALESCE(a.level, 'L1')
        WHEN 'L1' THEN 1
        WHEN 'L2' THEN 2
        WHEN 'L3' THEN 3
        ELSE 1
      END AS lvl_rank,
      s.proficiency,
      COALESCE(w.active_tickets, 0) AS active_tickets
    FROM agents a
    JOIN agent_skills s
      ON s.agent_id = a.id
     AND s.tenant_id = ?
     AND LOWER(TRIM(s.domain)) = LOWER(TRIM(?))
     AND (
       LOWER(TRIM(s.sub_skill)) = LOWER(TRIM(?))
       OR LOWER(TRIM(s.sub_skill)) LIKE CONCAT('%', LOWER(TRIM(?)), '%')
       OR LOWER(TRIM(?)) LIKE CONCAT('%', LOWER(TRIM(s.sub_skill)), '%')
     )
    LEFT JOIN (
      SELECT
        ${ownerExpr} AS agent_id,
        COUNT(*) AS active_tickets
      FROM tickets t
      WHERE ${ownerExpr} IS NOT NULL
        AND t.status IN ('new', 'in_progress', 'escalated')
        AND (t.tenant_id = ? OR t.tenant_id IS NULL)
      GROUP BY ${ownerExpr}
    ) w ON w.agent_id = a.id
    WHERE a.is_active = TRUE
  `;
  const params = [tenantId, dom, sub, sub, sub, tenantId];
  if (departmentId) {
    sql += ` AND a.primary_department_id = ?`;
    params.push(departmentId);
  }
  sql += `
    AND (CASE COALESCE(a.level, 'L1')
      WHEN 'L1' THEN 1
      WHEN 'L2' THEN 2
      WHEN 'L3' THEN 3
      ELSE 1
    END) >= ?
    ${AUTO_ASSIGN_ROLE_SQL}
    ORDER BY
      lvl_rank ASC,
      CASE s.proficiency
        WHEN 'Expert' THEN 3
        WHEN 'Intermediate' THEN 2
        ELSE 1
      END DESC,
      active_tickets ASC,
      a.id ASC
    LIMIT 1
  `;
  params.push(reqRank);

  try {
    const [rows] = await pool.execute(sql, params);
    return rows?.[0] || null;
  } catch (e) {
    console.warn('⚠️ findBestAgentBySkill failed:', e?.message || e);
    return null;
  }
}

async function findBestAgentByDepartment({ tenantId, required_domain, required_level, departmentId = null }) {
  // Fallback when agent_skills is empty/missing data: match by agents.department text.
  await ensureAgentRoutingColumns();
  await ensureTicketRoutingColumns();
  const level = normalizeLevel(required_level);
  const reqRank = levelRank(level);
  const dom = String(required_domain || '').trim().toLowerCase();
  if (!dom || dom === 'other' || dom === 'support') return null;
  const ownerExpr = await ticketOwnerExprSql();

  let sql = `
    SELECT
      a.id,
      a.name,
      a.email,
      a.level,
      CASE COALESCE(a.level, 'L1')
        WHEN 'L1' THEN 1
        WHEN 'L2' THEN 2
        WHEN 'L3' THEN 3
        ELSE 1
      END AS lvl_rank,
      COALESCE(w.active_tickets, 0) AS active_tickets
    FROM agents a
    LEFT JOIN (
      SELECT
        ${ownerExpr} AS agent_id,
        COUNT(*) AS active_tickets
      FROM tickets t
      WHERE ${ownerExpr} IS NOT NULL
        AND t.status IN ('new', 'in_progress', 'escalated')
        AND (t.tenant_id = ? OR t.tenant_id IS NULL)
      GROUP BY ${ownerExpr}
    ) w ON w.agent_id = a.id
    WHERE a.is_active = TRUE
      AND (a.tenant_id = ? OR a.tenant_id IS NULL)
      AND LOWER(COALESCE(a.department, '')) LIKE CONCAT('%', ?, '%')
  `;
  const params = [tenantId, tenantId, dom];
  if (departmentId) {
    sql += ` AND a.primary_department_id = ?`;
    params.push(departmentId);
  }
  sql += `
    AND (CASE COALESCE(a.level, 'L1')
      WHEN 'L1' THEN 1
      WHEN 'L2' THEN 2
      WHEN 'L3' THEN 3
      ELSE 1
    END) >= ?
    ${AUTO_ASSIGN_ROLE_SQL}
    ORDER BY lvl_rank ASC, active_tickets ASC, a.id ASC
    LIMIT 1
  `;
  params.push(reqRank);

  try {
    const [rows] = await pool.execute(sql, params);
    return rows?.[0] || null;
  } catch (e) {
    console.warn('⚠️ findBestAgentByDepartment failed:', e?.message || e);
    return null;
  }
}

async function findAnyAgentByLevel({ tenantId, required_level, departmentId = null }) {
  // Final step when AI worked but no agent exists in that domain/category.
  // Still AI-driven (uses required_level), but not equal distribution.
  await ensureAgentRoutingColumns();
  await ensureTicketRoutingColumns();
  const level = normalizeLevel(required_level);
  const reqRank = levelRank(level);
  const ownerExpr = await ticketOwnerExprSql();

  let sql = `
    SELECT
      a.id,
      a.name,
      a.email,
      a.level,
      CASE COALESCE(a.level, 'L1')
        WHEN 'L1' THEN 1
        WHEN 'L2' THEN 2
        WHEN 'L3' THEN 3
        ELSE 1
      END AS lvl_rank,
      COALESCE(w.active_tickets, 0) AS active_tickets
    FROM agents a
    LEFT JOIN (
      SELECT
        ${ownerExpr} AS agent_id,
        COUNT(*) AS active_tickets
      FROM tickets t
      WHERE ${ownerExpr} IS NOT NULL
        AND t.status IN ('new', 'in_progress', 'escalated')
        AND (t.tenant_id = ? OR t.tenant_id IS NULL)
      GROUP BY ${ownerExpr}
    ) w ON w.agent_id = a.id
    WHERE a.is_active = TRUE
  `;
  const params = [tenantId];
  if (departmentId) {
    sql += ` AND a.primary_department_id = ?`;
    params.push(departmentId);
  }
  sql += `
    AND (CASE COALESCE(a.level, 'L1')
      WHEN 'L1' THEN 1
      WHEN 'L2' THEN 2
      WHEN 'L3' THEN 3
      ELSE 1
    END) >= ?
    ${AUTO_ASSIGN_ROLE_SQL}
    ORDER BY lvl_rank ASC, active_tickets ASC, a.id ASC
    LIMIT 1
  `;
  params.push(reqRank);

  try {
    const [rows] = await pool.execute(sql, params);
    return rows?.[0] || null;
  } catch (e) {
    console.warn('⚠️ findAnyAgentByLevel failed:', e?.message || e);
    return null;
  }
}

async function setTicketAssignmentMeta({ ticketId, assignment_source, assignment_reason }) {
  await ensureTicketAssignmentMetaColumns();
  const src = ['ai', 'fallback', 'manual'].includes(String(assignment_source || '').toLowerCase())
    ? String(assignment_source).toLowerCase()
    : null;
  const reason = clampText(assignment_reason, 255) || null;
  if (!src && !reason) return;
  try {
    await pool.execute(
      `UPDATE tickets
       SET assignment_source = COALESCE(?, assignment_source),
           assignment_reason = COALESCE(?, assignment_reason),
           updated_at = NOW()
       WHERE id = ?`,
      [src, reason, ticketId || null]
    );
  } catch (e) {
    // Do not break assignment flow if columns cannot be updated on older DBs.
    console.warn('⚠️ setTicketAssignmentMeta skipped:', e?.message || e);
  }
}

async function maybeAutoAllocateTicket({ ticketId, tenantId }) {
  console.log(`🎯 [Allocation] Starting auto-allocation for ticket #${ticketId} (tenant: ${tenantId})`);
  // Never allow allocator failures to leave a ticket unassigned.
  let effectiveTenantId = Number(tenantId || 1) || 1;
  try {
    await ensureTicketAssignmentMetaColumns();
    await ensureAgentSkillsTable();
    await ensureAgentRoutingColumns();
    await ensureTicketRoutingColumns();

    let rows;
    try {
      const [r] = await pool.execute(
        `SELECT id, tenant_id, issue_title, description, issue_type, status,
                assigned_to, assignment_source, parent_ticket_id, department_id
         FROM tickets
         WHERE id = ?
         LIMIT 1`,
        [ticketId]
      );
      rows = r;
    } catch (e) {
      // Older schemas may not have parent_ticket_id or department_id; retry without it.
      const msg = String(e?.message || '');
      if (e?.code === 'ER_BAD_FIELD_ERROR' && (msg.includes('parent_ticket_id') || msg.includes('department_id'))) {
        const [r2] = await pool.execute(
          `SELECT id, tenant_id, issue_title, description, issue_type, status,
                  assigned_to, assignment_source
           FROM tickets
           WHERE id = ?
           LIMIT 1`,
          [ticketId]
        );
        rows = r2.map((x) => ({ ...x, parent_ticket_id: null, department_id: null }));
      } else {
        throw e;
      }
    }
    if (!rows.length) return { skipped: true, reason: 'Ticket not found' };
    const ticket = rows[0];
    effectiveTenantId = Number(ticket.tenant_id || tenantId || 1) || 1;
    const ticketDeptId = ticket.department_id || null;
    
    // 1. Check if AI allocation is enabled
    const aiEnabled = await getBooleanSetting('ai_ticket_allocation_enabled', true);
    if (!aiEnabled) {
      console.log(`🤖 AI allocation disabled. Falling back to Equal Distribution for ticket #${ticketId}`);
      const fallbackRes = await TicketAssignmentService.assignTicketEqually(ticketId, null, effectiveTenantId);
      return { 
        success: true, 
        assigned_to: fallbackRes?.agentId || null, 
        source: 'fallback_l1_least_load',
        reason: 'AI allocation disabled by system setting'
      };
    }

    // Grouped/parent-child: never assign child differently.
    if (ticket.parent_ticket_id) {
      return { skipped: true, reason: 'Child ticket inherits parent assignment' };
    }

    // Internal linked group: only primary ticket can be reassigned/allocated.
    const linkInfo = await getLinkedGroupInfo({ tenantId: effectiveTenantId, ticketId });
    if (linkInfo.groupId && linkInfo.primaryTicketId && linkInfo.primaryTicketId !== ticketId) {
      return { skipped: true, reason: 'Linked-group child; allocate from primary only' };
    }

    // Never override manager reassignment.
    if (String(ticket.assignment_source || '').toLowerCase() === 'manual') {
      return { skipped: true, reason: 'Manual reassignment already applied' };
    }

  // Analyze required skills (async call).
  let analysis;
  try {
    analysis = await analyzeTicketRequiredSkills({
      issueTitle: ticket.issue_title,
      description: ticket.description,
      issueType: ticket.issue_type
    });
    analysis = bumpLevelForDevSignals(analysis, ticket);
    analysis = bumpLevelForDeploymentSignals(analysis, ticket);
  } catch (e) {
    // If AI fails, do not break existing assignment; still mark fallback for manager visibility.
    await setTicketAssignmentMeta({
      ticketId,
      assignment_source: 'fallback',
      assignment_reason: 'AI analysis failed; used fallback'
    });
    // Ensure ticket is not left unassigned.
    try {
      await TicketAssignmentService.assignTicketEqually(ticketId, null, effectiveTenantId);
    } catch (_) {}
    return { skipped: true, reason: 'AI analysis failed' };
  }

  // Even if confidence is low, attempt to route by skill/domain first.
  // IMPORTANT policy: if AI worked, do NOT fall back to equal distribution just because sub-skill doesn't match.
  let chosen = null;
  let chosenReason = analysis.reason;
  try {
    chosen = await findBestAgentBySkill({
      tenantId: effectiveTenantId,
      required_domain: analysis.required_domain,
      required_sub_skill: analysis.required_sub_skill,
      required_level: analysis.required_level,
      departmentId: ticketDeptId
    });
    if (!chosen?.id && ticketDeptId) {
      chosen = await findBestAgentBySkill({
        tenantId: effectiveTenantId,
        required_domain: analysis.required_domain,
        required_sub_skill: analysis.required_sub_skill,
        required_level: analysis.required_level,
        departmentId: null
      });
    }
  } catch {
    chosen = null;
  }

  // If exact sub-skill match fails, assign within the same category/domain.
  if (!chosen?.id) {
    try {
      chosen = await findBestAgentByDomain({
        tenantId: effectiveTenantId,
        required_domain: analysis.required_domain,
        required_level: analysis.required_level,
        departmentId: ticketDeptId
      });
      if (!chosen?.id && ticketDeptId) {
        chosen = await findBestAgentByDomain({
          tenantId: effectiveTenantId,
          required_domain: analysis.required_domain,
          required_level: analysis.required_level,
          departmentId: null
        });
      }
      if (chosen?.id) {
        chosenReason = `No exact sub-skill match; assigned to an available ${analysis.required_domain} agent.`;
      }
    } catch {
      chosen = null;
    }
  }

  // If still no match, use department text as category fallback (still within same category).
  if (!chosen?.id) {
    try {
      chosen = await findBestAgentByDepartment({
        tenantId: effectiveTenantId,
        required_domain: analysis.required_domain,
        required_level: analysis.required_level,
        departmentId: ticketDeptId
      });
      if (!chosen?.id && ticketDeptId) {
        chosen = await findBestAgentByDepartment({
          tenantId: effectiveTenantId,
          required_domain: analysis.required_domain,
          required_level: analysis.required_level,
          departmentId: null
        });
      }
      if (chosen?.id) {
        chosenReason = `Assigned to an available ${analysis.required_domain} agent based on category routing.`;
      }
    } catch {
      chosen = null;
    }
  }

  // If there are zero agents in that category, pick any agent by required level (still AI-driven).
  if (!chosen?.id) {
    try {
      chosen = await findAnyAgentByLevel({
        tenantId: effectiveTenantId,
        required_level: analysis.required_level,
        departmentId: ticketDeptId
      });
      if (!chosen?.id && ticketDeptId) {
        chosen = await findAnyAgentByLevel({
          tenantId: effectiveTenantId,
          required_level: analysis.required_level,
          departmentId: null
        });
      }
      if (chosen?.id) {
        chosenReason = `No active ${analysis.required_domain} agents found; assigned to an available ${analysis.required_level} agent.`;
      }
    } catch {
      chosen = null;
    }
  }

  if (chosen?.id) {
    // Only update if manager hasn't manually reassigned in the meantime.
    const [after] = await pool.execute(
      `SELECT status, assignment_source
       FROM tickets WHERE id = ? LIMIT 1`,
      [ticketId]
    );
    const stillNew = String(after?.[0]?.status || '').toLowerCase() === 'new';
    const notManual = String(after?.[0]?.assignment_source || '').toLowerCase() !== 'manual';
    if (!stillNew || !notManual) {
      return { skipped: true, reason: 'Ticket no longer eligible for AI update' };
    }

    await TicketAssignmentService.assignTicketToAgent(
      ticketId,
      chosen.id,
      null,
      effectiveTenantId,
      chosenReason
    );
    await setTicketAssignmentMeta({
      ticketId,
      assignment_source: 'ai',
      assignment_reason: chosenReason
    });
    console.log(`🎯 [Allocation] AI assigned ticket #${ticketId} to agent ${chosen.id} (Source: ai)`);
    return { success: true, agentId: chosen.id, source: 'ai' };
  }

  // If AI worked but no agent was found, do not equal-distribute; leave a clear reason.
  await setTicketAssignmentMeta({
    ticketId,
    assignment_source: 'ai',
    assignment_reason: `No eligible agents found for category ${analysis.required_domain} at level ${analysis.required_level}.`
  });
  return { skipped: true, reason: 'No eligible agents found for AI-based category routing' };
  } catch (e) {
    console.warn('AI allocation job failed (will attempt fallback):', e?.message || e);
    try {
      await setTicketAssignmentMeta({
        ticketId,
        assignment_source: 'fallback',
        assignment_reason: `Allocator error; used fallback: ${(String(e?.message || e) || '').slice(0, 160)}`
      });
    } catch (_) {}
    try {
      const fallbackRes = await TicketAssignmentService.assignTicketEqually(ticketId, null, effectiveTenantId);
      const assignedId = fallbackRes?.data?.assigned_to || fallbackRes?.agentId;
      console.log(`🎯 [Allocation] Fallback assigned ticket #${ticketId} to agent ${assignedId}`);
      return { success: true, assigned_to: assignedId || null, source: 'fallback' };
    } catch (fallbackErr) {
      console.error(`🎯 [Allocation] Fallback failed for ticket #${ticketId}:`, fallbackErr.message);
      return { skipped: true, reason: `Fallback assignment failed: ${fallbackErr?.message || fallbackErr}` };
    }
  }
}

function enqueueAllocation({ ticketId, tenantId }) {
  // Non-blocking: do not await in request handlers.
  setImmediate(() => {
    void maybeAutoAllocateTicket({ ticketId, tenantId }).catch((e) => {
      console.warn('AI allocation job failed:', e?.message || e);
    });
  });
}

module.exports = {
  ensureTicketAssignmentMetaColumns,
  ensureAgentSkillsTable,
  maybeAutoAllocateTicket,
  enqueueAllocation
};

