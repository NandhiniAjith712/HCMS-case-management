const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database');
const { upload, ticketAttachmentsUpload, handleUploadError } = require('../middleware/upload');
const { setTenantContext, verifyTenantAccess } = require('../middleware/tenant');
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');
const TextFormatter = require('../utils/textFormatter');
const TicketAssignmentService = require('../utils/ticketAssignment');
const emailService = require('../services/emailService');
const ticketActivityService = require('../services/ticketActivityService');
const wsInstanceStore = require('../websocket-instance');
const { getNvidiaClient } = require('../services/nvidiaAiService');
const {
  normalizeIssueTypeId,
  ensureSlaResolutionSchema,
  resolveSLAForTicket,
  applyResolvedSlaToTicket
} = require('../services/slaResolutionService');

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { extractAttachmentText } = require('../services/attachmentTextExtractor');
const { analyzeAttachmentText } = require('../services/aiAttachmentAnalysisService');
const ticketEventNotificationService = require('../services/ticketEventNotificationService');
const { syncExecutiveAgentLevelsToNull } = require('../utils/agentLevelSync');
const { enqueueAllocation, maybeAutoAllocateTicket, ensureTicketAssignmentMetaColumns } = require('../services/aiAgentAllocationService');
const { getBooleanSetting } = require('../services/systemSettingsService');
const { ensureKnowledgeBaseSchema } = require('./knowledge');
const { calculatePriority, generatePriorityReason, DEFAULTS: PRIORITY_DEFAULTS } = require('../services/priorityService');
const ticketService = require('../services/ticketService');

// WhatsApp API configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "521803094347148";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Add timeout and retry configuration
const axiosConfig = {
  timeout: 15000, // 15 seconds
  headers: {
    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Tick-System/1.0'
  },
  // Uncomment if you need to use a proxy
  // proxy: {
  //   host: 'proxy.company.com',
  //   port: 8080,
  //   auth: {
  //     username: 'username',
  //     password: 'password'
  //   }
  // }
};

// Function to send WhatsApp message
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // Check if WhatsApp is properly configured
    if (!WHATSAPP_ACCESS_TOKEN || WHATSAPP_ACCESS_TOKEN === 'YOUR_ACTUAL_NEW_TOKEN_FROM_META_DEVELOPER_CONSOLE' || !WHATSAPP_PHONE_NUMBER_ID) {
      console.log('❌ WhatsApp API not configured');
      console.log('💡 WhatsApp notifications are temporarily disabled until you get a valid access token');
      return null;
    }

    console.log(`📤 Attempting to send WhatsApp message to ${phoneNumber}`);
    console.log(`🌐 API URL: ${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`);

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message
        }
      },
      axiosConfig
    );

    console.log('✅ WhatsApp notification sent successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.error('❌ Network error: Cannot reach Facebook Graph API. Check your internet connection.');
    } else if (error.code === 'ECONNABORTED') {
      console.error('❌ Timeout error: Request took too long to complete.');
    } else {
      console.error('❌ Error sending WhatsApp notification:', error.response?.data || error.message);
    }
    return null;
  }
}

const router = express.Router();

// Apply tenant context to all routes (except auto-login which might not have tenant yet)
router.use(setTenantContext);

// --- Lightweight in-memory caching (no external infra) ---
// Enable with CACHE_ENABLED=1. Intended for frequent reads (ticket list, FAQs, etc.).
const CACHE_ENABLED = process.env.CACHE_ENABLED === '1';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 45_000); // 30–60s recommended
const __cache = global.__itsmSimpleCache || (global.__itsmSimpleCache = new Map());
const cacheGet = (key) => {
  if (!CACHE_ENABLED) return null;
  const hit = __cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    __cache.delete(key);
    return null;
  }
  return hit.value;
};
const cacheSet = (key, value, ttlMs = CACHE_TTL_MS) => {
  if (!CACHE_ENABLED) return;
  __cache.set(key, { value, expiresAt: Date.now() + ttlMs });
};
const cacheInvalidateTicketsLists = () => {
  if (!CACHE_ENABLED) return;
  // Only invalidate ticket list caches (keep other cached data like FAQs).
  for (const k of __cache.keys()) {
    if (typeof k === 'string' && k.startsWith('tickets:list:')) {
      __cache.delete(k);
    }
  }
};

// Cache tickets table columns to avoid runtime failures when optional columns are missing
const ticketsColumnCache = new Map();
const ticketsHasColumn = async (columnName) => {
  if (ticketsColumnCache.has(columnName)) return ticketsColumnCache.get(columnName);
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
    const exists = rows.length > 0;
    ticketsColumnCache.set(columnName, exists);
    return exists;
  } catch (error) {
    console.warn(`⚠️ Could not verify tickets.${columnName}:`, error.message);
    ticketsColumnCache.set(columnName, false);
    return false;
  }
};

// --- Customer escalation schema (minimal, additive) ---
let customerEscalationSchemaEnsured = false;
const ensureCustomerEscalationSchema = async () => {
  if (customerEscalationSchemaEnsured) return true;
  try {
    const adds = [];
    if (!(await ticketsHasColumn('is_escalated'))) {
      adds.push(`ADD COLUMN is_escalated TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!(await ticketsHasColumn('escalation_level'))) {
      adds.push(`ADD COLUMN escalation_level INT NOT NULL DEFAULT 0`);
    }
    if (!(await ticketsHasColumn('escalation_reason'))) {
      adds.push(`ADD COLUMN escalation_reason VARCHAR(64) NULL`);
    }
    if (!(await ticketsHasColumn('escalation_comment'))) {
      adds.push(`ADD COLUMN escalation_comment TEXT NULL`);
    }
    if (!(await ticketsHasColumn('escalated_at'))) {
      adds.push(`ADD COLUMN escalated_at DATETIME NULL`);
    }
    if (!(await ticketsHasColumn('last_agent_reply_at'))) {
      adds.push(`ADD COLUMN last_agent_reply_at DATETIME NULL`);
    }
    if (adds.length) {
      await pool.execute(`ALTER TABLE tickets ${adds.join(', ')}`);
      // Refresh cache for new columns
      ['is_escalated','escalation_level','escalation_reason','escalation_comment','escalated_at','last_agent_reply_at'].forEach((c) => ticketsColumnCache.delete(c));
    }
    customerEscalationSchemaEnsured = true;
    return true;
  } catch (e) {
    console.warn('⚠️ Could not ensure customer escalation schema:', e?.message || e);
    // Do not hard fail routes; schema can be migrated separately.
    customerEscalationSchemaEnsured = true;
    return false;
  }
};

const ensureTicketsReopenedColumn = async () => {
  const hasIsReopened = await ticketsHasColumn('is_reopened');
  if (hasIsReopened) return true;
  try {
    await pool.execute(
      `ALTER TABLE tickets
       ADD COLUMN is_reopened TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 when customer explicitly reopens a closed ticket'`
    );
    ticketsColumnCache.set('is_reopened', true);
    return true;
  } catch (error) {
    if (error && error.code === 'ER_DUP_FIELDNAME') {
      ticketsColumnCache.set('is_reopened', true);
      return true;
    }
    console.warn('⚠️ Could not ensure tickets.is_reopened column:', error.message);
    return false;
  }
};

const ensureTicketsReopenedAtColumn = async () => {
  const hasReopenedAt = await ticketsHasColumn('reopened_at');
  if (hasReopenedAt) return true;
  try {
    await pool.execute(
      `ALTER TABLE tickets
       ADD COLUMN reopened_at DATETIME NULL COMMENT 'Last time this ticket was reopened (customer rejection / reopen flow)'`
    );
    ticketsColumnCache.set('reopened_at', true);
    return true;
  } catch (error) {
    if (error && error.code === 'ER_DUP_FIELDNAME') {
      ticketsColumnCache.set('reopened_at', true);
      return true;
    }
    console.warn('⚠️ Could not ensure tickets.reopened_at column:', error.message);
    return false;
  }
};

const ensureTicketsReopenCountColumn = async () => {
  const hasReopenCount = await ticketsHasColumn('reopen_count');
  if (hasReopenCount) return true;
  try {
    await pool.execute(
      `ALTER TABLE tickets
       ADD COLUMN reopen_count INT NOT NULL DEFAULT 0 COMMENT 'Number of times ticket has been reopened'`
    );
    ticketsColumnCache.set('reopen_count', true);
    return true;
  } catch (error) {
    if (error && error.code === 'ER_DUP_FIELDNAME') {
      ticketsColumnCache.set('reopen_count', true);
      return true;
    }
    console.warn('⚠️ Could not ensure tickets.reopen_count column:', error.message);
    return false;
  }
};

const ensureTicketsReopenReasonColumn = async () => {
  const hasReason = await ticketsHasColumn('reopen_reason');
  if (hasReason) return true;
  try {
    await pool.execute(
      `ALTER TABLE tickets
       ADD COLUMN reopen_reason TEXT NULL COMMENT 'Last customer-provided reason for reopening (closed -> in_progress)'`
    );
    ticketsColumnCache.set('reopen_reason', true);
    return true;
  } catch (error) {
    if (error && error.code === 'ER_DUP_FIELDNAME') {
      ticketsColumnCache.set('reopen_reason', true);
      return true;
    }
    console.warn('⚠️ Could not ensure tickets.reopen_reason column:', error.message);
    return false;
  }
};

const AI_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];
const AI_CONFIDENCE_VALUES = ['low', 'medium', 'high'];

const ensureTicketPriorityAiColumns = async () => {
  const specs = [
    { name: 'ai_predicted_priority', sql: "ALTER TABLE tickets ADD COLUMN ai_predicted_priority ENUM('low','medium','high','urgent') NULL AFTER priority" },
    { name: 'ai_priority_reason', sql: "ALTER TABLE tickets ADD COLUMN ai_priority_reason TEXT NULL AFTER ai_predicted_priority" },
    { name: 'ai_priority_confidence', sql: "ALTER TABLE tickets ADD COLUMN ai_priority_confidence ENUM('low','medium','high') NULL AFTER ai_priority_reason" },
    { name: 'priority_overridden_by_manager', sql: "ALTER TABLE tickets ADD COLUMN priority_overridden_by_manager INT NULL AFTER ai_priority_confidence" },
    { name: 'priority_override_reason', sql: "ALTER TABLE tickets ADD COLUMN priority_override_reason TEXT NULL AFTER priority_overridden_by_manager" },
    { name: 'priority_overridden_at', sql: "ALTER TABLE tickets ADD COLUMN priority_overridden_at DATETIME NULL AFTER priority_override_reason" },
    // Business-impact priority (additive; safe)
    { name: 'affected_users', sql: "ALTER TABLE tickets ADD COLUMN affected_users VARCHAR(50) NULL AFTER issue_title" },
    { name: 'business_impact', sql: "ALTER TABLE tickets ADD COLUMN business_impact VARCHAR(50) NULL AFTER affected_users" },
    { name: 'priority_score', sql: "ALTER TABLE tickets ADD COLUMN priority_score FLOAT NULL AFTER priority" },
    { name: 'priority_reason', sql: "ALTER TABLE tickets ADD COLUMN priority_reason TEXT NULL AFTER priority_score" },
    { name: 'priority_source', sql: "ALTER TABLE tickets ADD COLUMN priority_source VARCHAR(20) NOT NULL DEFAULT 'ai' AFTER priority_reason" },
    // Module policy: user selects priority (AI verifies) metadata (additive; safe)
    { name: 'user_selected_priority', sql: "ALTER TABLE tickets ADD COLUMN user_selected_priority VARCHAR(20) NULL AFTER priority_source" },
    { name: 'ai_suggested_priority', sql: "ALTER TABLE tickets ADD COLUMN ai_suggested_priority VARCHAR(20) NULL AFTER user_selected_priority" },
    { name: 'priority_match', sql: "ALTER TABLE tickets ADD COLUMN priority_match TINYINT(1) NULL AFTER ai_suggested_priority" }
  ];
  for (const spec of specs) {
    const exists = await ticketsHasColumn(spec.name);
    if (exists) continue;
    try {
      await pool.execute(spec.sql);
      ticketsColumnCache.set(spec.name, true);
    } catch (error) {
      if (error?.code === 'ER_DUP_FIELDNAME') {
        ticketsColumnCache.set(spec.name, true);
      } else {
        console.warn(`⚠️ Could not ensure tickets.${spec.name}:`, error?.message || error);
      }
    }
  }
};

const ensureTicketEtaColumns = async () => {
  const specs = [
    {
      name: 'eta_due_at',
      sql: 'ALTER TABLE tickets ADD COLUMN eta_due_at DATETIME NULL AFTER resolution_time'
    },
    {
      name: 'eta_reason',
      sql: 'ALTER TABLE tickets ADD COLUMN eta_reason VARCHAR(500) NULL AFTER eta_due_at'
    },
    {
      name: 'eta_updated_by',
      sql: 'ALTER TABLE tickets ADD COLUMN eta_updated_by INT NULL AFTER eta_reason'
    },
    {
      name: 'eta_updated_at',
      sql: 'ALTER TABLE tickets ADD COLUMN eta_updated_at DATETIME NULL AFTER eta_updated_by'
    }
  ];
  for (const spec of specs) {
    const exists = await ticketsHasColumn(spec.name);
    if (exists) continue;
    try {
      await pool.execute(spec.sql);
      ticketsColumnCache.set(spec.name, true);
    } catch (error) {
      if (error?.code === 'ER_DUP_FIELDNAME') {
        ticketsColumnCache.set(spec.name, true);
      } else {
        console.warn(`⚠️ Could not ensure tickets.${spec.name}:`, error?.message || error);
      }
    }
  }
};

const RESOLUTION_FIX_TYPES = [
  'Configuration Issue',
  'Data Fix',
  'Code Fix',
  'User Error',
  'External Dependency'
];

let ticketResolutionSchemaEnsured = false;
const ensureTicketResolutionSchema = async () => {
  if (ticketResolutionSchemaEnsured) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ticket_resolution_details (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        ticket_id INT NOT NULL,
        resolution_summary TEXT NOT NULL,
        internal_steps TEXT NOT NULL,
        root_cause TEXT NULL,
        fix_type ENUM('Configuration Issue','Data Fix','Code Fix','User Error','External Dependency') NOT NULL,
        reference_data VARCHAR(500) NULL,
        attachment_name VARCHAR(255) NULL,
        attachment_path VARCHAR(500) NULL,
        attachment_mime VARCHAR(120) NULL,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ticket_resolution_details_ticket (ticket_id),
        KEY idx_ticket_resolution_details_tenant_ticket (tenant_id, ticket_id),
        CONSTRAINT fk_ticket_resolution_details_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Backfill columns for existing installs (ignore dup errors).
    try { await pool.execute(`ALTER TABLE ticket_resolution_details ADD COLUMN attachment_name VARCHAR(255) NULL`); } catch (e) { if (e?.code !== 'ER_DUP_FIELDNAME') console.warn('ticket_resolution_details.attachment_name:', e?.message); }
    try { await pool.execute(`ALTER TABLE ticket_resolution_details ADD COLUMN attachment_path VARCHAR(500) NULL`); } catch (e) { if (e?.code !== 'ER_DUP_FIELDNAME') console.warn('ticket_resolution_details.attachment_path:', e?.message); }
    try { await pool.execute(`ALTER TABLE ticket_resolution_details ADD COLUMN attachment_mime VARCHAR(120) NULL`); } catch (e) { if (e?.code !== 'ER_DUP_FIELDNAME') console.warn('ticket_resolution_details.attachment_mime:', e?.message); }
    ticketResolutionSchemaEnsured = true;
  } catch (error) {
    console.warn('⚠️ Could not ensure ticket_resolution_details table:', error?.message || error);
  }
};

const sanitizeResolutionInput = (payload = {}) => {
  const resolutionSummary = String(payload.resolution_summary || '').trim();
  const internalSteps = String(payload.internal_steps || '').trim();
  const rootCause = String(payload.root_cause || '').trim();
  const fixType = String(payload.fix_type || '').trim();
  const referenceData = String(payload.reference_data || '').trim();
  return {
    resolution_summary: resolutionSummary,
    internal_steps: internalSteps,
    root_cause: rootCause || null,
    fix_type: fixType,
    reference_data: referenceData || null
  };
};

const validateResolutionInput = (resolution) => {
  if (!resolution.resolution_summary || resolution.resolution_summary.length < 5) {
    return 'Resolution summary is required (minimum 5 characters).';
  }
  if (!resolution.internal_steps || resolution.internal_steps.length < 5) {
    return 'Internal resolution steps are required (minimum 5 characters).';
  }
  if (!RESOLUTION_FIX_TYPES.includes(resolution.fix_type)) {
    return 'Fix type is required and must be one of the supported options.';
  }
  if (resolution.reference_data && resolution.reference_data.length > 500) {
    return 'Reference data must be 500 characters or less.';
  }
  return null;
};

const getTicketResolutionDetails = async (ticketId, tenantId) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, ticket_id, resolution_summary, internal_steps, root_cause, fix_type, reference_data,
              attachment_name, attachment_path, attachment_mime,
              created_by, created_at, updated_at
       FROM ticket_resolution_details
       WHERE ticket_id = ? AND tenant_id = ?
       LIMIT 1`,
      [ticketId, tenantId]
    );
    return rows[0] || null;
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('⚠️ Could not fetch ticket resolution details:', error?.message || error);
    }
    return null;
  }
};

const upsertTicketResolutionDetails = async ({ ticketId, tenantId, actorId, resolution, attachment = null }) => {
  await pool.execute(
    `INSERT INTO ticket_resolution_details
      (tenant_id, ticket_id, resolution_summary, internal_steps, root_cause, fix_type, reference_data, attachment_name, attachment_path, attachment_mime, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       resolution_summary = VALUES(resolution_summary),
       internal_steps = VALUES(internal_steps),
       root_cause = VALUES(root_cause),
       fix_type = VALUES(fix_type),
       reference_data = VALUES(reference_data),
       attachment_name = COALESCE(VALUES(attachment_name), attachment_name),
       attachment_path = COALESCE(VALUES(attachment_path), attachment_path),
       attachment_mime = COALESCE(VALUES(attachment_mime), attachment_mime),
       created_by = VALUES(created_by),
       updated_at = NOW()`,
    [
      tenantId,
      ticketId,
      resolution.resolution_summary,
      resolution.internal_steps,
      resolution.root_cause,
      resolution.fix_type,
      resolution.reference_data,
      attachment?.name || null,
      attachment?.path || null,
      attachment?.mime || null,
      actorId || null
    ]
  );
  return getTicketResolutionDetails(ticketId, tenantId);
};

const hasKnowledgeEntryForTicket = async ({ ticketId, tenantId, connection = null }) => {
  try {
    await ensureKnowledgeBaseSchema();
    const db = connection || pool;
    const [rows] = await db.execute(
      `SELECT id
       FROM knowledge_base
       WHERE tenant_id = ? AND source_ticket_id = ?
       LIMIT 1`,
      [tenantId, ticketId]
    );
    return rows.length > 0;
  } catch (error) {
    return false;
  }
};

const upsertKnowledgeEntryFromTicket = async ({ ticketId, tenantId, connection = null }) => {
  try {
    await ensureKnowledgeBaseSchema();
    await ensureTicketResolutionSchema();
    const db = connection || pool;
    const hasCategory = await ticketsHasColumn('category');
    const categorySel = hasCategory ? 't.category' : 'NULL AS category';
    const [rows] = await db.execute(
      `SELECT
         t.id AS ticket_id,
         t.issue_title,
         t.issue_type,
         ${categorySel},
         t.status,
         rd.resolution_summary,
         rd.internal_steps
       FROM tickets t
       INNER JOIN ticket_resolution_details rd
         ON rd.ticket_id = t.id AND rd.tenant_id = t.tenant_id
       WHERE t.id = ? AND t.tenant_id = ?
       LIMIT 1`,
      [ticketId, tenantId]
    );
    if (!rows.length) return false;
    const row = rows[0];
    const normalizedStatus = String(row.status || '').toLowerCase();
    if (normalizedStatus !== 'closed') return false;

    const fullResolution = String(row.internal_steps || row.resolution_summary || '').trim();
    if (!fullResolution) return false;

    const title = String(row.issue_title || '').trim() || `Ticket #${ticketId} resolution`;
    const issueType = String(row.issue_type || '').trim() || null;
    const category = String(row.category || '').trim() || null;
    const summarySeed = String(row.resolution_summary || fullResolution).trim();
    const resolutionSummary = summarySeed.slice(0, 200) || null;

    await db.execute(
      `INSERT INTO knowledge_base
        (tenant_id, source_ticket_id, title, issue_type, category, resolution, resolution_summary, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         issue_type = VALUES(issue_type),
         category = VALUES(category),
         resolution = VALUES(resolution),
         resolution_summary = VALUES(resolution_summary),
         updated_at = NOW()`,
      [
        tenantId,
        ticketId,
        title,
        issueType,
        category,
        fullResolution,
        resolutionSummary
      ]
    );
    return true;
  } catch (error) {
    console.warn('⚠️ Could not upsert knowledge entry from ticket:', error?.message || error);
    return false;
  }
};

let escalationWorkflowSchemaEnsured = false;
const SUPPORT_LEVELS = ['L1', 'L2', 'L3', 'MANAGER'];
const MANAGER_ROLES = ['support_manager', 'manager', 'ceo', 'admin'];

const normalizeSupportLevel = (value, fallback = 'L1') => {
  const upper = String(value || '').trim().toUpperCase();
  return SUPPORT_LEVELS.includes(upper) ? upper : fallback;
};

const inferLevelFromRole = (role) => {
  const lower = String(role || '').toLowerCase();
  if (['support_manager', 'manager', 'ceo', 'admin'].includes(lower)) return 'MANAGER';
  return 'L1';
};

const ensureEscalationWorkflowSchema = async () => {
  if (!escalationWorkflowSchemaEnsured) {
  try {
    await pool.execute(
      "ALTER TABLE agents ADD COLUMN level ENUM('L1','L2','L3') NULL DEFAULT NULL AFTER role"
    );
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn('⚠️ Could not ensure agents.level column:', e?.message || e);
    }
  }
  try {
    await pool.execute(
      "ALTER TABLE agents MODIFY COLUMN level ENUM('L1','L2','L3','MANAGER') NULL DEFAULT NULL"
    );
  } catch (e) {
    console.warn('⚠️ Could not widen agents.level for migration:', e?.message || e);
  }
  try {
    await pool.execute(`UPDATE agents SET level = 'L1' WHERE level = 'MANAGER'`);
  } catch (e) {
    console.warn('⚠️ Could not remap agents.level MANAGER:', e?.message || e);
  }
  try {
    await pool.execute(
      "ALTER TABLE agents MODIFY COLUMN level ENUM('L1','L2','L3') NULL DEFAULT NULL"
    );
  } catch (e) {
    console.warn('⚠️ Could not finalize agents.level enum:', e?.message || e);
  }
  try {
    await pool.execute(`
      UPDATE agents SET level = 'L1'
      WHERE level IS NULL
        AND LOWER(COALESCE(role, '')) NOT IN ('support_manager', 'manager', 'ceo', 'admin')
    `);
  } catch (e) {
    console.warn('⚠️ Could not default L1 for line agents:', e?.message || e);
  }
  try {
    await pool.execute(
      "ALTER TABLE tickets ADD COLUMN current_level ENUM('L1','L2','L3','MANAGER') NOT NULL DEFAULT 'L1' AFTER assigned_to"
    );
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn('⚠️ Could not ensure tickets.current_level column:', e?.message || e);
    }
  }
  try {
    await pool.execute('ALTER TABLE tickets ADD COLUMN current_owner_id INT NULL AFTER current_level');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn('⚠️ Could not ensure tickets.current_owner_id column:', e?.message || e);
    }
  }
  try {
    await pool.execute(
      `UPDATE tickets
       SET current_owner_id = COALESCE(current_owner_id, assigned_to),
           current_level = COALESCE(current_level, 'L1')
       WHERE current_owner_id IS NULL OR current_level IS NULL`
    );
  } catch (e) {
    console.warn('⚠️ Could not backfill tickets owner/level:', e?.message || e);
  }
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ticket_escalation_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        ticket_id INT NOT NULL,
        from_level ENUM('L1','L2','L3','MANAGER') NOT NULL,
        to_level ENUM('L1','L2','L3','MANAGER') NOT NULL,
        from_agent_id INT NULL,
        to_agent_id INT NULL,
        escalation_reason VARCHAR(500) NOT NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_teh_ticket_time (tenant_id, ticket_id, created_at),
        KEY idx_teh_to_agent (to_agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.warn('⚠️ Could not ensure ticket_escalation_history:', e?.message || e);
  }
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ticket_escalation_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        ticket_id INT NOT NULL,
        requested_by INT NOT NULL,
        current_level ENUM('L1','L2','L3','MANAGER') NOT NULL,
        requested_level ENUM('L1','L2','L3','MANAGER') NOT NULL,
        escalation_reason VARCHAR(500) NOT NULL,
        work_done TEXT NOT NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        manager_id INT NULL,
        manager_comment TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME NULL,
        KEY idx_ter_ticket (ticket_id),
        KEY idx_ter_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.warn('⚠️ Could not ensure ticket_escalation_requests:', e?.message || e);
  }
  escalationWorkflowSchemaEnsured = true;
  }
  await ensureTicketResolutionSchema();
  await syncExecutiveAgentLevelsToNull();
  await ensureRecommendationLinkingSchema();
};

const resolveTicketOwnerId = (ticket) =>
  Number(ticket?.current_owner_id || ticket?.assigned_to || 0) || null;

const formatResolutionForViewer = (resolution, { includeInternal }) => {
  if (!resolution) return null;
  const base = {
    id: Number(resolution.id),
    ticket_id: Number(resolution.ticket_id),
    resolution_summary: resolution.resolution_summary || '',
    created_by: resolution.created_by || null,
    created_at: resolution.created_at || null,
    updated_at: resolution.updated_at || null
  };
  if (includeInternal) {
    base.internal_steps = resolution.internal_steps || '';
    base.root_cause = resolution.root_cause || null;
    base.fix_type = resolution.fix_type || null;
    base.reference_data = resolution.reference_data || null;
    base.attachment_name = resolution.attachment_name || null;
    base.attachment_path = resolution.attachment_path || null;
    base.attachment_mime = resolution.attachment_mime || null;
  }
  return base;
};

const LEVEL_TRANSITIONS = {
  L1: ['L2', 'L3', 'MANAGER'],
  L2: ['L3', 'MANAGER'],
  L3: ['MANAGER'],
  MANAGER: []
};

let recommendationLinkingSchemaEnsured = false;
const ensureRecommendationLinkingSchema = async () => {
  if (recommendationLinkingSchemaEnsured) return;
  const linkColumns = [
    { name: 'parent_ticket_id', sql: 'ALTER TABLE tickets ADD COLUMN parent_ticket_id INT NULL AFTER id' },
    { name: 'linked_to_parent_at', sql: 'ALTER TABLE tickets ADD COLUMN linked_to_parent_at DATETIME NULL AFTER parent_ticket_id' },
    { name: 'linked_by', sql: 'ALTER TABLE tickets ADD COLUMN linked_by INT NULL AFTER linked_to_parent_at' },
    { name: 'linked_reason', sql: 'ALTER TABLE tickets ADD COLUMN linked_reason VARCHAR(500) NULL AFTER linked_by' }
  ];
  for (const col of linkColumns) {
    const hasCol = await ticketsHasColumn(col.name);
    if (hasCol) continue;
    try {
      await pool.execute(col.sql);
      ticketsColumnCache.set(col.name, true);
    } catch (e) {
      if (e?.code === 'ER_DUP_FIELDNAME') {
        ticketsColumnCache.set(col.name, true);
      } else {
        console.warn(`⚠️ Could not ensure tickets.${col.name}:`, e?.message || e);
      }
    }
  }
  try {
    await pool.execute('CREATE INDEX idx_tickets_parent_ticket_id ON tickets(parent_ticket_id)');
  } catch (e) {
    if (e?.code !== 'ER_DUP_KEYNAME') {
      console.warn('⚠️ Could not create idx_tickets_parent_ticket_id:', e?.message || e);
    }
  }
  try {
    const [fkRows] = await pool.execute(
      `SELECT CONSTRAINT_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tickets'
         AND COLUMN_NAME = 'parent_ticket_id'
         AND REFERENCED_TABLE_NAME = 'tickets'
       LIMIT 1`
    );
    if (!fkRows.length) {
      await pool.execute(
        'ALTER TABLE tickets ADD CONSTRAINT fk_tickets_parent_ticket FOREIGN KEY (parent_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL'
      );
    }
  } catch (e) {
    console.warn('⚠️ Could not ensure fk_tickets_parent_ticket:', e?.message || e);
  }
  recommendationLinkingSchemaEnsured = true;
};

let similarAiSuggestionsSchemaEnsured = false;
const ensureSimilarAiSuggestionsSchema = async () => {
  if (similarAiSuggestionsSchemaEnsured) return;
  await ensureRecommendationLinkingSchema();
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS similar_ticket_ai_suggestions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        ticket_id INT NOT NULL,
        suggested_ticket_id INT NOT NULL,
        score INT NOT NULL,
        reasons_json JSON NULL,
        dismissed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_similar_ticket_pair (tenant_id, ticket_id, suggested_ticket_id),
        KEY idx_similar_ticket_ticket (tenant_id, ticket_id, dismissed_at),
        KEY idx_similar_ticket_suggested (tenant_id, suggested_ticket_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    similarAiSuggestionsSchemaEnsured = true;
  } catch (e) {
    console.warn('⚠️ Could not ensure similar_ticket_ai_suggestions table:', e?.message || e);
    throw e;
  }
};

const SIMILARITY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'had', 'are', 'was', 'were',
  'your', 'you', 'not', 'can', 'cannot', 'into', 'onto', 'our', 'their', 'there', 'here', 'issue',
  'ticket', 'please', 'help', 'need', 'about', 'when', 'what', 'where', 'which', 'will', 'would',
  'could', 'should', 'just', 'been', 'being', 'than', 'then', 'also', 'very', 'much'
]);
const tokenizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((v) => v.trim())
    .filter((v) => v.length >= 3 && !SIMILARITY_STOPWORDS.has(v));

const computeKeywordOverlap = (a, b) => {
  const aSet = new Set(tokenizeText(a));
  const bSet = new Set(tokenizeText(b));
  let overlap = 0;
  for (const key of aSet) if (bSet.has(key)) overlap += 1;
  return overlap;
};

const clampInt = (v, min, max) => Math.max(min, Math.min(max, Math.trunc(Number(v))));

const SUPPORT_STAFF_ROLES = ['support_agent', 'agent', 'support_manager', 'manager', 'ceo', 'admin'];

const aiSimilarityScore = async ({ base, candidate }) => {
  const client = getNvidiaClient();
  const payload = {
    base: {
      issue_title: base.issue_title || '',
      description: base.description || '',
      product: base.product || '',
      module: base.module || '',
      issue_type: base.issue_type || ''
    },
    candidate: {
      id: Number(candidate.id),
      issue_title: candidate.issue_title || '',
      description: candidate.description || '',
      product: candidate.product || '',
      module: candidate.module || '',
      issue_type: candidate.issue_type || ''
    }
  };

  const result = await withTimeout(
    client.jsonResponse(
    `Evaluate whether the candidate ticket is a same-day duplicate or very similar to the base ticket.\nReturn JSON ONLY in this exact shape:\n{"score":0-100,"reasons":["short reason", "..."]}\n\nInput:\n${JSON.stringify(payload)}`,
    `You are an ITSM similarity evaluator.
- Score meaning: 0 = unrelated, 100 = same issue/duplicate.
- Prefer conservative scores when unsure.
- Reasons: 1-4 short, concrete bullets.
- Return ONLY valid JSON with keys score (number) and reasons (array of strings).`,
    0.1,
    260
    ),
    6500
  );

  const score = clampInt(result?.score, 0, 100);
  const reasons = Array.isArray(result?.reasons)
    ? result.reasons.map((r) => String(r || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  return { score, reasons };
};

const computeHeuristicSimilarityScore = ({ base, candidate, overlapBaseText = '' }) => {
  let score = 0;
  if (base?.category && candidate?.category && String(base.category).toLowerCase() === String(candidate.category).toLowerCase()) {
    score += 3;
  }
  if (base?.issue_type && candidate?.issue_type && String(base.issue_type).toLowerCase() === String(candidate.issue_type).toLowerCase()) {
    score += 3;
  }
  if (base?.module && candidate?.module && String(base.module).toLowerCase() === String(candidate.module).toLowerCase()) {
    score += 2;
  }
  const candText = `${String(candidate?.issue_title || '')} ${String(candidate?.description || '')}`.trim();
  const overlap = computeKeywordOverlap(overlapBaseText, candText);
  if (overlap > 0) score += Math.min(4, overlap);
  return clampInt(score * 12, 0, 100);
};

const getReferenceResolutionRecommendations = async ({ tenantId, ticketId, maxItems = 5 }) => {
  const MAX_ITEMS = Math.max(1, Math.min(Number(maxItems || 5), 20));
  const CANDIDATE_LIMIT = 50; // performance guard: score only a bounded pool
  const MONTH_WINDOW = 6; // performance guard: last 6 months only

  const hasCategory = await ticketsHasColumn('category');
  const categorySel = hasCategory ? 't.category' : 'NULL AS category';

  const [bases] = await pool.execute(
    `SELECT t.id, t.issue_title, t.description, t.product, t.module, t.issue_type, ${categorySel}
     FROM tickets t
     WHERE t.id = ? AND t.tenant_id = ?
     LIMIT 1`,
    [ticketId, tenantId]
  );
  if (!bases.length) return [];
  const base = bases[0];
  const baseText = `${String(base.issue_title || '')} ${String(base.description || '')}`.trim();

  // Older resolved/closed tickets with structured resolution summary.
  const [rows] = await pool.execute(
    `SELECT
       t.id,
       t.issue_title,
       t.description,
       t.status,
       t.created_at,
       ${categorySel},
       t.module,
       t.issue_type,
       rd.resolution_summary
     FROM tickets t
     INNER JOIN ticket_resolution_details rd
       ON rd.ticket_id = t.id AND rd.tenant_id = t.tenant_id
     WHERE t.tenant_id = ?
       AND t.id <> ?
       AND LOWER(COALESCE(t.status, '')) IN ('resolved', 'closed')
       AND t.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       AND t.created_at >= DATE_SUB(NOW(), INTERVAL ${MONTH_WINDOW} MONTH)
       AND NULLIF(TRIM(COALESCE(rd.resolution_summary, '')), '') IS NOT NULL
     ORDER BY t.created_at DESC
     LIMIT ${CANDIDATE_LIMIT}`,
    [tenantId, ticketId]
  );

  const scoredFromTickets = (rows || [])
    .map((row) => {
      const similarity = computeHeuristicSimilarityScore({ base, candidate: row, overlapBaseText: baseText });
      const preview = String(row.resolution_summary || '').trim().slice(0, 150);
      return {
        ticket_id: Number(row.id),
        title: row.issue_title || null,
        resolution_preview: preview,
        status: row.status || 'resolved',
        similarity_score: clampInt(similarity, 0, 100)
      };
    })
    .filter((r) => r.ticket_id && r.similarity_score >= 50 && String(r.resolution_preview || '').trim())
    .sort((a, b) => b.similarity_score - a.similarity_score || a.ticket_id - b.ticket_id);

  let scoredFromKnowledge = [];
  try {
    await ensureKnowledgeBaseSchema();
    const [kbRows] = await pool.execute(
      `SELECT id, source_ticket_id, title, issue_type, category, resolution, resolution_summary, updated_at
       FROM knowledge_base
       WHERE tenant_id = ?
       ORDER BY updated_at DESC
       LIMIT ${CANDIDATE_LIMIT}`,
      [tenantId]
    );
    scoredFromKnowledge = (kbRows || [])
      .map((row) => {
        const similarity = computeHeuristicSimilarityScore({
          base,
          candidate: {
            issue_title: row.title || '',
            description: row.resolution || row.resolution_summary || '',
            issue_type: row.issue_type || '',
            category: row.category || '',
            module: ''
          },
          overlapBaseText: baseText
        });
        const previewSeed = String(row.resolution_summary || row.resolution || '').trim();
        return {
          ticket_id: Number(row.source_ticket_id || 0),
          title: row.title || `Ticket #${row.source_ticket_id || row.id} resolution`,
          resolution_preview: previewSeed.slice(0, 150),
          status: 'closed',
          similarity_score: clampInt(similarity, 0, 100),
          source: 'knowledge_base',
          knowledge_id: Number(row.id)
        };
      })
      .filter((r) => r.ticket_id && r.ticket_id !== Number(ticketId) && r.similarity_score >= 50 && String(r.resolution_preview || '').trim());
  } catch (error) {
    scoredFromKnowledge = [];
  }

  const merged = [...scoredFromKnowledge, ...scoredFromTickets];
  const deduped = [];
  const seenTicketIds = new Set();
  for (const item of merged.sort((a, b) => b.similarity_score - a.similarity_score || a.ticket_id - b.ticket_id)) {
    if (seenTicketIds.has(item.ticket_id)) continue;
    seenTicketIds.add(item.ticket_id);
    deduped.push(item);
    if (deduped.length >= MAX_ITEMS) break;
  }

  return deduped;
};

const getSimilarTicketRecommendations = async ({ tenantId, ticketId, limit = 8, refresh = false }) => {
  await ensureRecommendationLinkingSchema();
  await ensureSimilarAiSuggestionsSchema();
  const hasCategory = await ticketsHasColumn('category');
  const hasParentTicketId = await ticketsHasColumn('parent_ticket_id');
  const hasLinkItems = await hasTicketLinkItemsTable();
  const categorySel = hasCategory ? 't.category' : 'NULL AS category';
  const parentSel = hasParentTicketId ? 't.parent_ticket_id' : 'NULL AS parent_ticket_id';
  const parentFilter = hasParentTicketId ? 'AND t.parent_ticket_id IS NULL' : '';
  let linkedTicketIds = [];
  if (hasLinkItems) {
    try {
      const [g] = await pool.execute(
        `SELECT group_id
         FROM ticket_link_group_items
         WHERE tenant_id = ? AND ticket_id = ?
         LIMIT 1`,
        [tenantId, ticketId]
      );
      const groupId = Number(g?.[0]?.group_id || 0);
      if (groupId) {
        const [items] = await pool.execute(
          `SELECT ticket_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND group_id = ?`,
          [tenantId, groupId]
        );
        linkedTicketIds = (items || []).map((r) => Number(r.ticket_id)).filter((v) => Number.isFinite(v) && v > 0);
      }
    } catch (_) {
      linkedTicketIds = [];
    }
  }
  const linkedIdSet = new Set(linkedTicketIds);
  linkedIdSet.add(Number(ticketId));
  const [bases] = await pool.execute(
    `SELECT t.id, t.issue_title, t.created_at, t.status, t.product, t.module, t.issue_type, t.description, ${categorySel}
     FROM tickets t
     WHERE t.id = ? AND t.tenant_id = ?
     LIMIT 1`,
    [ticketId, tenantId]
  );
  if (!bases.length) return [];
  const base = bases[0];

  if (!refresh) {
    // Prefer cached AI suggestions (not dismissed) for fast ticket view.
    try {
      const [cached] = await pool.execute(
        `SELECT suggested_ticket_id AS id, score, reasons_json, updated_at
         FROM similar_ticket_ai_suggestions
         WHERE tenant_id = ? AND ticket_id = ? AND dismissed_at IS NULL
         ORDER BY score DESC, updated_at DESC
         LIMIT ?`,
        [tenantId, ticketId, Math.max(1, Math.min(Number(limit || 8), 200))]
      );
      if (cached?.length) {
        const ids = cached
          .map((c) => Number(c.id))
          .filter((v) => Number.isFinite(v) && v > 0 && !linkedIdSet.has(v));
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const [details] = await pool.execute(
            `SELECT id, issue_title, status, created_at
             FROM tickets
             WHERE tenant_id = ? AND id IN (${placeholders})
             ${hasLinkItems ? "AND NOT EXISTS (SELECT 1 FROM ticket_link_group_items li WHERE li.tenant_id = tenant_id AND li.ticket_id = id)" : ""}`,
            [tenantId, ...ids]
          );
          const detailMap = new Map((details || []).map((d) => [Number(d.id), d]));
          const out = [];
          for (const c of cached) {
            const d = detailMap.get(Number(c.id));
            if (!d) continue;
            const cachedScore = clampInt(c.score, 0, 100);
            if (cachedScore < 50) continue;
            let reasons = [];
            try { reasons = JSON.parse(c.reasons_json || '[]'); } catch {}
            out.push({
              id: Number(c.id),
              issue_title: d.issue_title || null,
              status: d.status || 'new',
              created_at: d.created_at,
              score: cachedScore,
              reasons: Array.isArray(reasons) ? reasons : []
            });
          }
          if (out.length) return out.slice(0, limit);
        }
      }
    } catch (_) {
      // ignore cache failures
    }
  }
  const [rows] = await pool.execute(
    `SELECT
       t.id, t.issue_title, t.description, t.status, t.created_at,
       t.product, t.module, t.issue_type, ${categorySel},
       ${parentSel}
     FROM tickets t
     WHERE t.tenant_id = ?
       AND t.id <> ?
       AND t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ${parentFilter}
      ${hasLinkItems ? "AND NOT EXISTS (SELECT 1 FROM ticket_link_group_items li WHERE li.tenant_id = t.tenant_id AND li.ticket_id = t.id)" : ""}
       ${linkedTicketIds.length ? `AND t.id NOT IN (${linkedTicketIds.map(() => '?').join(',')})` : ""}
       AND t.status <> 'closed'
     ORDER BY t.created_at DESC
     LIMIT 200`,
    linkedTicketIds.length ? [tenantId, ticketId, ...linkedTicketIds] : [tenantId, ticketId]
  );

  const scored = [];
  let aiFailed = false;

  // Rank candidates so we don't miss older-but-relevant matches within the time window.
  // This keeps runtime bounded while improving recall vs "newest N" slicing.
  const baseText = `${String(base.issue_title || '')} ${String(base.description || '')}`.trim();
  const ranked = rows
    .map((row) => {
      const candText = `${String(row.issue_title || '')} ${String(row.description || '')}`.trim();
      const overlap = computeKeywordOverlap(baseText, candText);
      return { row, overlap };
    })
    .sort((a, b) => (b.overlap - a.overlap) || (new Date(b.row.created_at || 0).getTime() - new Date(a.row.created_at || 0).getTime()))
    .map((x) => x.row);
  const candidates = ranked.slice(0, 60);
  const CONCURRENCY = 5;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((row) => aiSimilarityScore({ base, candidate: row }))
    );
    for (let j = 0; j < results.length; j += 1) {
      const row = batch[j];
      const r = results[j];
      if (r.status !== 'fulfilled') {
        aiFailed = true;
        break;
      }
      const { score, reasons } = r.value;
      if (score < 50) continue;
      scored.push({
        id: Number(row.id),
        issue_title: row.issue_title || null,
        status: row.status || 'new',
        created_at: row.created_at,
        score,
        reasons
      });
      try {
        await pool.execute(
          `INSERT INTO similar_ticket_ai_suggestions (tenant_id, ticket_id, suggested_ticket_id, score, reasons_json, dismissed_at)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE
             score = VALUES(score),
             reasons_json = VALUES(reasons_json),
             dismissed_at = IF(dismissed_at IS NULL, NULL, dismissed_at),
             updated_at = NOW()`,
          [tenantId, ticketId, Number(row.id), clampInt(score, 0, 100), JSON.stringify(reasons || [])]
        );
      } catch (_) {}
    }
    if (aiFailed) break;
    // Do not early-stop based on result count; caller may request full list.
  }

  if (aiFailed) {
    const fallback = [];
    for (const row of rows) {
      let score = 0;
      const reasons = [];
      if (base.category && row.category && String(base.category).toLowerCase() === String(row.category).toLowerCase()) {
        score += 3;
        reasons.push('same category');
      }
      if (base.issue_type && row.issue_type && String(base.issue_type).toLowerCase() === String(row.issue_type).toLowerCase()) {
        score += 3;
        reasons.push('same issue type');
      }
      if (base.module && row.module && String(base.module).toLowerCase() === String(row.module).toLowerCase()) {
        score += 2;
        reasons.push('same module');
      }
      const overlap = computeKeywordOverlap(base.description, row.description);
      if (overlap > 0) {
        score += Math.min(4, overlap);
        reasons.push(`keyword overlap (${overlap})`);
      }
      const finalScore = clampInt(score * 12, 0, 100);
      if (finalScore >= 50) {
        fallback.push({
          id: Number(row.id),
          issue_title: row.issue_title || null,
          status: row.status || 'new',
          created_at: row.created_at,
          score: finalScore,
          reasons
        });
      }
    }
    return fallback.sort((a, b) => b.score - a.score || new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  }

  // If AI succeeded, still include all candidates within window (even low similarity).
  // For candidates not AI-scored, attach a lightweight heuristic score/reasons.
  const seen = new Set(scored.map((s) => Number(s.id)));
  const baseTextForHeuristic = `${String(base.issue_title || '')} ${String(base.description || '')}`.trim();
  for (const row of rows) {
    const id = Number(row.id);
    if (!id || seen.has(id)) continue;
    let score = 0;
    const reasons = [];
    if (base.category && row.category && String(base.category).toLowerCase() === String(row.category).toLowerCase()) {
      score += 3;
      reasons.push('same category');
    }
    if (base.issue_type && row.issue_type && String(base.issue_type).toLowerCase() === String(row.issue_type).toLowerCase()) {
      score += 3;
      reasons.push('same issue type');
    }
    if (base.module && row.module && String(base.module).toLowerCase() === String(row.module).toLowerCase()) {
      score += 2;
      reasons.push('same module');
    }
    const candText = `${String(row.issue_title || '')} ${String(row.description || '')}`.trim();
    const overlap = computeKeywordOverlap(baseTextForHeuristic, candText);
    if (overlap > 0) {
      score += Math.min(4, overlap);
      reasons.push(`keyword overlap (${overlap})`);
    }
    const finalScore = clampInt(score * 12, 0, 100);
    if (finalScore < 50) continue;
    scored.push({
      id,
      issue_title: row.issue_title || null,
      status: row.status || 'new',
      created_at: row.created_at,
      score: finalScore,
      reasons
    });
  }
  return scored.sort((a, b) => b.score - a.score || new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
};

const syncLinkedChildrenFromParent = async ({
  parentTicket,
  tenantId,
  actorId = null,
  actorName = null,
  syncStatus = false,
  syncEta = false
}) => {
  await ensureRecommendationLinkingSchema();
  if (!parentTicket?.id) return { updatedChildren: 0 };
  const [children] = await pool.execute(
    `SELECT id, status, name, email, mobile, user_id, issue_title, description, eta_due_at, eta_reason
     FROM tickets
     WHERE tenant_id = ? AND parent_ticket_id = ?`,
    [tenantId, parentTicket.id]
  );
  if (!children.length) return { updatedChildren: 0 };
  const hasResolvedAt = await ticketsHasColumn('resolved_at');
  let updatedChildren = 0;
  const parentEmail = String(parentTicket.email || '').trim().toLowerCase();
  for (const child of children) {
    const sets = [];
    const params = [];
    let nextStatus = String(child.status || '').toLowerCase();
    if (syncStatus) {
      nextStatus = String(parentTicket.status || '').toLowerCase() || 'new';
      sets.push('status = ?');
      params.push(nextStatus);
      sets.push('current_level = ?');
      params.push(normalizeSupportLevel(parentTicket.current_level, 'L1'));
      sets.push('current_owner_id = ?');
      params.push(parentTicket.current_owner_id || null);
      sets.push('assigned_to = ?');
      params.push(parentTicket.assigned_to || null);
      if (hasResolvedAt && nextStatus === 'resolved') {
        sets.push('resolved_at = COALESCE(resolved_at, NOW())');
      }
    }
    if (syncEta) {
      sets.push('eta_due_at = ?');
      params.push(parentTicket.eta_due_at || null);
      sets.push('eta_reason = ?');
      params.push(parentTicket.eta_reason || null);
      sets.push('eta_updated_by = ?');
      params.push(actorId || null);
      sets.push('eta_updated_at = NOW()');
    }
    if (!sets.length) continue;
    sets.push('updated_at = NOW()');
    const updateSql = `UPDATE tickets SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`;
    params.push(child.id, tenantId);
    const [res] = await pool.execute(updateSql, params);
    if (!res?.affectedRows) continue;
    updatedChildren += 1;

    const childEmail = String(child.email || '').trim().toLowerCase();
    if (syncStatus && child.status !== nextStatus) {
      if (!parentEmail || !childEmail || childEmail !== parentEmail) {
        try {
          await ticketEventNotificationService.notifyStatusChanged({
            ticket: { ...child, status: nextStatus, tenant_id: tenantId },
            tenantId,
            previousStatus: child.status,
            newStatus: nextStatus,
            actorId,
            actorName
          });
        } catch (e) {
          console.warn(`⚠️ Linked-child status notify failed for ticket ${child.id}:`, e?.message || e);
        }
      }
    }
    if (syncEta) {
      const oldEta = child.eta_due_at || null;
      const newEta = parentTicket.eta_due_at || null;
      const changed = String(oldEta || '') !== String(newEta || '') || String(parentTicket.eta_reason || '') !== String(child.eta_reason || '');
      if (changed && (!parentEmail || !childEmail || childEmail !== parentEmail)) {
        try {
          await ticketEventNotificationService.notifyEtaUpdated({
            ticket: {
              ...child,
              id: Number(child.id),
              tenant_id: tenantId,
              eta_due_at: parentTicket.eta_due_at || null,
              eta_reason: parentTicket.eta_reason || null
            },
            tenantId,
            previousEta: oldEta,
            newEta: parentTicket.eta_due_at || null,
            reason: parentTicket.eta_reason || null,
            actorId,
            actorName
          });
        } catch (e) {
          console.warn(`⚠️ Linked-child ETA notify failed for ticket ${child.id}:`, e?.message || e);
        }
      }
    }
  }
  return { updatedChildren };
};

let attachmentTypeColumnEnsured = false;
const ensureAttachmentTypeColumnCapacity = async () => {
  if (attachmentTypeColumnEnsured) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS max_len
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tickets'
         AND COLUMN_NAME = 'attachment_type'
       LIMIT 1`
    );
    if (!rows.length) return false;

    const currentLength = Number(rows[0]?.max_len || 0);
    if (currentLength >= 120) {
      attachmentTypeColumnEnsured = true;
      return true;
    }

    await pool.execute('ALTER TABLE tickets MODIFY COLUMN attachment_type VARCHAR(191) NULL');
    attachmentTypeColumnEnsured = true;
    return true;
  } catch (error) {
    console.warn('⚠️ Could not ensure tickets.attachment_type capacity:', error?.message || error);
    return false;
  }
};

let attachmentAnalysisTableEnsured = false;
const ensureAttachmentAnalysisTable = async () => {
  if (attachmentAnalysisTableEnsured) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ticket_attachment_analyses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        ticket_id INT NOT NULL,
        attachment_signature VARCHAR(128) NOT NULL,
        attachment_name VARCHAR(255) NULL,
        attachment_type VARCHAR(100) NULL,
        summary TEXT NOT NULL,
        key_points_json LONGTEXT NULL,
        document_type VARCHAR(120) NULL,
        recommended_focus TEXT NULL,
        analysis_status ENUM('completed','failed') NOT NULL DEFAULT 'completed',
        analysis_error VARCHAR(255) NULL,
        analyzed_by INT NULL,
        analyzed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ticket_attachment_signature (ticket_id, attachment_signature),
        KEY idx_taa_tenant_ticket (tenant_id, ticket_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    attachmentAnalysisTableEnsured = true;
  } catch (error) {
    console.warn('⚠️ Could not ensure ticket_attachment_analyses table:', error?.message || error);
    throw error;
  }
};

let ticketAttachmentsTableEnsured = false;
const ensureTicketAttachmentsTable = async () => {
  if (ticketAttachmentsTableEnsured) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        ticket_id INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(191) NULL,
        file_size INT NULL,
        attachment LONGBLOB NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ticket_attachments_ticket (ticket_id),
        INDEX idx_ticket_attachments_tenant (tenant_id),
        CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ticketAttachmentsTableEnsured = true;
  } catch (e) {
    console.warn('⚠️ Could not ensure ticket_attachments table:', e?.message || e);
    ticketAttachmentsTableEnsured = false;
  }
};

const getAttachmentSignature = ({ attachmentName, attachmentType, attachmentBuffer }) => {
  const hash = crypto.createHash('sha256');
  hash.update(String(attachmentName || ''));
  hash.update('|');
  hash.update(String(attachmentType || ''));
  hash.update('|');
  if (Buffer.isBuffer(attachmentBuffer)) {
    hash.update(attachmentBuffer);
  }
  return hash.digest('hex');
};

const isInternalRole = (role) => {
  const r = String(role || '').toLowerCase();
  return ['support_agent', 'agent', 'support_manager', 'manager', 'ceo', 'admin'].includes(r);
};

async function predictTicketPriorityWithAi(input) {
  const fallback = { priority: 'medium', reason: 'AI fallback applied.', confidence: 'low' };
  try {
    const client = getNvidiaClient();
    const payload = {
      issueTitle: input.issueTitle || '',
      description: input.description || '',
      product: input.product || null,
      module: input.module || null,
      issueType: input.issueType || null
    };
    const result = await client.jsonResponse(
      `Classify ticket priority from this JSON:\n${JSON.stringify(payload)}\nReturn only JSON with keys: priority, reason, confidence.`,
      `You are an ITSM triage assistant.
Pick exactly one priority from: low, medium, high, urgent.
Confidence must be one of: low, medium, high.
Prefer medium when uncertain.
Return only JSON.`,
      0.0,
      260
    );
    const priority = String(result?.priority || '').toLowerCase();
    const confidence = String(result?.confidence || '').toLowerCase();
    const reason = typeof result?.reason === 'string' ? result.reason.trim() : '';
    if (!AI_PRIORITY_VALUES.includes(priority)) return fallback;
    return {
      priority,
      reason: reason || 'Priority inferred from ticket details.',
      confidence: AI_CONFIDENCE_VALUES.includes(confidence) ? confidence : 'medium'
    };
  } catch (error) {
    console.warn('⚠️ AI priority prediction failed, using medium fallback:', error?.message || error);
    return fallback;
  }
}

const withTimeout = (promise, timeoutMs) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

let ticketTasksTableExistsCache = null;
const hasTicketTasksTable = async () => {
  if (ticketTasksTableExistsCache !== null) return ticketTasksTableExistsCache;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'ticket_tasks'
       LIMIT 1`
    );
    ticketTasksTableExistsCache = rows.length > 0;
    return ticketTasksTableExistsCache;
  } catch (error) {
    console.warn('⚠️ Could not verify ticket_tasks table:', error.message);
    ticketTasksTableExistsCache = false;
    return false;
  }
};

let ticketLinkItemsTableExistsCache = null;
const hasTicketLinkItemsTable = async () => {
  if (ticketLinkItemsTableExistsCache !== null) return ticketLinkItemsTableExistsCache;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'ticket_link_group_items'
       LIMIT 1`
    );
    ticketLinkItemsTableExistsCache = rows.length > 0;
    return ticketLinkItemsTableExistsCache;
  } catch (error) {
    console.warn('⚠️ Could not verify ticket_link_group_items table:', error.message);
    ticketLinkItemsTableExistsCache = false;
    return false;
  }
};

let ticketFeedbackTableExistsCache = null;
const hasTicketFeedbackTable = async () => {
  if (ticketFeedbackTableExistsCache !== null) return ticketFeedbackTableExistsCache;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'ticket_feedback'
       LIMIT 1`
    );
    ticketFeedbackTableExistsCache = rows.length > 0;
    return ticketFeedbackTableExistsCache;
  } catch (error) {
    console.warn('⚠️ Could not verify ticket_feedback table:', error.message);
    ticketFeedbackTableExistsCache = false;
    return false;
  }
};

async function getTicketFeedback({ ticketId, tenantId }) {
  try {
    // Prefer the dedicated ticket_feedback table (email-link flow).
    if (await hasTicketFeedbackTable()) {
      const [rows] = await pool.execute(
        `SELECT rating, feedback_text, submitted_at
         FROM ticket_feedback
         WHERE tenant_id = ? AND ticket_id = ?
         LIMIT 1`,
        [tenantId, ticketId]
      );
      if (rows.length) {
        return {
          rating: Number(rows[0].rating || 0) || null,
          feedback_text: rows[0].feedback_text || '',
          submitted_at: rows[0].submitted_at || null,
          source: 'ticket_feedback'
        };
      }
    }

    // Back-compat: old feedback stored directly on tickets.
    const [legacy] = await pool.execute(
      `SELECT satisfaction_rating, satisfaction_comment, closed_at, updated_at
       FROM tickets
       WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
       LIMIT 1`,
      [ticketId, tenantId]
    );
    if (!legacy.length) return null;
    const rating = legacy[0].satisfaction_rating;
    const text = legacy[0].satisfaction_comment;
    if (rating == null && !text) return null;
    return {
      rating: rating != null ? Number(rating) : null,
      feedback_text: text || '',
      submitted_at: legacy[0].closed_at || legacy[0].updated_at || null,
      source: 'tickets_legacy'
    };
  } catch (e) {
    return null;
  }
}

let ticketTasksAssignmentStatusEnsured = false;
const ensureTicketTasksAssignmentStatusColumn = async () => {
  if (ticketTasksAssignmentStatusEnsured) return;
  const exists = await hasTicketTasksTable();
  if (!exists) return;
  try {
    await pool.execute(`
      ALTER TABLE ticket_tasks
      ADD COLUMN assignment_status ENUM('new','in_progress','escalated') NOT NULL DEFAULT 'new'
    `);
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn('ticket_tasks.assignment_status:', e.message);
    }
  }
  ticketTasksAssignmentStatusEnsured = true;
};

/** Grouped ticket_tasks: reopen = fresh work per agent (pending / assignment new).
 *  Removed (soft-deleted) agent slots stay removed across reopens. */
async function resetTicketTasksForReopen(ticketId, tenantId) {
  try {
    if (!(await hasTicketTasksTable())) return;
    await ensureTicketTasksAssignmentStatusColumn();
    const [tenantScoped] = await pool.execute(
      `UPDATE ticket_tasks
       SET status = 'pending', completed_at = NULL, assignment_status = 'new', updated_at = NOW()
       WHERE ticket_id = ? AND tenant_id = ? AND COALESCE(is_removed, 0) = 0`,
      [ticketId, tenantId]
    );
    if (Number(tenantScoped?.affectedRows || 0) > 0) return;

    // Fallback for legacy rows where tenant_id is missing/mismatched.
    const [ticketScoped] = await pool.execute(
      `UPDATE ticket_tasks
       SET status = 'pending', completed_at = NULL, assignment_status = 'new', updated_at = NOW()
       WHERE ticket_id = ? AND COALESCE(is_removed, 0) = 0`,
      [ticketId]
    );
    if (Number(ticketScoped?.affectedRows || 0) > 0) {
      console.warn(`resetTicketTasksForReopen: fallback used for ticket ${ticketId}`);
    }
  } catch (e) {
    console.warn('resetTicketTasksForReopen:', e.message);
  }
}

async function detachLinkedWorkflowForReopen(ticketId, tenantId) {
  // Detach BOTH linkage systems so reopened tickets start fresh.
  // 1) parent_ticket_id linking (classic parent/child)
  // 2) ticket_link_groups (internal linked-ticket groups)
  try {
    if (await ticketsHasColumn('parent_ticket_id')) {
      // If this ticket is a child -> detach itself.
      await pool.execute(
        `UPDATE tickets
         SET parent_ticket_id = NULL,
             linked_to_parent_at = NULL,
             linked_by = NULL,
             linked_reason = NULL,
             updated_at = NOW()
         WHERE tenant_id = ? AND id = ?`,
        [tenantId, ticketId]
      );
      // Fallback for legacy rows where tenant_id is missing/mismatched.
      await pool.execute(
        `UPDATE tickets
         SET parent_ticket_id = NULL,
             linked_to_parent_at = NULL,
             linked_by = NULL,
             linked_reason = NULL,
             updated_at = NOW()
         WHERE id = ?`,
        [ticketId]
      );
      // If this ticket is a parent -> detach all children.
      await pool.execute(
        `UPDATE tickets
         SET parent_ticket_id = NULL,
             linked_to_parent_at = NULL,
             linked_by = NULL,
             linked_reason = NULL,
             updated_at = NOW()
         WHERE tenant_id = ? AND parent_ticket_id = ?`,
        [tenantId, ticketId]
      );
      // Fallback for legacy rows where tenant_id is missing/mismatched.
      await pool.execute(
        `UPDATE tickets
         SET parent_ticket_id = NULL,
             linked_to_parent_at = NULL,
             linked_by = NULL,
             linked_reason = NULL,
             updated_at = NOW()
         WHERE parent_ticket_id = ?`,
        [ticketId]
      );
    }
  } catch (e) {
    console.warn('detachLinkedWorkflowForReopen parent/child:', e?.message || e);
  }

  try {
    const hasLinkItems = await hasTicketLinkItemsTable();
    if (!hasLinkItems) return;
    let groupId = 0;
    {
      const [g] = await pool.execute(
        `SELECT group_id
         FROM ticket_link_group_items
         WHERE tenant_id = ? AND ticket_id = ?
         LIMIT 1`,
        [tenantId, ticketId]
      );
      groupId = Number(g?.[0]?.group_id || 0);
    }
    if (!groupId) {
      const [g2] = await pool.execute(
        `SELECT group_id
         FROM ticket_link_group_items
         WHERE ticket_id = ?
         LIMIT 1`,
        [ticketId]
      );
      groupId = Number(g2?.[0]?.group_id || 0);
    }
    if (!groupId) return;
    let primaryId = 0;
    {
      const [gr] = await pool.execute(
        `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, groupId]
      );
      primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
    }
    if (!primaryId) {
      const [gr2] = await pool.execute(
        `SELECT primary_ticket_id FROM ticket_link_groups WHERE id = ? LIMIT 1`,
        [groupId]
      );
      primaryId = Number(gr2?.[0]?.primary_ticket_id || 0);
    }

    if (primaryId && primaryId === ticketId) {
      // Reopening the primary should detach ONLY this ticket.
      // Keep the remaining closed tickets linked together by promoting a new primary.
      await pool.execute(
        `DELETE FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ? AND ticket_id = ?`,
        [tenantId, groupId, ticketId]
      );
      await pool.execute(
        `DELETE FROM ticket_link_group_items WHERE group_id = ? AND ticket_id = ?`,
        [groupId, ticketId]
      );

      const [remainingRowsTenant] = await pool.execute(
        `SELECT ticket_id
         FROM ticket_link_group_items
         WHERE tenant_id = ? AND group_id = ?
         ORDER BY ticket_id ASC`,
        [tenantId, groupId]
      );
      let remainingIds = (remainingRowsTenant || []).map((r) => Number(r.ticket_id)).filter(Boolean);
      if (!remainingIds.length) {
        const [remainingRows] = await pool.execute(
          `SELECT ticket_id
           FROM ticket_link_group_items
           WHERE group_id = ?
           ORDER BY ticket_id ASC`,
          [groupId]
        );
        remainingIds = (remainingRows || []).map((r) => Number(r.ticket_id)).filter(Boolean);
      }

      if (remainingIds.length < 2) {
        // No longer a meaningful group.
        await pool.execute(`DELETE FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ?`, [tenantId, groupId]);
        await pool.execute(`DELETE FROM ticket_link_group_items WHERE group_id = ?`, [groupId]);
        await pool.execute(`DELETE FROM ticket_link_groups WHERE tenant_id = ? AND id = ?`, [tenantId, groupId]);
        await pool.execute(`DELETE FROM ticket_link_groups WHERE id = ?`, [groupId]);
        return;
      }

      const newPrimaryId = remainingIds[0];
      await pool.execute(
        `UPDATE ticket_link_groups
         SET primary_ticket_id = ?
         WHERE tenant_id = ? AND id = ?`,
        [newPrimaryId, tenantId, groupId]
      );
      // Fallback for legacy/mismatched tenant rows
      await pool.execute(
        `UPDATE ticket_link_groups
         SET primary_ticket_id = ?
         WHERE id = ?`,
        [newPrimaryId, groupId]
      );
      return;
    }

    // Otherwise detach only this ticket from the group.
    await pool.execute(
      `DELETE FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ? AND ticket_id = ?`,
      [tenantId, groupId, ticketId]
    );
    await pool.execute(
      `DELETE FROM ticket_link_group_items WHERE group_id = ? AND ticket_id = ?`,
      [groupId, ticketId]
    );
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ?`,
      [tenantId, groupId]
    );
    let remaining = Number(countRows?.[0]?.c || 0);
    if (!remaining) {
      const [countRows2] = await pool.execute(
        `SELECT COUNT(*) AS c FROM ticket_link_group_items WHERE group_id = ?`,
        [groupId]
      );
      remaining = Number(countRows2?.[0]?.c || 0);
    }
    if (remaining < 2) {
      // If the group no longer makes sense, remove it completely.
      await pool.execute(
        `DELETE FROM ticket_link_group_items WHERE tenant_id = ? AND group_id = ?`,
        [tenantId, groupId]
      );
      await pool.execute(
        `DELETE FROM ticket_link_group_items WHERE group_id = ?`,
        [groupId]
      );
      await pool.execute(
        `DELETE FROM ticket_link_groups WHERE tenant_id = ? AND id = ?`,
        [tenantId, groupId]
      );
      await pool.execute(
        `DELETE FROM ticket_link_groups WHERE id = ?`,
        [groupId]
      );
    }
  } catch (e) {
    console.warn('detachLinkedWorkflowForReopen linked-group:', e?.message || e);
  }
}

// POST /api/tickets/auto-login-context - Store auto-login context for form pre-filling
router.post('/auto-login-context', async (req, res) => {
  try {
    const { email, product, phone, timestamp, source } = req.body;
    
    console.log('🔗 Storing auto-login context:', { email, product, phone, source });
    
    // Store auto-login context in a temporary table or session storage
    // For now, we'll store it in the tickets table with a special flag
    // In production, you might want a separate table for this
    
    // Check if user exists
    const [users] = await pool.execute(
      'SELECT id FROM agents WHERE email = ?',
      [email]
    );
    
    let userId = null;
    if (users.length > 0) {
      userId = users[0].id;
    }
    
    // Store context in a temporary way (you can modify this based on your needs)
    const autoLoginContext = {
      email,
      product,
      phone,
      timestamp,
      source,
      userId
    };
    
    // For now, we'll just log it and return success
    // In a real implementation, you might store this in Redis, a database table, or session storage
    console.log('✅ Auto-login context stored:', autoLoginContext);
    
    res.json({
      success: true,
      message: 'Auto-login context stored successfully',
      data: autoLoginContext
    });
  } catch (error) {
    console.error('❌ Error storing auto-login context:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to store auto-login context'
    });
  }
});

// GET /api/tickets/auto-login-context/:email - Get auto-login context for a user
router.get('/auto-login-context/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    console.log('🔍 Retrieving auto-login context for:', email);
    
    // In a real implementation, you would retrieve this from your storage
    // For now, we'll return a mock response
    const mockContext = {
      email,
      product: 'ProjectX', // Default product
      phone: '1234567890', // Default phone
      timestamp: new Date().toISOString(),
      source: 'auto-login'
    };
    
    res.json({
      success: true,
      message: 'Auto-login context retrieved successfully',
      data: mockContext
    });
  } catch (error) {
    console.error('❌ Error retrieving auto-login context:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve auto-login context'
    });
  }
});

// GET /api/tickets - Get all tickets with optional filtering (role-based: managers see all, agents see assigned)
router.get('/', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureCustomerEscalationSchema();
    const { status } = req.query;
    const tenantId = req.tenantId;
    const user = req.user;

    // Simple cache for list (scoped by tenant, role, agentId, status)
    const agentId = user?.id || user?.userId || null;
    const role = String(user?.role || '').toLowerCase();
    const cacheKey = `tickets:list:v1:tenant=${tenantId}:role=${role}:agent=${agentId || 0}:status=${status || 'all'}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }
    
    const taskTableExists = await hasTicketTasksTable();
    const taskSummaryJoin = taskTableExists ? `
      LEFT JOIN (
        SELECT
          tt.ticket_id,
          tt.tenant_id,
          COUNT(*) AS total_tasks,
          SUM(CASE WHEN tt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
          GROUP_CONCAT(DISTINCT a2.name ORDER BY a2.name SEPARATOR ', ') AS grouped_assigned_agents
        FROM ticket_tasks tt
        LEFT JOIN agents a2 ON a2.id = tt.assigned_agent_id AND a2.tenant_id = tt.tenant_id
        WHERE COALESCE(tt.is_removed, 0) = 0
        GROUP BY tt.ticket_id, tt.tenant_id
      ) ttask ON ttask.ticket_id = t.id AND ttask.tenant_id = t.tenant_id
    ` : '';

    let query = `
      SELECT 
        t.id, 
        t.name, 
        t.email, 
        t.mobile, 
        t.product, 
        t.product_id, 
        t.module, 
        t.module_id, 
        CASE
          WHEN t.description IS NULL THEN NULL
          WHEN CHAR_LENGTH(t.description) > 800 THEN CONCAT(LEFT(t.description, 800), '…')
          ELSE t.description
        END AS description,
        t.issue_type, 
        t.issue_type_other, 
        t.issue_title, 
        t.attachment_name, 
        t.attachment_type, 
        t.status, 
        t.priority,
        ${await ticketsHasColumn('is_escalated') ? 'COALESCE(t.is_escalated, 0) AS is_escalated,' : '0 AS is_escalated,'}
        ${await ticketsHasColumn('escalation_level') ? 'COALESCE(t.escalation_level, 0) AS escalation_level,' : '0 AS escalation_level,'}
        ${await ticketsHasColumn('escalated_at') ? 't.escalated_at,' : 'NULL AS escalated_at,'}
        ${await ticketsHasColumn('reopen_count') ? 'COALESCE(t.reopen_count, 0) AS reopen_count,' : '0 AS reopen_count,'}
        ${await ticketsHasColumn('last_agent_reply_at') ? 't.last_agent_reply_at,' : 'NULL AS last_agent_reply_at,'}
        t.user_id, 
        t.assigned_to,
        t.assigned_by,
        t.created_at, 
        t.updated_at,
        t.resolution_time,
        t.first_response_at,
        t.sla_first_response_met,
        t.resolved_at,
        u.name as assigned_to_name,
        u.email as assigned_to_email,
        u.department as department,
        ta.agent_id as allocation_agent_id,
        ${taskTableExists ? 'COALESCE(ttask.total_tasks, 0)' : '0'} as total_tasks,
        ${taskTableExists ? 'COALESCE(ttask.completed_tasks, 0)' : '0'} as completed_tasks,
        ${taskTableExists ? 'COALESCE(ttask.grouped_assigned_agents, \'\')' : '\'\''} as grouped_assigned_agents,
        ${taskTableExists ? 'CASE WHEN COALESCE(ttask.total_tasks, 0) > 0 THEN 1 ELSE 0 END' : '0'} as is_grouped
      FROM tickets t
      LEFT JOIN agents u ON t.assigned_to = u.id AND u.tenant_id = ?
      LEFT JOIN ticket_allocations ta ON ta.ticket_id = t.id AND ta.tenant_id = ?
      ${taskSummaryJoin}
      WHERE t.tenant_id = ?
    `;
    const params = [tenantId, tenantId, tenantId];
    
    // Manager Override: support_agent sees only assigned tickets; support_manager/ceo see all
    if (user && (role === 'support_agent' || role === 'agent')) {
      const agentId = user.id || user.userId;
      
      // Agent inherits department visibility from their assigned manager’s primary department
      const [agentInfo] = await pool.execute(
        'SELECT manager_id FROM agents WHERE id = ?',
        [agentId]
      );
      let mgrDeptId = null;
      if (agentInfo.length > 0 && agentInfo[0].manager_id) {
        const [mgrDeptInfo] = await pool.execute(
          'SELECT primary_department_id FROM agents WHERE id = ?',
          [agentInfo[0].manager_id]
        );
        if (mgrDeptInfo.length > 0) {
          mgrDeptId = mgrDeptInfo[0].primary_department_id;
        }
      }

      if (mgrDeptId) {
        if (taskTableExists) {
          query += ` AND (
            t.assigned_to = ?
            OR t.department_id = ?
            OR EXISTS (
              SELECT 1
              FROM ticket_tasks tt_scope
              WHERE tt_scope.ticket_id = t.id
                AND tt_scope.tenant_id = t.tenant_id
                AND tt_scope.assigned_agent_id = ?
                AND COALESCE(tt_scope.is_removed, 0) = 0
            )
          )`;
          params.push(agentId, mgrDeptId, agentId);
        } else {
          query += ' AND (t.assigned_to = ? OR t.department_id = ?)';
          params.push(agentId, mgrDeptId);
        }
      } else {
        if (taskTableExists) {
          query += ` AND (
            t.assigned_to = ?
            OR EXISTS (
              SELECT 1
              FROM ticket_tasks tt_scope
              WHERE tt_scope.ticket_id = t.id
                AND tt_scope.tenant_id = t.tenant_id
                AND tt_scope.assigned_agent_id = ?
                AND COALESCE(tt_scope.is_removed, 0) = 0
            )
          )`;
          params.push(agentId, agentId);
        } else {
          query += ' AND t.assigned_to = ?';
          params.push(agentId);
        }
      }
    } else if (user && (role === 'support_manager' || role === 'manager')) {
      const agentId = user.id || user.userId;
      
      // Get manager's own department and additional allowed departments
      const [mgrInfo] = await pool.execute(
        'SELECT primary_department_id FROM agents WHERE id = ?',
        [agentId]
      );
      let primaryDeptId = null;
      if (mgrInfo.length > 0) {
        primaryDeptId = mgrInfo[0].primary_department_id;
      }

      const [permDepts] = await pool.execute(
        'SELECT department_id FROM manager_department_permissions WHERE manager_id = ? AND can_view = 1',
        [agentId]
      );
      const allowedDeptIds = permDepts.map(p => p.department_id);
      if (primaryDeptId) {
        allowedDeptIds.push(primaryDeptId);
      }

      if (allowedDeptIds.length > 0) {
        const placeholders = allowedDeptIds.map(() => '?').join(', ');
        query += ` AND (
          t.department_id IN (${placeholders})
          OR t.assigned_to IN (SELECT id FROM agents WHERE manager_id = ?)
          OR t.assigned_to IN (SELECT id FROM agents WHERE primary_department_id IN (${placeholders}))
        )`;
        params.push(...allowedDeptIds, agentId, ...allowedDeptIds);
      } else {
        query += ` AND (
          t.assigned_to IN (SELECT id FROM agents WHERE manager_id = ?)
        )`;
        params.push(agentId);
      }
    }
    
    if (status && ['new', 'in_progress', 'resolved', 'closed', 'escalated'].includes(status)) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    
    // Prefer lifecycle ordering: reopened/updated tickets should float to top.
    query += ' ORDER BY t.updated_at DESC, t.created_at DESC';
    
    const [tickets] = await pool.execute(query, params);
    const normalizedTickets = (tickets || []).map((ticket) => {
      const totalTasks = Number(ticket.total_tasks || 0);
      const fromTasks = String(ticket.grouped_assigned_agents || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      const groupedNames =
        totalTasks > 0
          ? fromTasks
          : (() => {
              const names = [...fromTasks];
              const primaryAssignee = String(ticket.assigned_to_name || '').trim();
              if (primaryAssignee && !names.includes(primaryAssignee)) names.unshift(primaryAssignee);
              return names;
            })();
      return {
        ...ticket,
        grouped_assigned_agents: groupedNames.join(', '),
        is_grouped: totalTasks > 0 ? 1 : 0
      };
    });
    
    res.json({
      success: true,
      data: normalizedTickets
    });

    cacheSet(cacheKey, normalizedTickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets'
    });
  }
});

// POST /api/tickets/:id/reassign - Reassign ticket to a specific agent (must be before /:id to match correctly)
router.post('/:id/reassign', authenticateToken, setTenantContext, verifyTenantAccess, async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    await ensureTicketAssignmentMetaColumns();
    console.log(`📋 Reassign route hit: POST /api/tickets/${req.params.id}/reassign`);
    const ticketId = parseInt(req.params.id);
    const { agent_id } = req.body;
    const managerId = req.user?.id ?? req.user?.userId;
    const tenantId = req.tenantId || 1;
    const actorRole = String(req.user?.role || '').toLowerCase();
    const isManagerActor = MANAGER_ROLES.includes(actorRole);

    if (!isManagerActor) {
      return res.status(403).json({
        success: false,
        message: 'Only managers can reassign tickets.'
      });
    }

    // assigned_by FK references users(id); staff come from agents table. Use NULL to avoid FK violation.
    let assigned_by = null;
    if (managerId) {
      const [userCheck] = await pool.execute('SELECT id FROM users WHERE id = ?', [managerId]);
      if (userCheck.length > 0) assigned_by = managerId;
    }

    if (!agent_id) {
      return res.status(400).json({ success: false, message: 'agent_id is required' });
    }

    const [tickets] = await pool.execute(
      'SELECT id, assigned_to, tenant_id, status, parent_ticket_id, name as customer_name, issue_title, email, mobile, user_id FROM tickets WHERE id = ? AND tenant_id = ?',
      [ticketId, tenantId]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (tickets[0].parent_ticket_id) {
      return res.status(409).json({
        success: false,
        message: `Ticket is linked to parent #${tickets[0].parent_ticket_id}. Reassign from parent ticket only.`
      });
    }

    // Internal linked-ticket groups: only the primary ticket can be reassigned.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, ticketId]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (primaryId && primaryId !== ticketId) {
            return res.status(409).json({
              success: false,
              message: `This ticket is linked under primary ticket #${primaryId}. Reassign from the primary ticket only.`,
              data: { primary_ticket_id: primaryId }
            });
          }
        }
      }
    } catch (_) {}

    const [agents] = await pool.execute(
      'SELECT id, name, email, level, role FROM agents WHERE id = ? AND is_active = TRUE',
      [agent_id]
    );
    if (agents.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const ticketTenantId = tickets[0].tenant_id ?? tenantId;
    // Reassign = fresh start for new agent: set status to 'new' so it appears in New tickets section
    const reassignLevel = normalizeSupportLevel(agents[0]?.level, inferLevelFromRole(agents[0]?.role));
    const [result] = await pool.execute(
      `UPDATE tickets
       SET assigned_to = ?, assigned_by = ?, current_owner_id = ?, current_level = ?, status = ?,
           assignment_source = 'manual',
           assignment_reason = COALESCE(?, 'Manager reassigned'),
           updated_at = NOW()
       WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [agent_id, assigned_by, agent_id, reassignLevel, 'new', String(req.body?.reason || '').trim().slice(0, 255) || null, ticketId, ticketTenantId]
    );
    if (result.affectedRows === 0) {
      const [r2] = await pool.execute(
        `UPDATE tickets
         SET assigned_to = ?, assigned_by = ?, current_owner_id = ?, current_level = ?, status = ?,
             assignment_source = 'manual',
             assignment_reason = COALESCE(?, 'Manager reassigned'),
             updated_at = NOW()
         WHERE id = ?`,
        [agent_id, assigned_by, agent_id, reassignLevel, 'new', String(req.body?.reason || '').trim().slice(0, 255) || null, ticketId]
      );
      if (r2.affectedRows === 0) {
        return res.status(500).json({ success: false, message: 'Failed to update ticket' });
      }
    }

    try {
      await ticketEventNotificationService.notifyReassignedInternal({
        ticketId,
        tenantId: ticketTenantId,
        fromAgentId: tickets[0].assigned_to,
        toAgentId: agent_id,
        toAgentName: agents[0].name,
        customerName: tickets[0].customer_name,
        customerEmail: tickets[0].email,
        customerMobile: tickets[0].mobile,
        customerUserId: tickets[0].user_id,
        issueTitle: tickets[0].issue_title,
        managerId,
        managerName: req.user?.name || 'Manager',
        agentEmail: agents[0].email,
        agentDisplayName: agents[0].name
      });
    } catch (e) {
      console.warn('Could not run reassignment notifications:', e?.message);
    }

    // Fan-out reassignment to internal linked-ticket group members (if any).
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, ticketId]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [items] = await pool.execute(
            `SELECT ticket_id
             FROM ticket_link_group_items
             WHERE tenant_id = ? AND group_id = ?`,
            [tenantId, groupId]
          );
          const linkedIds = (items || [])
            .map((r) => Number(r.ticket_id))
            .filter((v) => Number.isFinite(v) && v > 0 && v !== ticketId);
          for (const tid of linkedIds) {
            await pool.execute(
              `UPDATE tickets
               SET assigned_to = ?, assigned_by = ?, current_owner_id = ?, current_level = ?, status = ?,
                   assignment_source = 'manual',
                   assignment_reason = COALESCE(?, 'Manager reassigned'),
                   updated_at = NOW()
               WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
              [
                agent_id,
                assigned_by,
                agent_id,
                reassignLevel,
                'new',
                String(req.body?.reason || '').trim().slice(0, 255) || null,
                tid,
                ticketTenantId
              ]
            );
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Linked-group reassignment sync failed:', e?.message || e);
    }

    res.json({
      success: true,
      message: 'Ticket reassigned successfully',
      data: { assigned_to: agent_id, assigned_to_name: agents[0].name }
    });
  } catch (error) {
    console.error('Error reassigning ticket:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to assign ticket'
    });
  }
});

// GET /api/tickets/:id/similar-recommendations - Manager recommendation list (no auto-combine)
router.get('/:id/similar-recommendations', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.id);
    const role = String(req.user?.role || '').toLowerCase();
    if (!SUPPORT_STAFF_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Not allowed.' });
    }
    if (!ticketId) return res.status(400).json({ success: false, message: 'Invalid ticket id' });
    const refresh = String(req.query?.refresh || '').trim() === '1';
    const requestedLimit = Number(req.query?.limit || 0);
    // Default "show all" within window: cap to 200 to match candidate query limit.
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
      : 200;
    const similar = await getSimilarTicketRecommendations({ tenantId, ticketId, limit, refresh });
    const referenceResolutions = await getReferenceResolutionRecommendations({ tenantId, ticketId, maxItems: 20 });
    return res.json({
      success: true,
      data: {
        ticket_id: ticketId,
        similar_tickets: Array.isArray(similar) ? similar : [],
        reference_resolutions: Array.isArray(referenceResolutions) ? referenceResolutions : []
      }
    });
  } catch (error) {
    console.error('Error fetching similar recommendations:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch recommendations' });
  }
});

// POST /api/tickets/:id/similar-recommendations/:suggestedId/dismiss - hide a suggestion for this ticket
router.post('/:id/similar-recommendations/:suggestedId/dismiss', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.id);
    const suggestedTicketId = Number(req.params.suggestedId);
    const role = String(req.user?.role || '').toLowerCase();
    if (!MANAGER_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only managers can dismiss recommendations.' });
    }
    if (!ticketId || !suggestedTicketId) {
      return res.status(400).json({ success: false, message: 'Invalid dismiss request.' });
    }
    await ensureSimilarAiSuggestionsSchema();
    await pool.execute(
      `INSERT INTO similar_ticket_ai_suggestions (tenant_id, ticket_id, suggested_ticket_id, score, reasons_json, dismissed_at)
       VALUES (?, ?, ?, 0, '[]', NOW())
       ON DUPLICATE KEY UPDATE dismissed_at = NOW(), updated_at = NOW()`,
      [tenantId, ticketId, suggestedTicketId]
    );
    return res.json({ success: true, message: 'Dismissed.' });
  } catch (error) {
    console.error('Error dismissing recommendation:', error);
    return res.status(500).json({ success: false, message: 'Failed to dismiss recommendation.' });
  }
});

// POST /api/tickets/:id/link-children - Manager combines similar tickets under one parent
router.post('/:id/link-children', authenticateToken, verifyTenantAccess, async (req, res) => {
  let connection = null;
  try {
    await ensureEscalationWorkflowSchema();
    const tenantId = req.tenantId || 1;
    const parentId = Number(req.params.id);
    const role = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id || req.user?.userId || 0) || null;
    const actorName = req.user?.name || req.user?.email || 'Manager';
    if (!MANAGER_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only managers can combine tickets.' });
    }
    if (!parentId) {
      return res.status(400).json({ success: false, message: 'Invalid parent ticket id.' });
    }
    const requestedIds = Array.isArray(req.body?.child_ticket_ids)
      ? req.body.child_ticket_ids.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    const uniqueChildIds = [...new Set(requestedIds)].filter((v) => v !== parentId);
    if (!uniqueChildIds.length) {
      return res.status(400).json({ success: false, message: 'child_ticket_ids is required.' });
    }
    const linkReason = String(req.body?.reason || 'Linked to similar existing issue').trim().slice(0, 500);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [parents] = await connection.execute(
      `SELECT id, tenant_id, status, current_level, current_owner_id, assigned_to, name, email, parent_ticket_id
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1 FOR UPDATE`,
      [parentId, tenantId]
    );
    if (!parents.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Parent ticket not found.' });
    }
    const parent = parents[0];
    if (parent.parent_ticket_id) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'A child ticket cannot be used as parent.' });
    }
    const parentResolution = await getTicketResolutionDetails(parentId, tenantId);
    const parentResolutionSummary = String(parentResolution?.resolution_summary || '').trim();
    const parentStatus = String(parent.status || '').toLowerCase();
    const parentIsTerminal = ['resolved', 'closed'].includes(parentStatus);
    if (parentIsTerminal && !parentResolutionSummary) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Parent ticket is resolved/closed but has no structured resolution summary. Capture resolution details before combining.',
        data: { requires_resolution_summary: true }
      });
    }
    if (parentResolutionSummary && req.body?.confirm_resolution_reuse !== true) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Confirm that linked child tickets should reuse the parent resolution summary.',
        data: {
          requires_resolution_confirmation: true,
          resolution_summary: parentResolutionSummary
        }
      });
    }
    const placeholders = uniqueChildIds.map(() => '?').join(', ');
    const [children] = await connection.execute(
      `SELECT id, status, parent_ticket_id, current_owner_id, assigned_to
       FROM tickets
       WHERE tenant_id = ? AND id IN (${placeholders})
       FOR UPDATE`,
      [tenantId, ...uniqueChildIds]
    );
    const childMap = new Map(children.map((c) => [Number(c.id), c]));
    const missing = uniqueChildIds.filter((id) => !childMap.has(id));
    if (missing.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: `Child ticket(s) not found: ${missing.join(', ')}` });
    }
    const alreadyLinkedElsewhere = children.filter((c) => c.parent_ticket_id && Number(c.parent_ticket_id) !== parentId).map((c) => c.id);
    if (alreadyLinkedElsewhere.length) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Some tickets are already linked to another parent: ${alreadyLinkedElsewhere.join(', ')}`
      });
    }

    const previousChildOwnerMap = {};
    for (const child of children) {
      const childId = Number(child.id);
      if (!childId) continue;
      previousChildOwnerMap[childId] =
        Number(child.current_owner_id || child.assigned_to || 0) || null;
    }

    const targetStatusRaw = String(parent.status || 'new').toLowerCase();
    const targetStatus = targetStatusRaw === 'closed' ? 'resolved' : targetStatusRaw;

    // Batch update children (much faster than per-row updates)
    const childPlaceholders = uniqueChildIds.map(() => '?').join(', ');
    await connection.execute(
      `UPDATE tickets
       SET parent_ticket_id = ?, linked_to_parent_at = NOW(), linked_by = ?, linked_reason = ?,
           status = ?, current_level = ?, current_owner_id = ?, assigned_to = ?, updated_at = NOW()
       WHERE tenant_id = ? AND id IN (${childPlaceholders})`,
      [
        parentId,
        actorId,
        linkReason || null,
        targetStatus,
        normalizeSupportLevel(parent.current_level, 'L1'),
        parent.current_owner_id || null,
        parent.assigned_to || null,
        tenantId,
        ...uniqueChildIds
      ]
    );

    // Keep per-child activity logs (behavior unchanged)
    for (const childId of uniqueChildIds) {
      await ticketActivityService.logActivity({
        ticketId: childId,
        tenantId,
        action: ticketActivityService.ACTIONS.TICKET_LIFECYCLE_EVENT,
        performedBy: actorId,
        performedByName: actorName,
        details: {
          eventType: 'LINKED_TO_PARENT',
          parent_ticket_id: parentId,
          parent_status: targetStatus,
          message: `This ticket was linked to an existing issue (Ticket #${parentId}) currently in ${targetStatus}.`,
          link_reason: linkReason || null,
          parent_resolution_summary: parentResolutionSummary || null
        }
      });
    }

    await ticketActivityService.logActivity({
      ticketId: parentId,
      tenantId,
      action: ticketActivityService.ACTIONS.TICKET_LIFECYCLE_EVENT,
      performedBy: actorId,
      performedByName: actorName,
      details: {
        eventType: 'CHILDREN_LINKED',
        child_ticket_ids: uniqueChildIds,
        link_reason: linkReason || null,
        parent_resolution_summary: parentResolutionSummary || null
      }
    });

    await connection.commit();
    connection.release();
    connection = null;

    // Keep combine API responsive: run heavy sync/notifications asynchronously.
    const parentSnapshot = {
      ...parent,
      id: Number(parentId),
      status: targetStatus,
      current_level: normalizeSupportLevel(parent.current_level, 'L1')
    };
    void syncLinkedChildrenFromParent({
      parentTicket: parentSnapshot,
      tenantId,
      actorId,
      actorName,
      syncStatus: true,
      syncEta: true
    }).catch((syncErr) => {
      console.warn('Post-combine child sync failed:', syncErr?.message || syncErr);
    });

    void ticketEventNotificationService.notifyTicketsCombinedInternal({
      tenantId,
      parentTicketId: parentId,
      childTicketIds: uniqueChildIds,
      parentOwnerId: Number(parent.current_owner_id || parent.assigned_to || 0) || null,
      previousChildOwnerMap,
      actorName
    }).catch((notifyErr) => {
      console.warn('Combined-ticket agent notifications failed:', notifyErr?.message || notifyErr);
    });

    return res.json({
      success: true,
      message: `Linked ${uniqueChildIds.length} ticket(s) to parent #${parentId}.`,
      data: {
        parent_ticket_id: parentId,
        child_ticket_ids: uniqueChildIds,
        parent_resolution_summary: parentResolutionSummary || null
      }
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
      try { connection.release(); } catch (_) {}
    }
    console.error('Error linking child tickets:', error);
    return res.status(500).json({ success: false, message: 'Failed to link tickets' });
  }
});

// POST /api/tickets/:id/unlink-child/:childId - Manager can undo wrong combine
router.post('/:id/unlink-child/:childId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    const tenantId = req.tenantId || 1;
    const parentId = Number(req.params.id);
    const childId = Number(req.params.childId);
    const role = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id || req.user?.userId || 0) || null;
    const actorName = req.user?.name || req.user?.email || 'Manager';
    if (!MANAGER_ROLES.includes(role)) {
      return res.status(403).json({ success: false, message: 'Only managers can unlink tickets.' });
    }
    if (!parentId || !childId) {
      return res.status(400).json({ success: false, message: 'Invalid parent/child ticket id.' });
    }
    const [rows] = await pool.execute(
      `SELECT id, parent_ticket_id
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [childId, tenantId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Child ticket not found.' });
    if (Number(rows[0].parent_ticket_id || 0) !== parentId) {
      return res.status(400).json({ success: false, message: `Ticket #${childId} is not linked to parent #${parentId}.` });
    }
    await pool.execute(
      `UPDATE tickets
       SET parent_ticket_id = NULL, linked_to_parent_at = NULL, linked_by = NULL, linked_reason = NULL, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [childId, tenantId]
    );
    await ticketActivityService.logActivity({
      ticketId: childId,
      tenantId,
      action: ticketActivityService.ACTIONS.TICKET_LIFECYCLE_EVENT,
      performedBy: actorId,
      performedByName: actorName,
      details: {
        eventType: 'UNLINKED_FROM_PARENT',
        parent_ticket_id: parentId,
        message: `This ticket was unlinked from parent Ticket #${parentId}.`
      }
    });
    return res.json({
      success: true,
      message: `Ticket #${childId} unlinked from parent #${parentId}.`,
      data: { parent_ticket_id: parentId, child_ticket_id: childId }
    });
  } catch (error) {
    console.error('Error unlinking child ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to unlink ticket' });
  }
});

// GET /api/tickets/escalation-requests - Get pending escalation requests for managers
router.get('/escalation-requests', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const actorRole = String(req.user?.role || '').toLowerCase();
    
    if (!MANAGER_ROLES.includes(actorRole)) {
      return res.status(403).json({ success: false, message: 'Only managers can view escalation requests.' });
    }

    const [requests] = await pool.execute(
      `SELECT r.*, t.issue_title, a.name AS requester_name 
       FROM ticket_escalation_requests r
       JOIN tickets t ON r.ticket_id = t.id
       LEFT JOIN agents a ON r.requested_by = a.id
       WHERE r.tenant_id = ? AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [tenantId]
    );

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Error fetching escalation requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch escalation requests' });
  }
});

// POST /api/tickets/escalation-requests/:id/reject
router.post('/escalation-requests/:id/reject', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const requestId = Number(req.params.id);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id || req.user?.userId || req.user?.agentId || 0);
    const comment = String(req.body?.manager_comment || '').trim();
    
    if (!MANAGER_ROLES.includes(actorRole)) {
      return res.status(403).json({ success: false, message: 'Only managers can reject escalation requests.' });
    }
    
    const [rows] = await pool.execute(`SELECT * FROM ticket_escalation_requests WHERE id = ? AND tenant_id = ?`, [requestId, tenantId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Escalation request not found.' });
    
    const request = rows[0];
    if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'Request is already ' + request.status });
    
    await pool.execute(`UPDATE ticket_escalation_requests SET status = 'rejected', manager_id = ?, manager_comment = ? WHERE id = ?`, [actorId, comment, requestId]);
    
    // Notify requesting agent
    try {
      await pool.execute(
        `INSERT INTO app_notifications (tenant_id, user_id, title, message, type, reference_id, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())`,
        [tenantId, request.requested_by, 'Escalation Request Rejected', `Your escalation request for Ticket #${request.ticket_id} was rejected.`, 'system', request.ticket_id]
      );
    } catch (ne) { }
    
    res.json({ success: true, message: 'Escalation request rejected.' });
  } catch (error) {
    console.error('Error rejecting escalation request:', error);
    res.status(500).json({ success: false, message: 'Failed to reject request' });
  }
});

// POST /api/tickets/escalation-requests/:id/approve
router.post('/escalation-requests/:id/approve', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const requestId = Number(req.params.id);
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id || req.user?.userId || req.user?.agentId || 0);
    const comment = String(req.body?.manager_comment || '').trim();
    
    if (!MANAGER_ROLES.includes(actorRole)) {
      return res.status(403).json({ success: false, message: 'Only managers can approve escalation requests.' });
    }
    
    const [rows] = await pool.execute(`SELECT * FROM ticket_escalation_requests WHERE id = ? AND tenant_id = ?`, [requestId, tenantId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Escalation request not found.' });
    
    const request = rows[0];
    if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'Request is already ' + request.status });
    
    const assignmentMode = req.body?.assignment_mode || 'auto';
    const assignedAgentId = req.body?.assigned_agent_id ? Number(req.body.assigned_agent_id) : null;
    const targetLevel = req.body?.target_level || request.requested_level;

    // Mark as approved
    await pool.execute(
      `UPDATE ticket_escalation_requests 
       SET status = 'approved', manager_id = ?, manager_comment = ?, approved_at = NOW(), 
           assignment_mode = ?, assigned_agent_id = ?, requested_level = ?
       WHERE id = ?`, 
      [actorId, comment, assignmentMode, assignedAgentId, targetLevel, requestId]
    );

    // Now execute the escalation by spoofing the request parameters
    req.params.id = request.ticket_id;
    req.body = {
      target_level: targetLevel,
      reason: request.escalation_reason,
      notes: request.work_done,
      assignment_mode: assignmentMode,
      assigned_agent_id: assignedAgentId
    };

    // Notify requesting agent of approval
    try {
      await pool.execute(
        `INSERT INTO app_notifications (tenant_id, user_id, title, message, type, reference_id, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())`,
        [tenantId, request.requested_by, 'Escalation Request Approved', `Your escalation request for Ticket #${request.ticket_id} was approved.`, 'system', request.ticket_id]
      );
    } catch (ne) { }

    // Re-dispatch to the normal escalate handler now that req.body has the mapped fields and req.user is a manager.
    req.url = `/api/tickets/${request.ticket_id}/escalate`;
    req.app.handle(req, res);
    
  } catch (error) {
    console.error('Error approving escalation request:', error);
    res.status(500).json({ success: false, message: 'Failed to approve request' });
  }
});

// GET /api/tickets/:id - Get single ticket with replies
router.get('/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    await ensureTicketResolutionSchema();
    await ensureCustomerEscalationSchema();
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    // CRITICAL: Ensure tenantId is set - this is a security requirement
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }
    
    // Debug logging
    console.log(`🔍 GET /api/tickets/${id} - Tenant ID: ${tenantId}, User tenant_id: ${req.user?.tenant_id}`);
    
    // Get ticket details with assigned agent information (tenant-filtered)
    const [tickets] = await pool.execute(`
      SELECT 
        t.id,
        t.tenant_id,
        t.user_id,
        t.name,
        t.email,
        t.mobile,
        t.country_code,
        t.description,
        t.issue_type,
        t.issue_type_other,
        t.issue_title,
        t.product,
        t.product_id,
        t.module,
        t.module_id,
        t.utm_description,
        t.status,
        t.priority,
        ${await ticketsHasColumn('affected_users') ? 't.affected_users,' : 'NULL AS affected_users,'}
        ${await ticketsHasColumn('business_impact') ? 't.business_impact,' : 'NULL AS business_impact,'}
        ${await ticketsHasColumn('priority_score') ? 't.priority_score,' : 'NULL AS priority_score,'}
        ${await ticketsHasColumn('priority_reason') ? 't.priority_reason,' : 'NULL AS priority_reason,'}
        ${await ticketsHasColumn('priority_source') ? 't.priority_source,' : "'ai' AS priority_source,"}
        t.category,
        t.subcategory,
        t.satisfaction_rating,
        t.satisfaction_comment,
        t.assigned_to,
        t.assigned_by,
        ${await ticketsHasColumn('assignment_reason')
          ? `COALESCE(
              t.assignment_reason,
              (SELECT taa.assignment_reason
               FROM ticket_assignments taa
               WHERE taa.ticket_id = t.id
                 AND (taa.tenant_id = ? OR taa.tenant_id IS NULL)
               ORDER BY taa.assigned_at DESC, taa.id DESC
               LIMIT 1)
            ) AS assignment_reason,`
          : `(
              SELECT taa.assignment_reason
              FROM ticket_assignments taa
              WHERE taa.ticket_id = t.id
                AND (taa.tenant_id = ? OR taa.tenant_id IS NULL)
              ORDER BY taa.assigned_at DESC, taa.id DESC
              LIMIT 1
            ) AS assignment_reason,`
        }
        t.current_owner_id,
        t.current_level,
        t.parent_ticket_id,
        t.group_title,
        t.group_internal_note,
        t.grouped_at,
        t.first_response_at,
        t.sla_first_response_met,
        t.resolved_at,
        t.eta_due_at,
        t.eta_reason,
        t.created_at,
        t.updated_at,
        t.closed_at,
        t.resolution_time,
        t.attachment_name,
        t.attachment_type,
        ${await ticketsHasColumn('is_escalated') ? 'COALESCE(t.is_escalated, 0) AS is_escalated,' : '0 AS is_escalated,'}
        ${await ticketsHasColumn('escalation_level') ? 'COALESCE(t.escalation_level, 0) AS escalation_level,' : '0 AS escalation_level,'}
        ${await ticketsHasColumn('escalation_reason') ? 't.escalation_reason,' : 'NULL AS escalation_reason,'}
        ${await ticketsHasColumn('escalation_comment') ? 't.escalation_comment,' : 'NULL AS escalation_comment,'}
        ${await ticketsHasColumn('escalated_at') ? 't.escalated_at,' : 'NULL AS escalated_at,'}
        ${await ticketsHasColumn('reopen_count') ? 'COALESCE(t.reopen_count, 0) AS reopen_count,' : '0 AS reopen_count,'}
        ${await ticketsHasColumn('reopen_reason') ? 't.reopen_reason,' : 'NULL AS reopen_reason,'}
        ${await ticketsHasColumn('last_agent_reply_at') ? 't.last_agent_reply_at,' : 'NULL AS last_agent_reply_at,'}
        u.name as assigned_to_name,
        u.email as assigned_to_email,
        oa.name as current_owner_name,
        oa.email as current_owner_email,
        COALESCE(oa.level, t.current_level, 'L1') as current_owner_level,
        pt.id AS parent_ticket_ref_id,
        pt.status AS parent_ticket_status,
        pt.issue_title AS parent_ticket_issue_title,
        pt.updated_at AS parent_ticket_updated_at,
        pt.current_level AS parent_ticket_current_level,
        pt.eta_due_at AS parent_ticket_eta_due_at,
        pt.eta_reason AS parent_ticket_eta_reason,
        poa.name AS parent_ticket_owner_name,
        poa.email AS parent_ticket_owner_email,
        ta.agent_id as allocation_agent_id
      FROM tickets t
      LEFT JOIN agents u ON t.assigned_to = u.id AND u.tenant_id = ?
      LEFT JOIN agents oa ON oa.id = COALESCE(t.current_owner_id, t.assigned_to) AND (oa.tenant_id = ? OR oa.tenant_id IS NULL)
      LEFT JOIN tickets pt ON pt.id = t.parent_ticket_id AND pt.tenant_id = t.tenant_id
      LEFT JOIN agents poa ON poa.id = COALESCE(pt.current_owner_id, pt.assigned_to) AND (poa.tenant_id = ? OR poa.tenant_id IS NULL)
      LEFT JOIN ticket_allocations ta ON ta.ticket_id = t.id AND ta.tenant_id = ?
      WHERE t.id = ? AND t.tenant_id = ?
    `, [tenantId, tenantId, tenantId, tenantId, tenantId, id, tenantId]);
    
    console.log(`🔍 Query executed - Found ${tickets.length} tickets for ticket_id=${id}, tenant_id=${tenantId}`);
    if (tickets.length > 0) {
      console.log(`🔍 Ticket found - tenant_id=${tickets[0].tenant_id}`);
    }
    
    let ticket = tickets[0];

    // Customer/SPOC Security isolation
    if (ticket && ['user', 'customer', 'org_spoc', 'product_spoc'].includes(String(req.user?.role || '').toLowerCase())) {
      const urole = String(req.user.role || '').toLowerCase();
      let hasAccess = false;
      
      // Tenant-level SPOC access control
      if (urole === 'org_spoc') {
        // Org SPOC has access to all tickets in their tenant
        hasAccess = Number(ticket.tenant_id || 0) === Number(req.user.tenant_id || 0);
      } else if (urole === 'product_spoc') {
        // Product SPOC has access to tickets in their tenant for their scoped product
        hasAccess = Number(ticket.tenant_id || 0) === Number(req.user.tenant_id || 0) &&
                    Number(ticket.product_id || 0) === Number(req.user.product_scope_id || 0);
      } else {
        // Standard user ownership
        hasAccess = Number(ticket.user_id || 0) === Number(req.user.id || 0) || 
                    (ticket.email && String(ticket.email).toLowerCase() === String(req.user.email || '').toLowerCase());
      }
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this ticket'
        });
      }
    }

    // Fallback for customers: if tenant-filtered query returned nothing, allow access
    // when the ticket belongs to the requester (handles tickets created with wrong tenant, e.g. IMAP)
    if (!ticket && ['user', 'customer'].includes(String(req.user?.role || '').toLowerCase())) {
      const [fallbackTickets] = await pool.execute(`
        SELECT
          t.id,
          t.tenant_id,
          t.user_id,
          t.name,
          t.email,
          t.mobile,
          t.country_code,
          t.description,
          t.issue_type,
          t.issue_type_other,
          t.issue_title,
          t.product,
          t.product_id,
          t.module,
          t.module_id,
          t.utm_description,
          t.status,
          t.priority,
        ${await ticketsHasColumn('affected_users') ? 't.affected_users,' : 'NULL AS affected_users,'}
        ${await ticketsHasColumn('business_impact') ? 't.business_impact,' : 'NULL AS business_impact,'}
        ${await ticketsHasColumn('priority_score') ? 't.priority_score,' : 'NULL AS priority_score,'}
        ${await ticketsHasColumn('priority_reason') ? 't.priority_reason,' : 'NULL AS priority_reason,'}
        ${await ticketsHasColumn('priority_source') ? 't.priority_source,' : "'ai' AS priority_source,"}
          t.assigned_to,
          t.assigned_by,
          t.parent_ticket_id,
          t.first_response_at,
          t.sla_first_response_met,
          t.resolved_at,
          t.created_at,
          t.updated_at,
          t.closed_at,
          t.resolution_time,
          t.attachment_name,
          t.attachment_type,
          t.attachment_path,
          t.attachment_mime,
          u.name as assigned_to_name,
          u.email as assigned_to_email
        FROM tickets t
        LEFT JOIN agents u ON t.assigned_to = u.id
        WHERE t.id = ? AND (t.user_id = ? OR t.email = ?)
      `, [id, req.user.id, req.user.email]);

      if (fallbackTickets.length > 0) {
        ticket = fallbackTickets[0];
        console.log(`🔍 Ticket ${id} found via customer ownership fallback (tenant_id=${ticket.tenant_id})`);

        const ticketMessagesService = require('../services/ticketMessagesService');
        const messages = await ticketMessagesService.getMessages(id, ticket.tenant_id, true);
        const fallbackReplies = messages.map(m => ({
          id: m.id,
          ticket_id: m.ticket_id,
          message: m.message,
          sent_at: m.created_at,
          created_at: m.created_at,
          is_customer_reply: m.sender_type === 'user',
          customer_name: m.sender_type === 'user' ? m.sender_name : null,
          agent_name: m.sender_type === 'agent' ? m.sender_name : null,
          channel: m.channel,
          sender_type: m.sender_type,
          sender_name: m.sender_name
        }));

        const customerTicket = { ...ticket };
        const fallbackResolutionDetails = await getTicketResolutionDetails(ticket.id, ticket.tenant_id || tenantId);
        const feedback = await getTicketFeedback({ ticketId: ticket.id, tenantId: ticket.tenant_id || tenantId });
        delete customerTicket.group_title;
        delete customerTicket.group_internal_note;
        delete customerTicket.grouped_at;
        return res.json({
          success: true,
          data: {
            ...customerTicket,
            feedback,
            resolution_details: formatResolutionForViewer(fallbackResolutionDetails, { includeInternal: false }),
            has_resolution_details: !!fallbackResolutionDetails,
            replies: fallbackReplies
          }
        });
      }
    }

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Manager Override: support_agent can only view tickets assigned to them.
    // For grouped-task workflow, also allow if this agent has at least one task under the ticket.
    const isManager = req.user && ['support_manager', 'manager', 'ceo', 'admin'].includes(req.user.role);
    let viewerHasTaskAssignment = false;
    if (!isManager && (req.user?.role === 'support_agent' || req.user?.role === 'agent')) {
      const agentId = req.user.id || req.user.userId;
      const ownerId = resolveTicketOwnerId(ticket);
      
      // Agent inherits department visibility from their assigned manager’s primary department
      const [agentInfo] = await pool.execute(
        'SELECT manager_id FROM agents WHERE id = ?',
        [agentId]
      );
      let mgrDeptId = null;
      if (agentInfo.length > 0 && agentInfo[0].manager_id) {
        const [mgrDeptInfo] = await pool.execute(
          'SELECT primary_department_id FROM agents WHERE id = ?',
          [agentInfo[0].manager_id]
        );
        if (mgrDeptInfo.length > 0) {
          mgrDeptId = mgrDeptInfo[0].primary_department_id;
        }
      }

      const isAssigned = (ownerId == agentId);
      const isSameDept = (mgrDeptId && ticket.department_id === mgrDeptId);

      if (!isAssigned && !isSameDept) {
        try {
          const [taskTable] = await pool.execute(
            `SELECT 1
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_tasks'
             LIMIT 1`
          );
          if (taskTable.length > 0) {
            const [taskRows] = await pool.execute(
              `SELECT id
               FROM ticket_tasks
               WHERE ticket_id = ? AND tenant_id = ? AND assigned_agent_id = ?
                 AND COALESCE(is_removed, 0) = 0
               LIMIT 1`,
              [ticket.id, tenantId, agentId]
            );
            viewerHasTaskAssignment = taskRows.length > 0;
          }
        } catch (taskCheckError) {
          console.warn('Task-assignment access check failed:', taskCheckError?.message);
          viewerHasTaskAssignment = false;
        }

        if (!viewerHasTaskAssignment) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. This ticket is not assigned to you and is not in your manager\'s department.'
          });
        }
      }
    } else if (req.user && ['support_manager', 'manager'].includes(req.user.role)) {
      const agentId = req.user.id || req.user.userId;
      
      // Get manager's own department and additional allowed departments
      const [mgrInfo] = await pool.execute(
        'SELECT primary_department_id FROM agents WHERE id = ?',
        [agentId]
      );
      let primaryDeptId = null;
      if (mgrInfo.length > 0) {
        primaryDeptId = mgrInfo[0].primary_department_id;
      }

      const [permDepts] = await pool.execute(
        'SELECT department_id FROM manager_department_permissions WHERE manager_id = ? AND can_view = 1',
        [agentId]
      );
      const allowedDeptIds = permDepts.map(p => p.department_id);
      if (primaryDeptId) {
        allowedDeptIds.push(primaryDeptId);
      }

      // Check if ticket's assigned agent is managed by the manager
      let isAssignedToSubagent = false;
      if (ticket.assigned_to) {
        const [subagents] = await pool.execute(
          'SELECT 1 FROM agents WHERE id = ? AND manager_id = ?',
          [ticket.assigned_to, agentId]
        );
        isAssignedToSubagent = subagents.length > 0;
      }

      // Check if ticket's assigned agent has primary_department_id in allowedDeptIds
      let isSubagentInAllowedDept = false;
      if (ticket.assigned_to && allowedDeptIds.length > 0) {
        const [subagentsDept] = await pool.execute(
          `SELECT 1 FROM agents WHERE id = ? AND primary_department_id IN (${allowedDeptIds.map(() => '?').join(', ')})`,
          [ticket.assigned_to, ...allowedDeptIds]
        );
        isSubagentInAllowedDept = subagentsDept.length > 0;
      }

      const hasDeptAccess = (ticket.department_id && allowedDeptIds.includes(ticket.department_id));

      if (!hasDeptAccess && !isAssignedToSubagent && !isSubagentInAllowedDept) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to view tickets in this department.'
        });
      }
    }
    
    // Load heavy sub-data in parallel to keep ticket open fast.
    const ticketMessagesService = require('../services/ticketMessagesService');
    const isCustomer = req.user && (req.user.role === 'user' || req.user.role === 'customer');

    const taskTableExists = await hasTicketTasksTable().catch(() => false);

    const groupedAgentsPromise = (!isCustomer && taskTableExists)
      ? pool.execute(
          `SELECT GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS names
           FROM ticket_tasks tt
           LEFT JOIN agents a ON a.id = tt.assigned_agent_id AND a.tenant_id = tt.tenant_id
           WHERE tt.ticket_id = ? AND tt.tenant_id = ? AND tt.assigned_agent_id IS NOT NULL
             AND COALESCE(tt.is_removed, 0) = 0`,
          [id, tenantId]
        ).then(([gn]) => String(gn?.[0]?.names || '').trim()).catch(() => '')
      : Promise.resolve('');

    const messagesPromise = ticketMessagesService.getMessages(id, tenantId, isCustomer).catch(() => []);
    const feedbackPromise = getTicketFeedback({ ticketId: Number(id), tenantId }).catch(() => null);

    const escalationPromise = (!isCustomer)
      ? pool.execute(
          `SELECT
             h.id,
             h.ticket_id,
             h.from_level,
             h.to_level,
             h.from_agent_id,
             h.to_agent_id,
             h.escalation_reason,
             h.notes,
             h.created_at,
             fa.name AS from_agent_name,
             ta.name AS to_agent_name
           FROM ticket_escalation_history h
           LEFT JOIN agents fa ON fa.id = h.from_agent_id
           LEFT JOIN agents ta ON ta.id = h.to_agent_id
           WHERE h.tenant_id = ? AND h.ticket_id = ?
           ORDER BY h.created_at DESC, h.id DESC`,
          [tenantId, id]
        ).then(([rows]) => rows || []).catch(() => [])
      : Promise.resolve([]);

    const linkedChildrenPromise = (!isCustomer && !ticket.parent_ticket_id)
      ? pool.execute(
          `SELECT
             c.id,
             c.status,
             c.issue_title,
             c.updated_at,
             c.name,
             c.email,
             c.current_level,
             ao.name AS current_owner_name
           FROM tickets c
           LEFT JOIN agents ao ON ao.id = COALESCE(c.current_owner_id, c.assigned_to)
           WHERE c.tenant_id = ? AND c.parent_ticket_id = ?
           ORDER BY c.updated_at DESC, c.id DESC`,
          [tenantId, ticket.id]
        ).then(([rows]) => rows || []).catch(() => [])
      : Promise.resolve([]);

    const attachmentsPromise = (async () => {
      await ensureTicketAttachmentsTable();
      const [attRows] = await pool.execute(
        `SELECT id, file_name, file_type, file_size, created_at
         FROM ticket_attachments
         WHERE ticket_id = ? AND tenant_id = ?
         ORDER BY id ASC`,
        [ticket.id, tenantId]
      );
      return attRows || [];
    })().catch(() => []);

    const resolutionPromise = getTicketResolutionDetails(ticket.id, tenantId).catch(() => null);

    const pendingEscalationPromise = (!isCustomer)
      ? pool.execute(
          `SELECT 1 FROM ticket_escalation_requests WHERE ticket_id = ? AND tenant_id = ? AND status = 'pending' LIMIT 1`,
          [id, tenantId]
        ).then(([rows]) => rows.length > 0).catch(() => false)
      : Promise.resolve(false);

    const [
      groupedAssignedAgentsStr,
      messages,
      escalationHistory,
      linkedChildren,
      attachments,
      ticketResolutionDetails,
      feedback,
      hasPendingEscalation
    ] = await Promise.all([
      groupedAgentsPromise,
      messagesPromise,
      escalationPromise,
      linkedChildrenPromise,
      attachmentsPromise,
      resolutionPromise,
      feedbackPromise,
      pendingEscalationPromise
    ]);

    const replies = (messages || []).map(m => ({
      id: m.id,
      ticket_id: m.ticket_id,
      message: m.message,
      sent_at: m.created_at,
      created_at: m.created_at,
      is_customer_reply: m.sender_type === 'user',
      customer_name: m.sender_type === 'user' ? m.sender_name : null,
      agent_name: m.sender_type === 'agent' ? m.sender_name : null,
      channel: m.channel,
      sender_type: m.sender_type,
      sender_name: m.sender_name,
      is_internal: !!m.is_internal
    }));

    const ticketPayload = { ...ticket, replies, attachments, feedback, pending_escalation_request: hasPendingEscalation };
    if (ticket.parent_ticket_id && ticket.parent_ticket_ref_id) {
      const parentResolution = await getTicketResolutionDetails(ticket.parent_ticket_ref_id, tenantId);
      ticketPayload.parent_ticket_summary = {
        id: Number(ticket.parent_ticket_ref_id),
        status: ticket.parent_ticket_status || null,
        issue_title: ticket.parent_ticket_issue_title || null,
        current_level: ticket.parent_ticket_current_level || null,
        current_owner_name: ticket.parent_ticket_owner_name || null,
        current_owner_email: ticket.parent_ticket_owner_email || null,
        has_resolution_details: !!parentResolution,
        resolution_details: formatResolutionForViewer(parentResolution, { includeInternal: !isCustomer }),
        resolution_summary: String(parentResolution?.resolution_summary || '').trim() || 'Resolution pending on parent ticket.',
        latest_update_at: ticket.parent_ticket_updated_at || null,
        eta_due_at: ticket.parent_ticket_eta_due_at || null,
        eta_reason: ticket.parent_ticket_eta_reason || null
      };
    }
    ticketPayload.resolution_details = formatResolutionForViewer(ticketResolutionDetails, { includeInternal: !isCustomer });
    ticketPayload.has_resolution_details = !!ticketResolutionDetails;
    // Internal linked-ticket groups: for non-primary tickets, always display the primary ticket's resolution.
    // (Children cannot edit resolution; they follow the parent's resolution.)
    if (!isCustomer) {
      try {
        const hasLinkItems = await hasTicketLinkItemsTable();
        if (hasLinkItems) {
          const [g] = await pool.execute(
            `SELECT group_id
             FROM ticket_link_group_items
             WHERE tenant_id = ? AND ticket_id = ?
             LIMIT 1`,
            [tenantId, Number(ticket.id)]
          );
          const groupId = Number(g?.[0]?.group_id || 0);
          if (groupId) {
            const [gr] = await pool.execute(
              `SELECT primary_ticket_id
               FROM ticket_link_groups
               WHERE tenant_id = ? AND id = ?
               LIMIT 1`,
              [tenantId, groupId]
            );
            const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
            if (primaryId && primaryId !== Number(ticket.id)) {
              const primaryResolution = await getTicketResolutionDetails(primaryId, tenantId);
              ticketPayload.resolution_details = formatResolutionForViewer(primaryResolution, { includeInternal: !isCustomer });
              ticketPayload.has_resolution_details = !!primaryResolution;
              ticketPayload.linked_primary_ticket_id = primaryId;
            }
          }
        }
      } catch (e) {
        // Ignore resolution display sync failures; fall back to the ticket's own resolution record.
      }
    }
    ticketPayload.linked_children = linkedChildren;
    delete ticketPayload.parent_ticket_ref_id;
    delete ticketPayload.parent_ticket_status;
    delete ticketPayload.parent_ticket_issue_title;
    delete ticketPayload.parent_ticket_updated_at;
    delete ticketPayload.parent_ticket_current_level;
    delete ticketPayload.parent_ticket_eta_due_at;
    delete ticketPayload.parent_ticket_eta_reason;
    delete ticketPayload.parent_ticket_owner_name;
    delete ticketPayload.parent_ticket_owner_email;
    if (!isCustomer) {
      ticketPayload.escalation_history = escalationHistory;
      ticketPayload.current_level = normalizeSupportLevel(
        ticket.current_level,
        normalizeSupportLevel(ticket.current_owner_level, 'L1')
      );
      ticketPayload.current_owner_id = resolveTicketOwnerId(ticket);
    }
    if (!isCustomer && groupedAssignedAgentsStr) {
      ticketPayload.grouped_assigned_agents = groupedAssignedAgentsStr;
    }
    if (!isCustomer) {
      const actorId = req.user?.id || req.user?.userId;
      const actorRole = String(req.user?.role || '').toLowerCase();
      const isAgentRole = ['support_agent', 'agent', 'admin'].includes(actorRole);
      const ownerId = resolveTicketOwnerId(ticket);
      const isEditableStatus = String(ticket.status || '').toLowerCase() !== 'closed';
      ticketPayload.can_edit_resolution =
        isEditableStatus &&
        isAgentRole &&
        (Number(ownerId || 0) === Number(actorId || 0) || viewerHasTaskAssignment);
    }
    if (isCustomer) {
      delete ticketPayload.group_title;
      delete ticketPayload.group_internal_note;
      delete ticketPayload.grouped_at;
      delete ticketPayload.linked_children;
      delete ticketPayload.parent_ticket_summary;
      delete ticketPayload.parent_ticket_id;
      delete ticketPayload.linked_to_parent_at;
      delete ticketPayload.linked_by;
      delete ticketPayload.linked_reason;
    }

    // Keep AI priority (priority/score/reason and inferred inputs) always up-to-date (default),
    // and only change it away from AI when a manager overrides priority (priority_source='manual').
    try {
      const hasReason = await ticketsHasColumn('priority_reason');
      const hasSource = await ticketsHasColumn('priority_source');
      const hasScore = await ticketsHasColumn('priority_score');
      const hasAffected = await ticketsHasColumn('affected_users');
      const hasImpact = await ticketsHasColumn('business_impact');
      if ((hasReason || hasScore || hasAffected || hasImpact) && !isCustomer) {
        const source = String(ticketPayload.priority_source || (hasSource ? 'ai' : 'ai')).toLowerCase();
        if (source === 'ai') {
          const next = calculatePriority({
            ...ticketPayload,
            ai_predicted_priority: ticketPayload.ai_predicted_priority || ticketPayload.priority || 'medium',
            priority: ticketPayload.ai_predicted_priority || ticketPayload.priority || 'medium',
            issue_title: ticketPayload.issue_title || ticketPayload.issueTitle || ticketPayload.issue_title_text || ticketPayload.issueTitle,
            description: ticketPayload.description || ''
          });

          const updates = [];
          const params = [];
          if (next?.priority && String(next.priority).toLowerCase() !== String(ticketPayload.priority || '').toLowerCase()) {
            ticketPayload.priority = next.priority;
            updates.push('priority = ?');
            params.push(next.priority);
          }
          if (hasScore && Number(next?.score) !== Number(ticketPayload.priority_score)) {
            ticketPayload.priority_score = next.score;
            updates.push('priority_score = ?');
            params.push(next.score);
          }
          if (hasReason) {
            const nextReason = String(next?.reason || '').trim();
            const currentReason = String(ticketPayload.priority_reason || '').trim();
            if (nextReason && nextReason !== currentReason) {
              ticketPayload.priority_reason = nextReason;
              updates.push('priority_reason = ?');
              params.push(nextReason);
            }
          }
          if (hasAffected && next?.inputs?.affected_users && String(next.inputs.affected_users) !== String(ticketPayload.affected_users || '')) {
            ticketPayload.affected_users = next.inputs.affected_users;
            updates.push('affected_users = ?');
            params.push(next.inputs.affected_users);
          }
          if (hasImpact && next?.inputs?.business_impact && String(next.inputs.business_impact) !== String(ticketPayload.business_impact || '')) {
            ticketPayload.business_impact = next.inputs.business_impact;
            updates.push('business_impact = ?');
            params.push(next.inputs.business_impact);
          }

          if (updates.length) {
            await pool.execute(
              `UPDATE tickets
               SET ${updates.join(', ')}
               WHERE id = ? AND tenant_id = ? ${hasSource ? "AND priority_source = 'ai'" : ''}`,
              [...params, Number(ticketPayload.id), tenantId]
            );
          }
        }
      }
    } catch (_) {
      // Non-blocking: don't fail ticket fetch if reason refresh fails.
    }

    res.json({
      success: true,
      data: ticketPayload
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket'
    });
  }
});

// PUT /api/tickets/:id/resolution-details - Create/update structured resolution details
router.put('/:id/resolution-details', authenticateToken, verifyTenantAccess, upload.single('resolution_attachment'), handleUploadError, async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    await ensureTicketResolutionSchema();
    const ticketId = Number(req.params.id);
    const tenantId = req.tenantId || 1;
    if (!ticketId) {
      return res.status(400).json({ success: false, message: 'Invalid ticket id' });
    }
    const actorRole = String(req.user?.role || '').toLowerCase();
    const actorId = Number(req.user?.id || req.user?.userId || 0) || null;
    const isAgentRole = ['support_agent', 'agent', 'admin'].includes(actorRole);
    if (['user', 'customer'].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: 'Customers can only view resolution summaries.'
      });
    }
    // Accept either JSON body or multipart/form-data.
    // When multipart, the resolution details are sent as a JSON string in req.body.resolution_details.
    let payload = req.body?.resolution_details;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { payload = null; }
    }
    if (!payload || typeof payload !== 'object') payload = req.body || {};
    const resolution = sanitizeResolutionInput(payload);
    const validationError = validateResolutionInput(resolution);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const [rows] = await pool.execute(
      `SELECT id, tenant_id, status, parent_ticket_id, assigned_to, current_owner_id
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [ticketId, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = rows[0];
    if (ticket.parent_ticket_id) {
      return res.status(409).json({
        success: false,
        message: `This ticket is linked to parent #${ticket.parent_ticket_id}. Resolution is managed on the parent ticket.`
      });
    }

    // Internal linked-ticket groups: only the group's primary ticket can edit/save resolution details.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, ticketId]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (primaryId && primaryId !== ticketId) {
            return res.status(409).json({
              success: false,
              message: `Resolution is managed on the primary linked ticket #${primaryId}.`,
              data: { primary_ticket_id: primaryId }
            });
          }
        }
      }
    } catch (_) {
      // ignore linked-group lookup failures
    }
    if (String(ticket.status || '').toLowerCase() === 'closed') {
      return res.status(400).json({ success: false, message: 'Resolution is read-only after ticket closure.' });
    }

    const ownerId = resolveTicketOwnerId(ticket);
    let hasTaskAssignment = false;
    if (actorId) {
      try {
        if (await hasTicketTasksTable()) {
          const [taskRows] = await pool.execute(
            `SELECT id
             FROM ticket_tasks
             WHERE ticket_id = ? AND tenant_id = ? AND assigned_agent_id = ?
               AND COALESCE(is_removed, 0) = 0
             LIMIT 1`,
            [ticketId, tenantId, actorId]
          );
          hasTaskAssignment = taskRows.length > 0;
        }
      } catch (e) {
        hasTaskAssignment = false;
      }
    }
    const canEdit =
      isAgentRole &&
      (Number(ownerId || 0) === Number(actorId || 0) || hasTaskAssignment);
    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned agent can add/edit resolution details.'
      });
    }

    const attachment = req.file
      ? { name: req.file.originalname, path: req.file.path, mime: req.file.mimetype }
      : null;
    const saved = await upsertTicketResolutionDetails({
      ticketId,
      tenantId,
      actorId,
      resolution,
      attachment
    });

    // If this is the primary linked ticket, copy the same resolution details to all linked tickets.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, ticketId]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (!primaryId || primaryId === ticketId) {
            const [items] = await pool.execute(
              `SELECT ticket_id
               FROM ticket_link_group_items
               WHERE tenant_id = ? AND group_id = ?`,
              [tenantId, groupId]
            );
            const linkedIds = (items || [])
              .map((r) => Number(r.ticket_id))
              .filter((v) => Number.isFinite(v) && v > 0 && v !== ticketId);
            for (const tid of linkedIds) {
              await upsertTicketResolutionDetails({
                ticketId: tid,
                tenantId,
                actorId,
                resolution,
                // Do not copy attachments across tickets (paths can differ / permissions).
                attachment: null
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Linked-group resolution sync failed:', e?.message || e);
    }

    // Keep knowledge portal synced when source resolution details change.
    // Upsert only when a knowledge entry already exists or ticket is currently closed.
    const normalizedTicketStatus = String(ticket.status || '').toLowerCase();
    if (normalizedTicketStatus === 'closed' || await hasKnowledgeEntryForTicket({ ticketId, tenantId })) {
      await upsertKnowledgeEntryFromTicket({ ticketId, tenantId });
    }
    await ticketActivityService.logActivity({
      ticketId,
      tenantId,
      action: ticketActivityService.ACTIONS.TICKET_LIFECYCLE_EVENT,
      performedBy: actorId,
      performedByName: req.user?.name || req.user?.email || 'Support',
      details: {
        eventType: 'RESOLUTION_CAPTURED',
        message: `Resolution added by ${req.user?.name || req.user?.email || 'Support'}.`,
        fix_type: saved?.fix_type || resolution.fix_type,
        has_root_cause: Boolean(saved?.root_cause || resolution.root_cause),
        has_reference: Boolean(saved?.reference_data || resolution.reference_data)
      }
    });

    const responseDetails = saved
      ? formatResolutionForViewer(saved, { includeInternal: true })
      : {
          id: null,
          ticket_id: ticketId,
          ...resolution,
          created_by: actorId || null,
          created_at: null,
          updated_at: null
        };
    return res.json({
      success: true,
      message: 'Resolution details saved successfully.',
      data: responseDetails
    });
  } catch (error) {
    console.error('Error saving resolution details:', error);
    return res.status(500).json({ success: false, message: 'Failed to save resolution details' });
  }
});

// GET /api/tickets/:id/resolution-attachment - Download resolution attachment
router.get('/:id/resolution-attachment', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const tenantId = req.tenantId || 1;
    if (!ticketId) {
      return res.status(400).json({ success: false, message: 'Invalid ticket id' });
    }

    const [rows] = await pool.execute(
      `SELECT attachment_name, attachment_path, attachment_mime
       FROM ticket_resolution_details
       WHERE ticket_id = ? AND tenant_id = ?
       LIMIT 1`,
      [ticketId, tenantId]
    );

    if (!rows.length || !rows[0].attachment_path) {
      return res.status(404).json({ success: false, message: 'Resolution attachment not found' });
    }

    const { attachment_name: fileName, attachment_path: filePath, attachment_mime: mimeType } = rows[0];

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Attachment file no longer exists on server' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${fileName || 'attachment'}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition,Content-Type');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error fetching resolution attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch resolution attachment' });
  }
});

// POST /api/tickets - Create new ticket
// Supports:
// - legacy single file: "attachment"
// - new multi files: "attachments"
router.post(
  '/',
  authenticateToken,
  verifyTenantAccess,
  ticketAttachmentsUpload.fields([
    { name: 'attachments', maxCount: 10 },
    // Some clients send array fields as "attachments[]"
    { name: 'attachments[]', maxCount: 10 },
    { name: 'attachment', maxCount: 1 }
  ]),
  handleUploadError,
  async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    await ensureSlaResolutionSchema();
    await ensureTicketPriorityAiColumns();
    await ensureAttachmentTypeColumnCapacity();
    await ensureTicketAttachmentsTable();
    await ensureTicketAssignmentMetaColumns();

    const tenantId = req.tenantId || 1;
    const { 
      name, email, mobile, product, module, description, 
      issueType, issueTypeOther, issueTitle, userId, utm_description 
    } = req.body;

    // Map attachments from various possible field names
    const rawAttachments = [
      ...(req.files?.attachments || []),
      ...(req.files?.['attachments[]'] || []),
      ...(req.files?.attachment || [])
    ];

    const ticketResult = await ticketService.createTicket({
      tenantId,
      name,
      email,
      mobile,
      product,
      module,
      description,
      issueType,
      issueTypeOther,
      issueTitle,
      userId: userId || req.user?.id || req.user?.userId,
      source: 'web',
      utm_description,
      attachments: rawAttachments.map(f => ({
        fileName: f.originalname,
        fileType: f.mimetype,
        fileSize: f.size,
        buffer: f.buffer
      }))
    }, req.user);

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: {
        id: ticketResult.ticketId,
        ticket_id: ticketResult.ticketId,
        userId: ticketResult.userId,
        status: 'new',
        issue_title: issueTitle,
        product,
        module,
        description,
        issue_type: issueType,
        created_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket',
      error: error.message
    });
  }
});


// GET /api/tickets/:id/activity - Get ticket activity history
router.get('/:id/activity', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const user = req.user;
    
    // Verify ticket exists and user has access
    const [tickets] = await pool.execute(
      'SELECT id, assigned_to, user_id, email FROM tickets WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = tickets[0];
    const role = String(user?.role || '').toLowerCase();
    const isManager = ['support_manager', 'manager', 'ceo', 'admin'].includes(role);
    const agentId = user?.id || user?.userId;
    const actorEmail = String(user?.email || '').trim().toLowerCase();
    const isCustomer = role === 'user' || role === 'customer';
    const isOwnerCustomer = isCustomer && (
      (ticket.user_id && Number(ticket.user_id) === Number(agentId)) ||
      (ticket.email && actorEmail && String(ticket.email).trim().toLowerCase() === actorEmail)
    );
    if (!isManager && (user?.role === 'support_agent' || user?.role === 'agent')) {
      if (resolveTicketOwnerId(ticket) != agentId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    if (!isManager && !['support_agent', 'agent'].includes(role) && !isOwnerCustomer) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const ticketActivityService = require('../services/ticketActivityService');
    const activity = await ticketActivityService.getActivity(id, tenantId);
    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Error fetching ticket activity:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity' });
  }
});

// PUT /api/tickets/:id/status - Update ticket status
router.put('/:id/status', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    await ensureTicketResolutionSchema();
    await ensureCustomerEscalationSchema();
    const { id } = req.params;
    const { status } = req.body;
    const tenantId = req.tenantId;
    
    // Support 'reopened' as alias for 'in_progress'
    let resolvedStatus = status;
    if (status === 'reopened') resolvedStatus = 'in_progress';
    const resolutionPayload = req.body?.resolution_details && typeof req.body.resolution_details === 'object'
      ? req.body.resolution_details
      : {
          resolution_summary: req.body?.resolution_summary,
          internal_steps: req.body?.internal_steps,
          root_cause: req.body?.root_cause,
          fix_type: req.body?.fix_type,
          reference_data: req.body?.reference_data
        };
    const normalizedResolutionInput = sanitizeResolutionInput(resolutionPayload);
    const includesResolutionPayload = Boolean(
      normalizedResolutionInput.resolution_summary ||
      normalizedResolutionInput.internal_steps ||
      normalizedResolutionInput.root_cause ||
      normalizedResolutionInput.fix_type ||
      normalizedResolutionInput.reference_data
    );
    
    if (!['new', 'in_progress', 'resolved', 'closed', 'escalated', 'reopened'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be new, in_progress, resolved, closed, reopened, or escalated'
      });
    }
    
    // Get ticket data (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT * FROM tickets WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    const ticketIsEscalated = await ticketsHasColumn('is_escalated')
      ? Number(ticket?.is_escalated || 0) === 1
      : false;

    // Reopen behavior: reopened tickets must start as fresh standalone tickets (detach any linking).
    // Apply for old tickets too (works regardless of when they were linked).
    const prevStatusLower = String(ticket.status || '').toLowerCase();
    const reopenIntent = status === 'reopened' || req.body?.reopen === true || req.body?.reopen === 'true';

    // Actor context (needed for transition validation/permissions below)
    const actorRoleGlobal = (req.user?.role || '').toLowerCase();
    const isManagerUser = ['support_manager', 'manager', 'ceo', 'admin'].includes(actorRoleGlobal);
    const isSupportAgentUser = actorRoleGlobal === 'support_agent' || actorRoleGlobal === 'agent';
    const actorAgentId = req.user?.id ?? req.user?.userId;
    const isCustomerActor = actorRoleGlobal === 'user' || actorRoleGlobal === 'customer';

    // Strict transition validation (forward-only workflow)
    const allowedTransitions = {
      open: ['in_progress'],
      new: ['in_progress'],
      in_progress: ['resolved', 'escalated'],
      resolved: [],
      // Escalated tickets should still be resolvable; manager/assignee can mark resolved directly.
      escalated: ['resolved', 'in_progress'],
      closed: []
    };
    const normalizedPrev = prevStatusLower === 'new' ? 'open' : prevStatusLower;
    const nextForCheck = String(resolvedStatus || '').toLowerCase();

    // If a manager reassigned an escalated ticket to an agent but status is still escalated,
    // allow the current owner agent to progress it like a normal in_progress ticket.
    const ticketAssignedTo = Number(ticket?.assigned_to || ticket?.current_owner_id || 0);
    const actorAgentIdNum = Number(actorAgentId || 0);
    const agentOwnsTicket = isSupportAgentUser && actorAgentIdNum > 0 && ticketAssignedTo > 0 && actorAgentIdNum === ticketAssignedTo;
    const normalizedPrevForTransition = normalizedPrev === 'escalated' && agentOwnsTicket ? 'in_progress' : normalizedPrev;
    if (!reopenIntent) {
      const allowedNext = allowedTransitions[normalizedPrevForTransition] || [];
      if (!allowedNext.includes(nextForCheck)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${prevStatusLower} to ${nextForCheck}.`
        });
      }
    }

    // SAFEGUARD: once escalated, do not allow downstream logic to force in_progress.
    // Managers can explicitly change status; customers cannot de-escalate by sending "in_progress".
    if (ticketIsEscalated && resolvedStatus === 'in_progress' && !reopenIntent) {
      if (String(req.user?.role || '').toLowerCase() === 'user' || String(req.user?.role || '').toLowerCase() === 'customer') {
        return res.status(409).json({
          success: false,
          message: 'This ticket is escalated and under manager review. Status cannot be set to in progress.'
        });
      }
    }
    // If we are re-opening a terminal ticket into in_progress, ALWAYS detach any previous linking,
    // so it restarts as a standalone ticket (even if frontend accidentally sends status=in_progress).
    if (
      reopenIntent &&
      (prevStatusLower === 'closed' || prevStatusLower === 'resolved') &&
      resolvedStatus === 'in_progress'
    ) {
      await detachLinkedWorkflowForReopen(Number(id), tenantId);
      // Refresh local ticket view after detaching (avoid false 409 blocks below).
      const [refetched] = await pool.execute(
        'SELECT * FROM tickets WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
      if (refetched.length > 0) {
        // eslint-disable-next-line no-unused-vars
        Object.assign(ticket, refetched[0]);
      }
    }
    let existingResolutionDetails =
      resolvedStatus === 'resolved' || includesResolutionPayload
        ? await getTicketResolutionDetails(Number(id), tenantId)
        : null;

    // Role validation: agents cannot close tickets and generally cannot act on escalated tickets.
    if (isSupportAgentUser) {
      if (nextForCheck === 'closed') {
        return res.status(403).json({ success: false, message: 'Only a manager can close this ticket.' });
      }
      if (normalizedPrev === 'escalated' && !agentOwnsTicket) {
        return res.status(403).json({ success: false, message: 'This ticket is escalated and under manager review.' });
      }
    }

    // Internal linked-ticket groups: only the primary ticket can be acted on.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, Number(id)]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          // Allow reopen-from-terminal even if linked; reopen detaches links above.
          if (primaryId && primaryId !== Number(id) && !(status === 'reopened' && (prevStatusLower === 'closed' || prevStatusLower === 'resolved'))) {
            return res.status(409).json({
              success: false,
              message: `This ticket is linked under primary ticket #${primaryId}. Update actions from the primary ticket.`,
              data: { primary_ticket_id: primaryId }
            });
          }
        }
      }
    } catch (_) {
      // ignore linked-group lookup failures
    }

    if (ticket.parent_ticket_id && !(status === 'reopened' && (prevStatusLower === 'closed' || prevStatusLower === 'resolved'))) {
      return res.status(409).json({
        success: false,
        message: `This ticket is linked to parent #${ticket.parent_ticket_id}. Update workflow actions on the parent ticket.`
      });
    }
    const [childCountRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM tickets
       WHERE tenant_id = ? AND parent_ticket_id = ?`,
      [tenantId, id]
    );
    const isCombinedParentTicket = Number(childCountRows[0]?.total || 0) > 0;

    const taskTableExistsEarly = await hasTicketTasksTable();
    let hasGroupedTasks = false;
    let myTaskRow = null;
    if (taskTableExistsEarly) {
      await ensureTicketTasksAssignmentStatusColumn();
      const [tc] = await pool.execute(
        `SELECT COUNT(*) AS c FROM ticket_tasks
         WHERE ticket_id = ? AND tenant_id = ? AND COALESCE(is_removed, 0) = 0`,
        [id, tenantId]
      );
      hasGroupedTasks = Number(tc[0]?.c || 0) > 0;
      if (hasGroupedTasks && isSupportAgentUser && actorAgentId) {
        const [tr] = await pool.execute(
          `SELECT id, status, assignment_status FROM ticket_tasks
           WHERE ticket_id = ? AND tenant_id = ? AND assigned_agent_id = ?
             AND COALESCE(is_removed, 0) = 0
           ORDER BY id ASC LIMIT 1`,
          [id, tenantId, actorAgentId]
        );
        myTaskRow = tr[0] || null;
      }
    }

    if (
      hasGroupedTasks &&
      isSupportAgentUser &&
      myTaskRow &&
      (resolvedStatus === 'in_progress' || resolvedStatus === 'escalated')
    ) {
      if (resolvedStatus === 'in_progress') {
        await pool.execute(
          `UPDATE ticket_tasks SET assignment_status = 'in_progress',
           status = CASE WHEN status IN ('pending','blocked') THEN 'in_progress' ELSE status END,
           updated_at = NOW()
           WHERE id = ? AND ticket_id = ? AND tenant_id = ?`,
          [myTaskRow.id, id, tenantId]
        );
        // Parent ticket moves to in_progress only after every task has left assignment_status "new".
        const [waitRows] = await pool.execute(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN assignment_status = 'new' THEN 1 ELSE 0 END) AS awaiting_new
           FROM ticket_tasks
           WHERE ticket_id = ? AND tenant_id = ? AND COALESCE(is_removed, 0) = 0`,
          [id, tenantId]
        );
        const awaiting = Number(waitRows[0]?.awaiting_new ?? 0);
        const totalTk = Number(waitRows[0]?.total ?? 0);
        if (totalTk > 0 && awaiting === 0) {
          await pool.execute(
            `UPDATE tickets SET status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END,
             updated_at = NOW()
             WHERE id = ? AND tenant_id = ? AND status NOT IN ('closed','resolved')`,
            [id, tenantId]
          );
          try {
            const hasFirst = await ticketsHasColumn('first_response_at');
            if (hasFirst) {
              await pool.execute(
                `UPDATE tickets SET first_response_at = COALESCE(first_response_at, NOW())
                 WHERE id = ? AND tenant_id = ? AND first_response_at IS NULL`,
                [id, tenantId]
              );
            }
          } catch (e) {
            console.warn('Grouped all-in-progress first_response_at:', e?.message);
          }
        }
      } else {
        await pool.execute(
          `UPDATE ticket_tasks SET assignment_status = 'escalated',
           status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'blocked' END,
           updated_at = NOW()
           WHERE id = ? AND ticket_id = ? AND tenant_id = ?`,
          [myTaskRow.id, id, tenantId]
        );
        await pool.execute(
          `UPDATE tickets SET status = CASE
             WHEN status IN ('new', 'in_progress') THEN 'escalated'
             ELSE status
           END, updated_at = NOW()
           WHERE id = ? AND tenant_id = ? AND status NOT IN ('closed', 'resolved')`,
          [id, tenantId]
        );
      }

      // Grouped-task fast-path used to return before centralized notifications.
      // Trigger status fanout only if parent ticket status actually changed.
      try {
        const [updatedRows] = await pool.execute(
          'SELECT id, tenant_id, user_id, name, email, mobile, issue_title, description, status FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1',
          [id, tenantId]
        );
        const updatedTicket = updatedRows[0];
        if (updatedTicket && updatedTicket.status !== ticket.status) {
          await ticketEventNotificationService.notifyStatusChanged({
            ticket: updatedTicket,
            tenantId,
            previousStatus: ticket.status,
            newStatus: updatedTicket.status,
            actorId: req.user?.id ?? req.user?.userId ?? null,
            actorName: req.user?.name || req.user?.email || null
          });
          await syncLinkedChildrenFromParent({
            parentTicket: {
              ...ticket,
              ...updatedTicket,
              current_level: normalizeSupportLevel(ticket.current_level, 'L1'),
              current_owner_id: resolveTicketOwnerId(ticket),
              assigned_to: resolveTicketOwnerId(ticket)
            },
            tenantId,
            actorId: req.user?.id ?? req.user?.userId ?? null,
            actorName: req.user?.name || req.user?.email || null,
            syncStatus: true,
            syncEta: false
          });
        }
      } catch (notifyErr) {
        console.warn('Grouped-task status notifications failed:', notifyErr?.message);
      }

      return res.json({
        success: true,
        message:
          resolvedStatus === 'in_progress'
            ? 'Your assignment is now in progress.'
            : 'Your assignment was escalated.',
        updated_scope: 'my_assignment'
      });
    }

    if (hasGroupedTasks && isSupportAgentUser && resolvedStatus === 'resolved') {
      return res.status(400).json({
        success: false,
        message: 'For grouped tickets, use “Complete my task” instead of resolving the whole ticket.'
      });
    }

    if (
      hasGroupedTasks &&
      isSupportAgentUser &&
      !myTaskRow &&
      ['in_progress', 'escalated', 'resolved'].includes(resolvedStatus)
    ) {
      return res.status(403).json({
        success: false,
        message: 'This is a grouped ticket and you have no task assignment on it.'
      });
    }

    // Closing rules:
    // Generic status route should not be used for closure.
    // Customer confirmation close must go via PUT /:ticketId/close.
    if (resolvedStatus === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Ticket closure requires customer confirmation. Use the customer close endpoint.'
      });
    }

    // If multi-task workflow exists for this ticket, resolved requires all tasks completed.
    if (resolvedStatus === 'resolved') {
      if (isCustomerActor) {
        return res.status(403).json({
          success: false,
          message: 'Only assigned agents or managers can resolve tickets.'
        });
      }
      let taskTableExists = false;
      try {
        const [taskTable] = await pool.execute(
          `SELECT 1
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_tasks'
           LIMIT 1`
        );
        taskTableExists = taskTable.length > 0;
      } catch (_) {
        taskTableExists = false;
      }

      if (taskTableExists) {
        const [taskStatsRows] = await pool.execute(
          `SELECT
             COUNT(*) AS total_tasks,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
           FROM ticket_tasks
           WHERE tenant_id = ? AND ticket_id = ? AND COALESCE(is_removed, 0) = 0`,
          [tenantId, ticket.id]
        );
        const taskStats = taskStatsRows[0] || { total_tasks: 0, completed_tasks: 0 };
        const hasTasks = Number(taskStats.total_tasks || 0) > 0;
        const allDone = Number(taskStats.total_tasks || 0) === Number(taskStats.completed_tasks || 0);
        const actorRole = (req.user?.role || '').toLowerCase();
        const actorIsManager = ['support_manager', 'manager', 'ceo', 'admin'].includes(actorRole);

        // Grouped-task tickets can only be resolved by manager after all tasks are completed.
        if (hasTasks && !actorIsManager) {
          return res.status(403).json({
            success: false,
            message: 'Only manager can resolve grouped tickets after task completion.'
          });
        }
        if (hasTasks && !allDone) {
          return res.status(400).json({
            success: false,
            message: `Cannot mark as resolved yet. ${taskStats.completed_tasks || 0}/${taskStats.total_tasks || 0} tasks are completed.`
          });
        }
      }
      // Enforce structured resolution for all staff resolves.
      if (!existingResolutionDetails && !includesResolutionPayload) {
        return res.status(400).json({
          success: false,
          message: 'Structured resolution details are required before marking this ticket as resolved.'
        });
      }
      if (includesResolutionPayload) {
        const resolutionValidationError = validateResolutionInput(normalizedResolutionInput);
        if (resolutionValidationError) {
          return res.status(400).json({ success: false, message: resolutionValidationError });
        }
      }
    }
    
    // Manager Override: support_agent can only update tickets assigned to them (or their grouped task)
    const isManager = isManagerUser;
    if (!isManager && isSupportAgentUser) {
      const agentId = req.user.id || req.user.userId;
      const allowedByGroupedTask = hasGroupedTasks && myTaskRow;
      const ticketOwnerId = resolveTicketOwnerId(ticket);
      if (ticketOwnerId != agentId && !allowedByGroupedTask) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only the assigned agent or a manager can update this ticket status.'
        });
      }
    }
    let savedResolutionDetails = existingResolutionDetails;
    if (resolvedStatus === 'resolved') {
      const agentId = req.user?.id || req.user?.userId;
      const actorCanCaptureResolution = ['support_agent', 'agent', 'admin'].includes(actorRoleGlobal) || isManagerUser;
      const canEditResolution =
        actorCanCaptureResolution &&
        (isManagerUser ||
          Number(resolveTicketOwnerId(ticket) || 0) === Number(agentId || 0) ||
          (hasGroupedTasks && !!myTaskRow));
      if (includesResolutionPayload && !canEditResolution) {
        return res.status(403).json({
          success: false,
          message: 'Only assigned agents can capture resolution details.'
        });
      }
      if (includesResolutionPayload) {
        savedResolutionDetails = await upsertTicketResolutionDetails({
          ticketId: Number(id),
          tenantId,
          actorId: agentId || null,
          resolution: normalizedResolutionInput
        });
        await ticketActivityService.logActivity({
          ticketId: Number(id),
          tenantId,
          action: ticketActivityService.ACTIONS.TICKET_LIFECYCLE_EVENT,
          performedBy: agentId || null,
          performedByName: req.user?.name || req.user?.email || 'Support',
          details: {
            eventType: 'RESOLUTION_CAPTURED',
            message: `Resolution added by ${req.user?.name || req.user?.email || 'Support'}.`,
            fix_type: savedResolutionDetails?.fix_type || normalizedResolutionInput.fix_type,
            has_root_cause: Boolean(savedResolutionDetails?.root_cause || normalizedResolutionInput.root_cause),
            has_reference: Boolean(savedResolutionDetails?.reference_data || normalizedResolutionInput.reference_data)
          }
        });
      }
      if (!savedResolutionDetails) {
        return res.status(400).json({
          success: false,
          message: 'Structured resolution details are required before marking this ticket as resolved.'
        });
      }
    }

    // Escalation for non-grouped tickets is handled by dedicated level endpoint.
    if (!hasGroupedTasks && resolvedStatus === 'escalated') {
      return res.status(400).json({
        success: false,
        message: 'Use POST /api/tickets/:id/escalate for level-based escalation.'
      });
    }

    // Managers cannot escalate grouped assignments via status shortcut.
    if (isManager && resolvedStatus === 'escalated') {
      return res.status(403).json({
        success: false,
        message: 'Managers cannot escalate tickets. Escalated tickets are routed to you for review.'
      });
    }
    
    // Prepare update query with timestamp tracking
    let updateQuery = 'UPDATE tickets SET status = ?';
    let queryParams = [resolvedStatus];

    // Optional: re-calculate business-impact priority when ticket is escalated or reopened.
    // Never override manager manual priority.
    const prioritySourceLower = String(ticket.priority_source || '').toLowerCase();
    const priorityIsAiManaged = prioritySourceLower === 'ai';
    if (priorityIsAiManaged && (resolvedStatus === 'escalated' || reopenIntent)) {
      try {
        const next = calculatePriority({
          ...ticket,
          priority: ticket.ai_predicted_priority || ticket.priority || 'medium',
          description: ticket.description || '',
          // Let priority service infer missing values from text.
          affected_users: ticket.affected_users || undefined,
          business_impact: ticket.business_impact || undefined
        });
        updateQuery += ', priority = ?';
        queryParams.push(next.priority);
        if (await ticketsHasColumn('priority_score')) {
          updateQuery += ', priority_score = ?';
          queryParams.push(next.score);
        }
        if (await ticketsHasColumn('priority_reason')) {
          updateQuery += ', priority_reason = ?';
          queryParams.push(next.reason);
        }
        if (await ticketsHasColumn('priority_source')) {
          updateQuery += ', priority_source = ?';
          queryParams.push('ai');
        }
      } catch (e) {
        // ignore priority recalculation failures
      }
    }
    
    // Record first response time when entering in_progress from non-terminal states (not reopen from closed/resolved)
    if (
      resolvedStatus === 'in_progress' &&
      ticket.status !== 'in_progress' &&
      !['closed', 'resolved'].includes(ticket.status) &&
      !ticket.first_response_at
    ) {
      const firstResponseAt = new Date();
      const hasFirstResponseAt = await ticketsHasColumn('first_response_at');
      if (hasFirstResponseAt) {
        updateQuery += ', first_response_at = ?';
        queryParams.push(firstResponseAt);
      }

      // Compute SLA met/breached: compare first_response_at to SLA deadline
      let slaMet = null;
      try {
        let responseMinutes = Number(ticket.sla_response_time_minutes || 480);
        const created = new Date(ticket.created_at);
        const slaDeadline = new Date(created.getTime() + responseMinutes * 60 * 1000);
        slaMet = firstResponseAt <= slaDeadline ? 1 : 0;
        const hasSlaFirstResponseMet = await ticketsHasColumn('sla_first_response_met');
        if (hasSlaFirstResponseMet) {
          updateQuery += ', sla_first_response_met = ?';
          queryParams.push(slaMet);
        }
        console.log(`📝 First response: ${firstResponseAt.toISOString()}, SLA ${slaMet ? 'MET' : 'BREACHED'} (deadline: ${slaDeadline.toISOString()})`);
        if (slaMet === 0) {
          try {
            const appNotificationService = require('../services/appNotificationService');
            await appNotificationService.notifySlaAlert(pool, {
              tenantId,
              ticketId: Number(id),
              assignedTo: ticket.assigned_to || null,
              userId: ticket.user_id || null,
              message: `First response SLA breached for Ticket #${id}`,
              issueTitle: ticket.issue_title || ''
            });
          } catch (slaN) {
            console.warn('⚠️ SLA in-app notification failed:', slaN?.message || slaN);
          }
        }
      } catch (e) {
        console.warn('Could not compute sla_first_response_met:', e?.message);
      }
      console.log(`📝 Recording first response time for ticket ${id}: ${firstResponseAt.toISOString()}`);
    }
    
    // Record support-side resolution time when status changes to 'resolved'
    if (resolvedStatus === 'resolved' && ticket.status !== 'resolved' && !ticket.resolved_at) {
      const hasResolvedAt = await ticketsHasColumn('resolved_at');
      if (hasResolvedAt) {
        updateQuery += ', resolved_at = ?';
        queryParams.push(new Date());
        console.log(`📝 Recording support resolution time for ticket ${id}: ${new Date().toISOString()}`);
      }
    }

    // Record final close time when ticket transitions to 'closed'
    if (resolvedStatus === 'closed' && ticket.status !== 'closed') {
      const hasClosedAt = await ticketsHasColumn('closed_at');
      if (hasClosedAt) {
        updateQuery += ', closed_at = ?';
        queryParams.push(new Date());
      }
    }

    // Reopen from closed/resolved: reopen should NOT reset SLA baseline.
    // Response time is computed once (created_at → first_response_at). Resolution SLA continues from created_at.
    if (resolvedStatus === 'in_progress' && ['closed', 'resolved'].includes(ticket.status)) {
      updateQuery += ', updated_at = NOW()';
      if (await ticketsHasColumn('closed_at')) updateQuery += ', closed_at = NULL';
      if (await ticketsHasColumn('resolved_at')) updateQuery += ', resolved_at = NULL';
      // reopen metadata (optional columns)
      try {
        await ensureTicketsReopenedAtColumn();
        await ensureTicketsReopenCountColumn();
      } catch (e) {
        // best-effort; do not fail status change if schema update is unavailable
      }
      if (await ticketsHasColumn('reopened_at')) updateQuery += ', reopened_at = NOW()';
      if (await ticketsHasColumn('reopen_count')) updateQuery += ', reopen_count = reopen_count + 1';
    }
    
    queryParams.push(id);
    updateQuery += ' WHERE id = ?';
    
    const [result] = await pool.execute(updateQuery, queryParams);

    if (
      result.affectedRows > 0 &&
      resolvedStatus === 'in_progress' &&
      ['closed', 'resolved'].includes(ticket.status)
    ) {
      await resetTicketTasksForReopen(Number(id), tenantId);
    }
    
    // Manager Override: Log activity when manager overrides status (not assigned to them)
    if (result.affectedRows > 0 && isManager && resolveTicketOwnerId(ticket) != (req.user?.id || req.user?.userId)) {
      try {
        const ticketActivityService = require('../services/ticketActivityService');
        await ticketActivityService.logActivity({
          ticketId: parseInt(id),
          tenantId,
          action: ticketActivityService.ACTIONS.STATUS_OVERRIDE,
          performedBy: req.user.id || req.user.userId,
          performedByName: req.user.name,
          details: { from: ticket.status, to: resolvedStatus }
        });
      } catch (e) {
        console.warn('Could not log manager override activity:', e?.message);
      }
    }
    
    // Calculate and update resolution_time when ticket is closed
    if ((resolvedStatus === 'closed' || resolvedStatus === 'resolved') && result.affectedRows > 0) {
      try {
        const hasResolutionTime = await ticketsHasColumn('resolution_time');
        if (hasResolutionTime) {
          await pool.execute(`
            UPDATE tickets 
            SET resolution_time = TIMESTAMPDIFF(MINUTE, created_at, NOW())
            WHERE id = ?
          `, [id]);
          console.log(`📊 Calculated resolution duration for ticket ${id}`);
        }
      } catch (error) {
        console.error(`❌ Error calculating resolution time for ticket ${id}:`, error);
      }
    }
    
    if (result.affectedRows > 0 && ticket.status !== resolvedStatus) {
      const ticketForNotify = {
        ...ticket,
        id: Number(id),
        status: resolvedStatus,
        tenant_id: tenantId,
        resolution_summary: savedResolutionDetails?.resolution_summary || existingResolutionDetails?.resolution_summary || null
      };
      const actorId = req.user?.id ?? req.user?.userId ?? null;
      const actorName = req.user?.name || req.user?.email || null;
      try {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: ticketForNotify,
          tenantId,
          previousStatus: ticket.status,
          newStatus: resolvedStatus,
          actorId,
          actorName
        });
      } catch (err) {
        console.warn('⚠️ Status change notifications failed:', err?.message);
      }
      try {
        await syncLinkedChildrenFromParent({
          parentTicket: {
            ...ticketForNotify,
            current_level: normalizeSupportLevel(ticket.current_level, 'L1'),
            current_owner_id: resolveTicketOwnerId(ticket),
            assigned_to: resolveTicketOwnerId(ticket),
            email: ticket.email || null
          },
          tenantId,
          actorId,
          actorName,
          syncStatus: true,
          syncEta: false
        });
      } catch (syncErr) {
        console.warn('⚠️ Linked-child status sync failed:', syncErr?.message || syncErr);
      }

      // Internal linked-ticket groups: keep statuses in sync with the "parent" (the ticket acted on).
      // This is separate from the Group Ticket feature and does not notify customers about linking itself.
      try {
        const hasLinkItems = await hasTicketLinkItemsTable();
        if (hasLinkItems) {
          const [g] = await pool.execute(
            `SELECT group_id
             FROM ticket_link_group_items
             WHERE tenant_id = ? AND ticket_id = ?
             LIMIT 1`,
            [tenantId, Number(id)]
          );
          const groupId = Number(g?.[0]?.group_id || 0);
          if (groupId) {
            const [items] = await pool.execute(
              `SELECT ticket_id
               FROM ticket_link_group_items
               WHERE tenant_id = ? AND group_id = ?`,
              [tenantId, groupId]
            );
            const linkedIds = (items || [])
              .map((r) => Number(r.ticket_id))
              .filter((v) => Number.isFinite(v) && v > 0 && v !== Number(id));
            if (linkedIds.length) {
              const placeholders = linkedIds.map(() => '?').join(', ');
              const [linkedTickets] = await pool.execute(
                `SELECT * FROM tickets WHERE tenant_id = ? AND id IN (${placeholders})`,
                [tenantId, ...linkedIds]
              );
              for (const lt of linkedTickets || []) {
                const prev = String(lt.status || '').toLowerCase() || 'new';
                if (prev === String(resolvedStatus || '').toLowerCase()) continue;
                // Don't reopen already-closed tickets when parent moves back to in_progress.
                if (prev === 'closed' && String(resolvedStatus).toLowerCase() !== 'closed') continue;
                await pool.execute(
                  `UPDATE tickets SET status = ?, updated_at = NOW()
                   WHERE tenant_id = ? AND id = ?`,
                  [resolvedStatus, tenantId, Number(lt.id)]
                );
                try {
                  await ticketEventNotificationService.notifyStatusChanged({
                    ticket: {
                      ...lt,
                      status: resolvedStatus,
                      tenant_id: tenantId,
                      resolution_summary: ticketForNotify.resolution_summary || null
                    },
                    tenantId,
                    previousStatus: prev,
                    newStatus: resolvedStatus,
                    actorId,
                    actorName
                  });
                } catch (e) {
                  // ignore per-ticket notify failure
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Linked-group status sync failed:', e?.message || e);
      }
    }

    if (resolvedStatus === 'closed') {
      await upsertKnowledgeEntryFromTicket({ ticketId: Number(id), tenantId });
    }
    
    console.log(`✅ Status updated for ticket ${id}: ${resolvedStatus}`);
    console.log(`📝 Timestamps: first_response_at=${queryParams.includes('first_response_at') ? 'SET' : 'NOT SET'}, resolved_at=${queryParams.includes('resolved_at') ? 'SET' : 'NOT SET'}`);

    cacheInvalidateTicketsLists();
    
    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      whatsappSent: !!ticket.mobile
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
});

// POST /api/tickets/:id/escalate - Level-based escalation with strict transition rules
router.post('/:id/escalate', authenticateToken, verifyTenantAccess, async (req, res) => {
  let connection = null;
  try {
    await ensureEscalationWorkflowSchema();
    const tenantId = req.tenantId || 1;
    const ticketId = Number(req.params.id);
    const targetLevel = normalizeSupportLevel(req.body?.target_level, '');
    const reason = String(req.body?.reason || '').trim();
    const notes = req.body?.notes != null ? String(req.body.notes).trim() : '';

    if (!ticketId) {
      return res.status(400).json({ success: false, message: 'Invalid ticket id' });
    }
    if (!targetLevel) {
      return res.status(400).json({ success: false, message: 'target_level is required (L2/L3/MANAGER).' });
    }
    if (!reason || reason.length < 3) {
      return res.status(400).json({ success: false, message: 'reason is required (min 3 characters).' });
    }

    const actorRole = String(req.user?.role || '').toLowerCase();
    const isManager = MANAGER_ROLES.includes(actorRole);
    const actorId = Number(req.user?.agentId || req.user?.id || req.user?.userId || 0) || null;
    // tickets.assigned_by FK references users(id); for staff tokens actorId is often agents.id.
    // Keep assigned_by nullable to avoid FK violations during escalation updates.
    const actorUserIdCandidate = Number(req.user?.id || req.user?.userId || 0) || null;

    connection = await pool.getConnection();
    await connection.beginTransaction();
    let escalationAssignedBy = null;
    if (actorUserIdCandidate) {
      try {
        const [userRows] = await connection.execute(
          'SELECT id FROM users WHERE id = ? LIMIT 1',
          [actorUserIdCandidate]
        );
        if (userRows.length > 0) escalationAssignedBy = actorUserIdCandidate;
      } catch (e) {
        console.warn('⚠️ Could not validate escalation assigned_by user:', e?.message || e);
      }
    }

    const [ticketRows] = await connection.execute(
      `SELECT id, tenant_id, status, current_level, current_owner_id, assigned_to, parent_ticket_id,
              issue_title, name, email, mobile, user_id
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1 FOR UPDATE`,
      [ticketId, tenantId]
    );
    if (!ticketRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = ticketRows[0];
    if (ticket.parent_ticket_id) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `This ticket is linked to parent #${ticket.parent_ticket_id}. Escalate from parent ticket only.`
      });
    }

    // Internal linked-ticket groups: only the primary ticket can be escalated.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await connection.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, ticketId]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await connection.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (primaryId && primaryId !== ticketId) {
            await connection.rollback();
            return res.status(409).json({
              success: false,
              message: `This ticket is linked under primary ticket #${primaryId}. Escalate from the primary ticket only.`,
              data: { primary_ticket_id: primaryId }
            });
          }
        }
      }
    } catch (_) {}
    const currentStatus = String(ticket.status || '').toLowerCase();
    if (['closed', 'resolved'].includes(currentStatus)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Resolved/closed tickets cannot be escalated.' });
    }

    const fromLevel = normalizeSupportLevel(ticket.current_level, 'L1');
    const fromOwnerId = resolveTicketOwnerId(ticket);
    const assignmentMode = req.body?.assignment_mode || 'auto';

    if (!isManager) {
      if (assignmentMode === 'to_manager' || !req.body?.assignment_mode) {
        if (!actorId || Number(fromOwnerId || 0) !== Number(actorId)) {
          await connection.rollback();
          return res.status(403).json({
            success: false,
            message: 'Only the current owner or a manager can escalate this ticket.'
          });
        }

        // APPROVAL WORKFLOW FOR INTERNAL AGENTS (ALWAYS GOES TO MANAGER REVIEW)
        const workDone = String(req.body?.work_done || '').trim();

        await connection.execute(
          `INSERT INTO ticket_escalation_requests
           (tenant_id, ticket_id, requested_by, current_level, requested_level, escalation_reason, work_done, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
          [tenantId, ticketId, actorId, fromLevel, 'MANAGER', reason, workDone]
        );
        await connection.commit();
        connection.release();
        connection = null;

        try {
          const [managers] = await pool.execute(`SELECT id FROM agents WHERE role IN ('support_manager', 'manager', 'admin', 'ceo') AND (tenant_id = ? OR tenant_id IS NULL) AND is_active = TRUE`, [tenantId]);
          for (const m of managers) {
            try {
              await pool.execute(
                `INSERT INTO app_notifications (tenant_id, user_id, title, message, type, reference_id, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())`,
                [tenantId, m.id, 'New Escalation Request', `Agent requested escalation for Ticket #${ticketId}.`, 'system', ticketId]
              );
            } catch (ne) { }
          }
        } catch (e) {
          console.warn('⚠️ Could not notify managers of escalation request:', e?.message || e);
        }

        return res.json({
          success: true,
          message: 'Escalation request submitted for manager approval.'
        });
      }
      
      // If assignmentMode is 'auto' or 'manual', we continue to direct escalation below
    }

    const allowedTargets = isManager ? SUPPORT_LEVELS.filter((lvl) => lvl !== fromLevel) : (LEVEL_TRANSITIONS[fromLevel] || []);
    if (!allowedTargets.includes(targetLevel)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid escalation path from ${fromLevel} to ${targetLevel}.`
      });
    }

    const selectLeastWorkloadAgentAtLevel = async (level) => {
      const [rows] = await connection.execute(
        `SELECT
           a.id, a.name, a.email, COALESCE(a.level, 'L1') AS level,
           COALESCE(w.active_tickets, 0) AS active_tickets
         FROM agents a
         LEFT JOIN (
           SELECT COALESCE(current_owner_id, assigned_to) AS owner_id, COUNT(*) AS active_tickets
           FROM tickets
           WHERE tenant_id = ?
             AND status IN ('new', 'in_progress', 'escalated')
             AND COALESCE(current_owner_id, assigned_to) IS NOT NULL
           GROUP BY COALESCE(current_owner_id, assigned_to)
         ) w ON w.owner_id = a.id
         WHERE a.is_active = TRUE
           AND COALESCE(a.availability_status, 'available') = 'available'
           AND (a.tenant_id = ? OR a.tenant_id IS NULL)
           AND (
             (? = 'MANAGER' AND LOWER(COALESCE(a.role, '')) IN ('support_manager', 'manager', 'ceo', 'admin'))
             OR
             (? <> 'MANAGER'
               AND LOWER(COALESCE(a.role, '')) IN ('support_agent', 'agent')
               AND COALESCE(a.level, 'L1') = ?)
           )
         ORDER BY active_tickets ASC, a.id ASC
         LIMIT 1`,
        [tenantId, tenantId, level, level, level]
      );
      return rows[0] || null;
    };

    const retainOwnerWhenAgentEscalatesToManager = !isManager && targetLevel === 'MANAGER';
    const managerKeepsTicket = isManager && targetLevel === 'MANAGER';
    let toLevel = targetLevel;
    let nextOwner = null;

    const manualAgentId = req.body?.assigned_agent_id ? Number(req.body.assigned_agent_id) : null;

    if (assignmentMode === 'manual' && manualAgentId) {
      const [manualRows] = await connection.execute(
        `SELECT id, name, email, COALESCE(level, 'L1') AS level
         FROM agents
         WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
         LIMIT 1`,
        [manualAgentId, tenantId]
      );
      nextOwner = manualRows[0] || null;
      if (nextOwner) {
        // If we have a manual owner, we trust the manager's selection and use that level.
        // However, we should still normalize the level if possible.
        toLevel = nextOwner.level || targetLevel;
      }
    }

    if (!nextOwner) {
      if (retainOwnerWhenAgentEscalatesToManager) {
        toLevel = 'MANAGER';
        if (fromOwnerId) {
          const [ownerRows] = await connection.execute(
            `SELECT id, name, email, COALESCE(level, 'L1') AS level
             FROM agents
             WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
             LIMIT 1`,
            [fromOwnerId, tenantId]
          );
          nextOwner = ownerRows[0] || null;
        }
      } else if (managerKeepsTicket) {
        // Manager who approved keeps the ticket (do not reassign to another manager)
        toLevel = 'MANAGER';
        if (actorId) {
          const [managerRows] = await connection.execute(
            `SELECT id, name, email, COALESCE(level, 'L1') AS level
             FROM agents
             WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
             LIMIT 1`,
            [actorId, tenantId]
          );
          nextOwner = managerRows[0] || null;
        }
      } else {
        nextOwner = await selectLeastWorkloadAgentAtLevel(toLevel);
        if (!nextOwner && toLevel !== 'MANAGER') {
          toLevel = 'MANAGER';
          nextOwner = await selectLeastWorkloadAgentAtLevel('MANAGER');
        }
        // Workflow rule: if an agent escalates to manager (directly or fallback), owner stays with that agent.
        if (!isManager && toLevel === 'MANAGER' && fromOwnerId) {
          const [ownerRows] = await connection.execute(
            `SELECT id, name, email, COALESCE(level, 'L1') AS level
             FROM agents
             WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
             LIMIT 1`,
            [fromOwnerId, tenantId]
          );
          nextOwner = ownerRows[0] || nextOwner;
        }
      }
    }
    // If no target owner is available, keep ownership with current owner so ticket remains visible.
    const toAgentId = nextOwner ? Number(nextOwner.id) : Number(fromOwnerId || 0) || null;

    // For manager escalations, status becomes 'escalated' to lock it for the agent.
    // For other agent level escalations, it becomes 'in_progress' so the new agent can work on it.
    const newStatus = toLevel === 'MANAGER' ? 'escalated' : 'in_progress';
    const updateParams = [toLevel, toAgentId, toAgentId, escalationAssignedBy, newStatus, ticketId, tenantId];
    try {
      await connection.execute(
        `UPDATE tickets
         SET current_level = ?, current_owner_id = ?, assigned_to = ?, assigned_by = ?, status = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        updateParams
      );
    } catch (updateErr) {
      // assigned_by is FK(users.id) in many deployments; staff escalation actor may not exist in users.
      if (updateErr?.code !== 'ER_NO_REFERENCED_ROW') throw updateErr;
      await connection.execute(
        `UPDATE tickets
         SET current_level = ?, current_owner_id = ?, assigned_to = ?, assigned_by = NULL, status = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [toLevel, toAgentId, toAgentId, newStatus, ticketId, tenantId]
      );
    }
    await connection.execute(
      `INSERT INTO ticket_escalation_history
       (tenant_id, ticket_id, from_level, to_level, from_agent_id, to_agent_id, escalation_reason, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [tenantId, ticketId, fromLevel, toLevel, fromOwnerId, toAgentId, reason, notes || null]
    );

    await connection.commit();
    connection.release();
    connection = null;

    // Send direct assignment email to the new agent receiving the escalated ticket
    if (nextOwner?.email && Number(fromOwnerId || 0) !== Number(nextOwner.id)) {
      try {
        await emailService.sendAgentAssignmentNotification(
          nextOwner.email,
          nextOwner.name,
          ticketId,
          ticket.name || 'Customer',
          ticket.issue_title || 'Support Request'
        );
      } catch (e) {
        console.warn('Escalation assignment email failed:', e?.message || e);
      }
    }

    if (newStatus !== currentStatus) {
      try {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: { ...ticket, id: ticketId, status: newStatus, tenant_id: tenantId },
          tenantId,
          previousStatus: currentStatus,
          newStatus,
          actorId,
          actorName: req.user?.name || req.user?.email || null
        });
      } catch (e) {
        console.warn('Escalation status notifications failed:', e?.message || e);
      }
    }

    try {
      await ticketActivityService.logActivity({
        ticketId,
        tenantId,
        action: ticketActivityService.ACTIONS.TICKET_LIFECYCLE_EVENT,
        performedBy: actorId,
        performedByName: req.user?.name || req.user?.email || 'System',
        details: {
          eventType: 'LEVEL_ESCALATED',
          from_level: fromLevel,
          to_level: toLevel,
          from_agent_id: fromOwnerId,
          to_agent_id: toAgentId,
          escalation_reason: reason,
          notes: notes || null,
          assignment_mode: assignmentMode,
          manual_agent_id: assignmentMode === 'manual' ? manualAgentId : null
        }
      });
    } catch (e) {
      console.warn('Escalation activity log failed:', e?.message || e);
    }

    try {
      await syncLinkedChildrenFromParent({
        parentTicket: {
          ...ticket,
          id: ticketId,
          status: newStatus,
          current_level: toLevel,
          current_owner_id: toAgentId,
          assigned_to: toAgentId
        },
        tenantId,
        actorId,
        actorName: req.user?.name || req.user?.email || null,
        syncStatus: true,
        syncEta: false
      });
    } catch (syncErr) {
      console.warn('⚠️ Linked-child escalation sync failed:', syncErr?.message || syncErr);
    }

    // Fan-out escalation outcome to internal linked-ticket group members (if any).
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, ticketId]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [items] = await pool.execute(
            `SELECT ticket_id
             FROM ticket_link_group_items
             WHERE tenant_id = ? AND group_id = ?`,
            [tenantId, groupId]
          );
          const linkedIds = (items || [])
            .map((r) => Number(r.ticket_id))
            .filter((v) => Number.isFinite(v) && v > 0 && v !== ticketId);
          if (linkedIds.length) {
            const placeholders = linkedIds.map(() => '?').join(', ');
            const [linkedTickets] = await pool.execute(
              `SELECT * FROM tickets WHERE tenant_id = ? AND id IN (${placeholders})`,
              [tenantId, ...linkedIds]
            );
            for (const lt of linkedTickets || []) {
              const prev = String(lt.status || '').toLowerCase() || 'new';
              await pool.execute(
                `UPDATE tickets
                 SET status = ?, current_level = ?, current_owner_id = ?, assigned_to = ?, updated_at = NOW()
                 WHERE tenant_id = ? AND id = ?`,
                [newStatus, toLevel, toAgentId || null, toAgentId || null, tenantId, Number(lt.id)]
              );
              if (prev !== String(newStatus || '').toLowerCase()) {
                try {
                  await ticketEventNotificationService.notifyStatusChanged({
                    ticket: { ...lt, status: newStatus, tenant_id: tenantId },
                    tenantId,
                    previousStatus: prev,
                    newStatus,
                    actorId,
                    actorName: req.user?.name || req.user?.email || null
                  });
                } catch (_) {}
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Linked-group escalation sync failed:', e?.message || e);
    }

    return res.json({
      success: true,
      message: toAgentId
        ? `Ticket escalated from ${fromLevel} to ${toLevel} and assigned to ${nextOwner?.name || `Agent #${toAgentId}`}.`
        : `Ticket escalated from ${fromLevel} to ${toLevel}, but no active owner is currently available.`,
      data: {
        ticket_id: ticketId,
        from_level: fromLevel,
        to_level: toLevel,
        from_agent_id: fromOwnerId,
        to_agent_id: toAgentId
      }
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {
        // no-op
      }
      connection.release();
    }
    console.error('Error escalating ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to escalate ticket' });
  }
});



// PUT /api/tickets/:id/eta - Update expected resolution ETA
router.put('/:id/eta', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureEscalationWorkflowSchema();
    await ensureTicketEtaColumns();
    const { id } = req.params;
    const tenantId = req.tenantId || 1;
    const role = String(req.user?.role || '').toLowerCase();
    const actorId = req.user?.id || req.user?.userId || null;
    const actorName = req.user?.name || req.user?.email || null;
    const etaDueAtRaw = String(req.body?.etaDueAt || '').trim();
    const etaReason = String(req.body?.reason || '').trim();

    if (!etaDueAtRaw) {
      return res.status(400).json({ success: false, message: 'etaDueAt is required' });
    }
    const etaDate = new Date(etaDueAtRaw);
    if (!Number.isFinite(etaDate.getTime())) {
      return res.status(400).json({ success: false, message: 'etaDueAt must be a valid date/time' });
    }
    if (!etaReason || etaReason.length < 3) {
      return res.status(400).json({ success: false, message: 'reason is required (min 3 characters)' });
    }

    const isStaffActor = !['user', 'customer'].includes(role);
    if (!isStaffActor) {
      return res.status(403).json({ success: false, message: 'Only the current ticket owner can update ETA.' });
    }

    const [tickets] = await pool.execute(
      `SELECT id, tenant_id, status, parent_ticket_id, assigned_to, current_owner_id, current_level, issue_title, email, name, mobile, user_id, eta_due_at
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId]
    );
    if (!tickets.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = tickets[0];
    if (ticket.parent_ticket_id) {
      return res.status(409).json({
        success: false,
        message: `This ticket is linked to parent #${ticket.parent_ticket_id}. Update ETA on the parent ticket.`
      });
    }

    // Internal linked-ticket groups: only the primary ticket can update ETA.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, Number(id)]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (primaryId && primaryId !== Number(id)) {
            return res.status(409).json({
              success: false,
              message: `This ticket is linked under primary ticket #${primaryId}. Update ETA from the primary ticket only.`,
              data: { primary_ticket_id: primaryId }
            });
          }
        }
      }
    } catch (_) {}
    if (['closed', 'resolved'].includes(String(ticket.status || '').toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Cannot update ETA for resolved/closed tickets.' });
    }

    const agentId = Number(actorId || 0);
    let isAllowed = Number(resolveTicketOwnerId(ticket) || 0) === agentId;
    if (!isAllowed && (await hasTicketTasksTable())) {
      try {
        const [rows] = await pool.execute(
          `SELECT id
           FROM ticket_tasks
           WHERE ticket_id = ? AND assigned_agent_id = ? AND (tenant_id = ? OR tenant_id IS NULL)
             AND COALESCE(is_removed, 0) = 0
           LIMIT 1`,
          [id, agentId, tenantId]
        );
        isAllowed = rows.length > 0;
        if (!isAllowed) {
          const [fallbackRows] = await pool.execute(
            `SELECT id
             FROM ticket_tasks
             WHERE ticket_id = ? AND assigned_agent_id = ?
               AND COALESCE(is_removed, 0) = 0
             LIMIT 1`,
            [id, agentId]
          );
          isAllowed = fallbackRows.length > 0;
        }
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('ETA update grouped-task access check failed:', error?.message || error);
        }
      }
    }
    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only the current ticket owner can update ETA.'
      });
    }

    const [updateResult] = await pool.execute(
      `UPDATE tickets
       SET eta_due_at = ?, eta_reason = ?, eta_updated_by = ?, eta_updated_at = NOW(), updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [etaDate, etaReason, actorId, id, tenantId]
    );
    if (!updateResult?.affectedRows) {
      return res.status(500).json({ success: false, message: 'Failed to update ETA' });
    }

    const priorEta = ticket.eta_due_at || null;
    try {
      await ticketEventNotificationService.notifyEtaUpdated({
        ticket: {
          ...ticket,
          id: Number(id),
          tenant_id: tenantId,
          eta_due_at: etaDate,
          eta_reason: etaReason
        },
        tenantId,
        previousEta: priorEta,
        newEta: etaDate,
        reason: etaReason,
        actorId,
        actorName
      });
    } catch (error) {
      console.warn('⚠️ ETA update notifications failed:', error?.message);
    }

    try {
      await syncLinkedChildrenFromParent({
        parentTicket: {
          ...ticket,
          id: Number(id),
          status: String(ticket.status || 'new').toLowerCase(),
          current_level: normalizeSupportLevel(ticket.current_level, 'L1'),
          current_owner_id: resolveTicketOwnerId(ticket),
          assigned_to: resolveTicketOwnerId(ticket),
          eta_due_at: etaDate,
          eta_reason: etaReason
        },
        tenantId,
        actorId,
        actorName,
        syncStatus: false,
        syncEta: true
      });
    } catch (syncErr) {
      console.warn('⚠️ Linked-child ETA sync failed:', syncErr?.message || syncErr);
    }

    // Fan-out ETA to internal linked-ticket group members (if any).
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, Number(id)]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [items] = await pool.execute(
            `SELECT ticket_id
             FROM ticket_link_group_items
             WHERE tenant_id = ? AND group_id = ?`,
            [tenantId, groupId]
          );
          const linkedIds = (items || [])
            .map((r) => Number(r.ticket_id))
            .filter((v) => Number.isFinite(v) && v > 0 && v !== Number(id));
          if (linkedIds.length) {
            const placeholders = linkedIds.map(() => '?').join(', ');
            const [linkedTickets] = await pool.execute(
              `SELECT id, tenant_id, eta_due_at, eta_reason, issue_title, name, email, mobile, user_id
               FROM tickets
               WHERE tenant_id = ? AND id IN (${placeholders})`,
              [tenantId, ...linkedIds]
            );
            for (const lt of linkedTickets || []) {
              const prev = lt.eta_due_at || null;
              await pool.execute(
                `UPDATE tickets
                 SET eta_due_at = ?, eta_reason = ?, eta_updated_by = ?, eta_updated_at = NOW(), updated_at = NOW()
                 WHERE id = ? AND tenant_id = ?`,
                [etaDate, etaReason, actorId, Number(lt.id), tenantId]
              );
              try {
                await ticketEventNotificationService.notifyEtaUpdated({
                  ticket: {
                    ...lt,
                    id: Number(lt.id),
                    tenant_id: tenantId,
                    eta_due_at: etaDate,
                    eta_reason: etaReason
                  },
                  tenantId,
                  previousEta: prev,
                  newEta: etaDate,
                  reason: etaReason,
                  actorId,
                  actorName
                });
              } catch (_) {}
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Linked-group ETA sync failed:', e?.message || e);
    }

    return res.json({
      success: true,
      message: 'ETA updated successfully',
      data: {
        ticketId: Number(id),
        eta_due_at: etaDate,
        eta_reason: etaReason
      }
    });
  } catch (error) {
    console.error('Error updating ticket ETA:', error);
    return res.status(500).json({ success: false, message: 'Failed to update ticket ETA' });
  }
});

// PUT /api/tickets/:id/priority - Manager override ticket priority
router.put('/:id/priority', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureTicketPriorityAiColumns();
    const tenantId = req.tenantId || 1;
    const { id } = req.params;
    const role = String(req.user?.role || '').toLowerCase();
    const isManager = ['support_manager', 'manager', 'ceo'].includes(role);
    if (!isManager) {
      return res.status(403).json({ success: false, message: 'Only managers can override ticket priority.' });
    }

    const requested = String(req.body?.priority || '').toLowerCase();
    const overrideReason = (req.body?.overrideReason || '').toString().trim();
    if (!AI_PRIORITY_VALUES.includes(requested)) {
      return res.status(400).json({ success: false, message: 'Invalid priority value.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, priority, issue_title, assigned_to FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1',
      [id, tenantId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Internal linked-ticket groups: only the primary ticket can be updated.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, Number(id)]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (primaryId && primaryId !== Number(id)) {
            return res.status(409).json({
              success: false,
              message: `This ticket is linked under primary ticket #${primaryId}. Update priority from the primary ticket only.`,
              data: { primary_ticket_id: primaryId }
            });
          }
        }
      }
    } catch (_) {}

    const sets = ['priority = ?'];
    const params = [requested];
    if (await ticketsHasColumn('priority_overridden_by_manager')) {
      sets.push('priority_overridden_by_manager = ?');
      params.push(req.user?.id || null);
    }
    if (await ticketsHasColumn('priority_overridden_at')) {
      sets.push('priority_overridden_at = NOW()');
    }
    if (await ticketsHasColumn('priority_override_reason')) {
      sets.push('priority_override_reason = ?');
      params.push(overrideReason || null);
    }
    if (await ticketsHasColumn('priority_source')) {
      sets.push('priority_source = ?');
      params.push('manual');
    }
    if (await ticketsHasColumn('priority_reason')) {
      // Once a manager overrides priority, stop showing AI-generated reason.
      sets.push('priority_reason = ?');
      params.push('Priority set manually by manager.');
    }
    sets.push('updated_at = NOW()');
    params.push(id, tenantId);

    await pool.execute(
      `UPDATE tickets SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params
    );

    const oldPriority = String(rows[0].priority || 'medium').toLowerCase();
    if (oldPriority !== requested) {
      try {
        await ticketEventNotificationService.notifyPriorityOverrideInternal({
          ticketId: Number(id),
          tenantId,
          issueTitle: rows[0].issue_title,
          oldPriority,
          newPriority: requested,
          overrideReason,
          performedBy: req.user?.id ?? req.user?.userId ?? null,
          performedByName: req.user?.name ?? 'Manager',
          assignedAgentId: rows[0].assigned_to
        });
      } catch (err) {
        console.warn('Priority override notifications failed:', err?.message);
      }
    }

    return res.json({
      success: true,
      message: 'Ticket priority overridden successfully.',
      data: { ticketId: Number(id), priority: requested }
    });
  } catch (error) {
    console.error('Error overriding ticket priority:', error);
    return res.status(500).json({ success: false, message: 'Failed to override ticket priority' });
  }
});

// PUT /api/tickets/:id - Update a ticket
router.put('/:id', async (req, res) => {
  try {
    await ensureSlaResolutionSchema();
    const { id } = req.params;
    const { name, email, mobile, product, description, issue_type, issue_type_other, issue_title, status } = req.body;
    
    // Check if ticket exists
    const [tickets] = await pool.execute(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    
    // Find product_id if product name is provided
    let productId = ticket.product_id; // Keep existing product_id if no new product
    if (product && product !== ticket.product) {
      const [products] = await pool.execute(
        'SELECT id FROM products WHERE name = ? AND status = \'active\'',
        [product]
      );
      if (products.length > 0) {
        productId = products[0].id;
      }
    }
    
    // Enforce two-step closure: direct "closed" via generic update route is not allowed.
    if (status === 'closed') {
      return res.status(403).json({
        success: false,
        message: 'Direct close is disabled. Close only after user confirmation.'
      });
    }

    const allowedStatuses = ['new', 'in_progress', 'resolved', 'escalated'];
    const nextStatus = status && allowedStatuses.includes(status) ? status : (ticket.status || 'new');

    // Priority is AI-driven at ticket creation and manager override via /:id/priority.
    // Generic update keeps priority unchanged.
    const newPriority = ticket.priority || 'medium';
    let resolvedAtValue = ticket.resolved_at || null;
    if (nextStatus === 'resolved' && ticket.status !== 'resolved') {
      resolvedAtValue = new Date();
    }
    const nextIssueType = issue_type || ticket.issue_type;
    const nextIssueTypeId = normalizeIssueTypeId(nextIssueType);
    const [result] = await pool.execute(
      `UPDATE tickets SET 
        name = ?, email = ?, mobile = ?, product = ?, product_id = ?, 
        description = ?, issue_type = ?, issue_type_id = ?, issue_type_other = ?, issue_title = ?, 
        status = ?, priority = ?, resolved_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name || ticket.name,
        email || ticket.email,
        mobile || ticket.mobile,
        product || ticket.product,
        productId,
        description || ticket.description,
        nextIssueType,
        nextIssueTypeId,
        issue_type_other || ticket.issue_type_other,
        issue_title || ticket.issue_title,
        nextStatus,
        newPriority,
        resolvedAtValue,
        id
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Priority-change activity/notifications are handled by /:id/priority manager override route.

    const slaAffectingChanged =
      (product && product !== ticket.product) ||
      (issue_type && issue_type !== ticket.issue_type);
    if (slaAffectingChanged) {
      const tenantId = ticket.tenant_id || req.tenantId || 1;
      try {
        await applyResolvedSlaToTicket({ ticketId: Number(id), tenantId });
      } catch (err) {
        console.warn('SLA recalculation failed:', err?.message);
      }
    }

    // Some UIs still update status through generic PUT /:id.
    // Route all status-change fanout through the centralized notifier.
    if (result.affectedRows > 0 && ticket.status !== nextStatus) {
      const tenantId = ticket.tenant_id || req.tenantId || 1;
      try {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: {
            ...ticket,
            id: Number(id),
            tenant_id: tenantId,
            status: nextStatus,
            issue_title: issue_title || ticket.issue_title
          },
          tenantId,
          previousStatus: ticket.status,
          newStatus: nextStatus,
          actorId: req.user?.id ?? req.user?.userId ?? null,
          actorName: req.user?.name || req.user?.email || null
        });
      } catch (err) {
        console.warn('⚠️ Generic update status notifications failed:', err?.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Ticket updated successfully'
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket'
    });
  }
});

// GET /api/tickets/:id/attachment - Get ticket attachment
router.get('/:id/attachment', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    let tenantId = req.tenantId || 1;
    console.log(`[Attachment] Request for ticket ID: ${id}`);
    const [tickets] = await pool.execute(
      `SELECT id, tenant_id, user_id, email, attachment_name, attachment_type, attachment
       FROM tickets
       WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    let ticket = tickets[0] || null;

    // Customer fallback: allow owner access even when ticket tenant mismatch exists.
    if (!ticket && ['user', 'customer'].includes(String(req.user?.role || '').toLowerCase())) {
      const [fallbackRows] = await pool.execute(
        `SELECT id, tenant_id, user_id, email, attachment_name, attachment_type, attachment
         FROM tickets
         WHERE id = ?`,
        [id]
      );
      if (fallbackRows.length > 0) {
        const t = fallbackRows[0];
        const isOwner = (t.user_id && Number(t.user_id) === Number(req.user?.id)) ||
          (t.email && t.email.toLowerCase() === String(req.user?.email || '').toLowerCase());
        if (!isOwner) {
          return res.status(404).json({ success: false, message: 'Attachment not found' });
        }
        ticket = t;
        tenantId = t.tenant_id || tenantId;
      }
    }

    if (!ticket) {
      console.log(`[Attachment] Ticket not found for ID: ${id}, tenant: ${tenantId}`);
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    // Prefer legacy tickets.attachment blob when present; otherwise fall back to ticket_attachments.
    if (!ticket.attachment) {
      try {
        await ensureTicketAttachmentsTable();
        const [rows] = await pool.execute(
          `SELECT file_name, file_type, attachment
           FROM ticket_attachments
           WHERE ticket_id = ? AND tenant_id = ?
           ORDER BY id ASC
           LIMIT 1`,
          [id, tenantId]
        );
        if (rows.length > 0 && rows[0].attachment && Buffer.isBuffer(rows[0].attachment)) {
          res.setHeader('Content-Type', rows[0].file_type || 'application/octet-stream');
          res.setHeader(
            'Content-Disposition',
            `inline; filename=\"${String(rows[0].file_name || 'attachment').replace(/"/g, '')}\"`
          );
          return res.send(rows[0].attachment);
        }
      } catch (e) {
        // fall through to 404 below
      }
      console.log(`[Attachment] No attachment for ticket ID: ${id}`);
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    // Ensure attachment is a Buffer
    if (!(ticket.attachment instanceof Buffer)) {
      console.log(`[Attachment] Attachment is not a Buffer for ticket ID: ${id}`);
      return res.status(500).json({
        success: false,
        message: 'Attachment is not a valid file'
      });
    }
    res.setHeader('Content-Type', ticket.attachment_type);
    res.setHeader('Content-Disposition', `inline; filename=\"${ticket.attachment_name}\"`);
    res.send(ticket.attachment);
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attachment'
    });
  }
});

// GET /api/tickets/:id/attachments - List all ticket attachments (multi-file)
router.get('/:id/attachments', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureTicketAttachmentsTable();
    const { id } = req.params;
    const tenantId = req.tenantId || 1;
    const [rows] = await pool.execute(
      `SELECT id, file_name, file_type, file_size, created_at
       FROM ticket_attachments
       WHERE ticket_id = ? AND tenant_id = ?
       ORDER BY id ASC`,
      [id, tenantId]
    );
    return res.json({ success: true, data: rows || [] });
  } catch (e) {
    console.error('Error listing ticket attachments:', e);
    return res.status(500).json({ success: false, message: 'Failed to list attachments' });
  }
});

// GET /api/tickets/:id/attachments/:attachmentId - Download/open a specific attachment
router.get('/:id/attachments/:attachmentId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureTicketAttachmentsTable();
    const { id, attachmentId } = req.params;
    const tenantId = req.tenantId || 1;
    const [rows] = await pool.execute(
      `SELECT id, file_name, file_type, attachment
       FROM ticket_attachments
       WHERE id = ? AND ticket_id = ? AND tenant_id = ?
       LIMIT 1`,
      [attachmentId, id, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    const a = rows[0];
    if (!a.attachment || !Buffer.isBuffer(a.attachment)) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    res.setHeader('Content-Type', a.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename=\"${String(a.file_name || 'attachment').replace(/"/g, '')}\"`);
    return res.send(a.attachment);
  } catch (e) {
    console.error('Error fetching ticket attachment:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch attachment' });
  }
});

// GET /api/tickets/:id/attachment/text-preview - Extract previewable text (DOCX/TXT/PDF/Image OCR)
router.get('/:id/attachment/text-preview', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    let tenantId = req.tenantId || 1;
    const [tickets] = await pool.execute(
      `SELECT id, tenant_id, user_id, email, attachment_name, attachment_type, attachment
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId]
    );

    let ticket = tickets[0] || null;
    if (!ticket && ['user', 'customer'].includes(String(req.user?.role || '').toLowerCase())) {
      const [fallbackRows] = await pool.execute(
        `SELECT id, tenant_id, user_id, email, attachment_name, attachment_type, attachment
         FROM tickets
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      if (fallbackRows.length > 0) {
        const t = fallbackRows[0];
        const isOwner = (t.user_id && Number(t.user_id) === Number(req.user?.id)) ||
          (t.email && t.email.toLowerCase() === String(req.user?.email || '').toLowerCase());
        if (!isOwner) {
          return res.status(404).json({ success: false, message: 'Attachment not found' });
        }
        ticket = t;
        tenantId = t.tenant_id || tenantId;
      }
    }

    if (!ticket || !ticket.attachment || !Buffer.isBuffer(ticket.attachment)) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const extraction = await extractAttachmentText({
      fileBuffer: ticket.attachment,
      mimeType: ticket.attachment_type,
      fileName: ticket.attachment_name
    });

    if (!extraction.ok) {
      return res.status(422).json({
        success: false,
        message: extraction.message || 'No readable text found for preview.'
      });
    }

    return res.json({
      success: true,
      data: {
        text: String(extraction.text || '').slice(0, 30000),
        attachmentType: ticket.attachment_type || null,
        attachmentName: ticket.attachment_name || null,
        tenantId
      }
    });
  } catch (error) {
    console.error('Error generating attachment text preview:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate text preview' });
  }
});

// GET /api/tickets/:id/attachment/analysis - Fetch saved analysis for current attachment (internal roles only)
router.get('/:id/attachment/analysis', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    if (!isInternalRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Attachment analysis is available only for internal roles.' });
    }

    try {
      await ensureAttachmentAnalysisTable();
    } catch (_) {
      return res.status(500).json({ success: false, message: 'Attachment analysis storage is unavailable.' });
    }
    const { id } = req.params;
    const tenantId = req.tenantId || 1;

    const [tickets] = await pool.execute(
      `SELECT id, tenant_id, attachment_name, attachment_type, attachment
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = tickets[0];
    if (!ticket.attachment || !Buffer.isBuffer(ticket.attachment)) {
      return res.json({ success: true, data: null });
    }

    const attachmentSignature = getAttachmentSignature({
      attachmentName: ticket.attachment_name,
      attachmentType: ticket.attachment_type,
      attachmentBuffer: ticket.attachment
    });

    const [rows] = await pool.execute(
      `SELECT summary, key_points_json, document_type, recommended_focus, analyzed_at
       FROM ticket_attachment_analyses
       WHERE tenant_id = ? AND ticket_id = ? AND attachment_signature = ? AND analysis_status = 'completed'
       ORDER BY analyzed_at DESC
       LIMIT 1`,
      [tenantId, id, attachmentSignature]
    );

    if (rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    const row = rows[0];
    const keyPoints = Array.isArray(row.key_points_json)
      ? row.key_points_json
      : (() => {
          try {
            return JSON.parse(row.key_points_json || '[]');
          } catch (_) {
            return [];
          }
        })();

    return res.json({
      success: true,
      data: {
        summary: row.summary,
        key_points: keyPoints,
        document_type: row.document_type,
        recommended_focus: row.recommended_focus,
        analyzed_at: row.analyzed_at
      }
    });
  } catch (error) {
    console.error('Error fetching attachment analysis:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attachment analysis' });
  }
});

// GET /api/tickets/:id/attachments/:attachmentId/analysis - Fetch saved analysis for a specific multi-file attachment (internal roles only)
router.get('/:id/attachments/:attachmentId/analysis', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    if (!isInternalRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Attachment analysis is available only for internal roles.' });
    }

    try {
      await ensureAttachmentAnalysisTable();
    } catch (_) {
      return res.status(500).json({ success: false, message: 'Attachment analysis storage is unavailable.' });
    }

    await ensureTicketAttachmentsTable();
    const { id, attachmentId } = req.params;
    const tenantId = req.tenantId || 1;

    const [rows] = await pool.execute(
      `SELECT id, file_name, file_type, attachment
       FROM ticket_attachments
       WHERE id = ? AND ticket_id = ? AND tenant_id = ?
       LIMIT 1`,
      [attachmentId, id, tenantId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    const a = rows[0];
    if (!a.attachment || !Buffer.isBuffer(a.attachment)) {
      return res.json({ success: true, data: null });
    }

    const attachmentSignature = getAttachmentSignature({
      attachmentName: a.file_name,
      attachmentType: a.file_type,
      attachmentBuffer: a.attachment
    });

    const [analysisRows] = await pool.execute(
      `SELECT summary, key_points_json, document_type, recommended_focus, analyzed_at
       FROM ticket_attachment_analyses
       WHERE tenant_id = ? AND ticket_id = ? AND attachment_signature = ? AND analysis_status = 'completed'
       ORDER BY analyzed_at DESC
       LIMIT 1`,
      [tenantId, id, attachmentSignature]
    );

    if (analysisRows.length === 0) {
      return res.json({ success: true, data: null });
    }

    const row = analysisRows[0];
    const keyPoints = Array.isArray(row.key_points_json)
      ? row.key_points_json
      : (() => {
          try {
            return JSON.parse(row.key_points_json || '[]');
          } catch (_) {
            return [];
          }
        })();

    return res.json({
      success: true,
      data: {
        summary: row.summary,
        key_points: keyPoints,
        document_type: row.document_type,
        recommended_focus: row.recommended_focus,
        analyzed_at: row.analyzed_at
      }
    });
  } catch (error) {
    console.error('Error fetching attachment analysis:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attachment analysis' });
  }
});

// POST /api/tickets/:id/attachment/analyze - Analyze current ticket attachment with AI (internal roles only)
router.post('/:id/attachment/analyze', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    if (!isInternalRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Attachment analysis is available only for internal roles.' });
    }

    try {
      await ensureAttachmentAnalysisTable();
    } catch (_) {
      return res.status(500).json({ success: false, message: 'Attachment analysis storage is unavailable.' });
    }
    const { id } = req.params;
    const tenantId = req.tenantId || 1;
    const force = Boolean(req.body?.force);

    const [tickets] = await pool.execute(
      `SELECT id, tenant_id, issue_title, description, product, module, priority, status, attachment_name, attachment_type, attachment
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = tickets[0];
    if (!ticket.attachment || !Buffer.isBuffer(ticket.attachment)) {
      return res.status(400).json({ success: false, message: 'No attachment found on this ticket.' });
    }

    const attachmentSignature = getAttachmentSignature({
      attachmentName: ticket.attachment_name,
      attachmentType: ticket.attachment_type,
      attachmentBuffer: ticket.attachment
    });

    if (!force) {
      const [existing] = await pool.execute(
        `SELECT summary, key_points_json, document_type, recommended_focus, analyzed_at
         FROM ticket_attachment_analyses
         WHERE tenant_id = ? AND ticket_id = ? AND attachment_signature = ? AND analysis_status = 'completed'
         ORDER BY analyzed_at DESC
         LIMIT 1`,
        [tenantId, id, attachmentSignature]
      );
      if (existing.length > 0) {
        const row = existing[0];
        let keyPoints = [];
        try {
          keyPoints = Array.isArray(row.key_points_json) ? row.key_points_json : JSON.parse(row.key_points_json || '[]');
        } catch (_) {
          keyPoints = [];
        }
        return res.json({
          success: true,
          data: {
            summary: row.summary,
            key_points: keyPoints,
            document_type: row.document_type,
            recommended_focus: row.recommended_focus,
            analyzed_at: row.analyzed_at,
            cached: true
          }
        });
      }
    }

    const extraction = await extractAttachmentText({
      fileBuffer: ticket.attachment,
      mimeType: ticket.attachment_type,
      fileName: ticket.attachment_name
    });

    if (!extraction.ok) {
      return res.status(400).json({
        success: false,
        message: extraction.message || 'Attachment analysis failed during text extraction.'
      });
    }

    const aiResult = await analyzeAttachmentText({
      extractedText: extraction.text,
      ticketContext: ticket
    });

    if (!aiResult.ok) {
      await pool.execute(
        `INSERT INTO ticket_attachment_analyses
          (tenant_id, ticket_id, attachment_signature, attachment_name, attachment_type, summary, key_points_json, document_type, recommended_focus, analysis_status, analysis_error, analyzed_by, analyzed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           analysis_status = 'failed',
           analysis_error = VALUES(analysis_error),
           analyzed_by = VALUES(analyzed_by),
           analyzed_at = NOW(),
           updated_at = NOW()`,
        [
          tenantId,
          id,
          attachmentSignature,
          ticket.attachment_name || null,
          ticket.attachment_type || null,
          'This attachment could not be analyzed.',
          JSON.stringify([]),
          'Unsupported',
          'Review the file manually and retry later.',
          aiResult.message || 'AI analysis unavailable',
          req.user?.id || null
        ]
      );

      return res.status(503).json({
        success: false,
        message: aiResult.message || 'AI analysis is temporarily unavailable.'
      });
    }

    const analysis = aiResult.analysis;
    await pool.execute(
      `INSERT INTO ticket_attachment_analyses
        (tenant_id, ticket_id, attachment_signature, attachment_name, attachment_type, summary, key_points_json, document_type, recommended_focus, analysis_status, analysis_error, analyzed_by, analyzed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NULL, ?, NOW())
       ON DUPLICATE KEY UPDATE
         summary = VALUES(summary),
         key_points_json = VALUES(key_points_json),
         document_type = VALUES(document_type),
         recommended_focus = VALUES(recommended_focus),
         analysis_status = 'completed',
         analysis_error = NULL,
         analyzed_by = VALUES(analyzed_by),
         analyzed_at = NOW(),
         updated_at = NOW()`,
      [
        tenantId,
        id,
        attachmentSignature,
        ticket.attachment_name || null,
        ticket.attachment_type || null,
        analysis.summary,
        JSON.stringify(analysis.key_points || []),
        analysis.document_type || null,
        analysis.recommended_focus || null,
        req.user?.id || null
      ]
    );

    return res.json({
      success: true,
      data: {
        ...analysis,
        analyzed_at: new Date().toISOString(),
        cached: false
      }
    });
  } catch (error) {
    console.error('Error analyzing attachment:', error);
    return res.status(500).json({
      success: false,
      message: 'Attachment analysis failed due to an internal error.'
    });
  }
});

// POST /api/tickets/:id/attachments/:attachmentId/analyze - Analyze a specific multi-file attachment with AI (internal roles only)
router.post('/:id/attachments/:attachmentId/analyze', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    if (!isInternalRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Attachment analysis is available only for internal roles.' });
    }

    try {
      await ensureAttachmentAnalysisTable();
    } catch (_) {
      return res.status(500).json({ success: false, message: 'Attachment analysis storage is unavailable.' });
    }

    await ensureTicketAttachmentsTable();
    const { id, attachmentId } = req.params;
    const tenantId = req.tenantId || 1;
    const force = Boolean(req.body?.force);

    const [tickets] = await pool.execute(
      `SELECT id, tenant_id, issue_title, description, product, module, priority, status
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = tickets[0];

    const [rows] = await pool.execute(
      `SELECT id, file_name, file_type, attachment
       FROM ticket_attachments
       WHERE id = ? AND ticket_id = ? AND tenant_id = ?
       LIMIT 1`,
      [attachmentId, id, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    const a = rows[0];
    if (!a.attachment || !Buffer.isBuffer(a.attachment)) {
      return res.status(400).json({ success: false, message: 'No attachment found.' });
    }

    const attachmentSignature = getAttachmentSignature({
      attachmentName: a.file_name,
      attachmentType: a.file_type,
      attachmentBuffer: a.attachment
    });

    if (!force) {
      const [existing] = await pool.execute(
        `SELECT summary, key_points_json, document_type, recommended_focus, analyzed_at
         FROM ticket_attachment_analyses
         WHERE tenant_id = ? AND ticket_id = ? AND attachment_signature = ? AND analysis_status = 'completed'
         ORDER BY analyzed_at DESC
         LIMIT 1`,
        [tenantId, id, attachmentSignature]
      );
      if (existing.length > 0) {
        const row = existing[0];
        let keyPoints = [];
        try {
          keyPoints = Array.isArray(row.key_points_json) ? row.key_points_json : JSON.parse(row.key_points_json || '[]');
        } catch (_) {
          keyPoints = [];
        }
        return res.json({
          success: true,
          data: {
            summary: row.summary,
            key_points: keyPoints,
            document_type: row.document_type,
            recommended_focus: row.recommended_focus,
            analyzed_at: row.analyzed_at,
            cached: true
          }
        });
      }
    }

    const extraction = await extractAttachmentText({
      fileBuffer: a.attachment,
      mimeType: a.file_type,
      fileName: a.file_name
    });

    if (!extraction.ok) {
      return res.status(400).json({
        success: false,
        message: extraction.message || 'Attachment analysis failed during text extraction.'
      });
    }

    const aiResult = await analyzeAttachmentText({
      extractedText: extraction.text,
      ticketContext: ticket
    });

    if (!aiResult.ok) {
      await pool.execute(
        `INSERT INTO ticket_attachment_analyses
          (tenant_id, ticket_id, attachment_signature, attachment_name, attachment_type, summary, key_points_json, document_type, recommended_focus, analysis_status, analysis_error, analyzed_by, analyzed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           analysis_status = 'failed',
           analysis_error = VALUES(analysis_error),
           analyzed_by = VALUES(analyzed_by),
           analyzed_at = NOW(),
           updated_at = NOW()`,
        [
          tenantId,
          id,
          attachmentSignature,
          a.file_name || null,
          a.file_type || null,
          'This attachment could not be analyzed.',
          JSON.stringify([]),
          'Unsupported',
          'Review the file manually and retry later.',
          aiResult.message || 'AI analysis unavailable',
          req.user?.id || null
        ]
      );

      return res.status(503).json({
        success: false,
        message: aiResult.message || 'AI analysis is temporarily unavailable.'
      });
    }

    const analysis = aiResult.analysis;
    await pool.execute(
      `INSERT INTO ticket_attachment_analyses
        (tenant_id, ticket_id, attachment_signature, attachment_name, attachment_type, summary, key_points_json, document_type, recommended_focus, analysis_status, analysis_error, analyzed_by, analyzed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NULL, ?, NOW())
       ON DUPLICATE KEY UPDATE
         summary = VALUES(summary),
         key_points_json = VALUES(key_points_json),
         document_type = VALUES(document_type),
         recommended_focus = VALUES(recommended_focus),
         analysis_status = 'completed',
         analysis_error = NULL,
         analyzed_by = VALUES(analyzed_by),
         analyzed_at = NOW(),
         updated_at = NOW()`,
      [
        tenantId,
        id,
        attachmentSignature,
        a.file_name || null,
        a.file_type || null,
        analysis.summary,
        JSON.stringify(analysis.key_points || []),
        analysis.document_type || null,
        analysis.recommended_focus || null,
        req.user?.id || null
      ]
    );

    return res.json({
      success: true,
      data: {
        ...analysis,
        analyzed_at: new Date().toISOString(),
        cached: false
      }
    });
  } catch (error) {
    console.error('Error analyzing attachment:', error);
    return res.status(500).json({
      success: false,
      message: 'Attachment analysis failed due to an internal error.'
    });
  }
});

// GET /api/tickets/user/:userId - Get all tickets for a specific user
router.get('/user/:userId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureCustomerEscalationSchema();
    const { userId } = req.params;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const authUser = req.user || {};
    const authEmail = String(authUser.email || '').trim().toLowerCase();
    const authUserId = authUser.id ?? authUser.userId ?? authUser.user_id;
    const authRole = String(authUser.role || '').toLowerCase();
    
    // Org SPOC Scoping (tenant-level)
    if (authRole === 'org_spoc') {
      // Org SPOC has access to all tickets in their tenant
      const [tickets] = await pool.execute(
        `SELECT
           id, tenant_id, user_id, name, email, mobile, country_code,
           product, product_id, module, module_id, utm_description,
           description, issue_type, issue_type_other, issue_title,
           attachment_name, attachment_type,
           status, priority,
           assigned_to, assigned_by, current_owner_id, current_level,
           parent_ticket_id,
           first_response_at, sla_first_response_met, resolved_at, closed_at,
           created_at, updated_at, resolution_time,
           ${await ticketsHasColumn('sla_response_time_minutes') ? 'sla_response_time_minutes,' : 'NULL AS sla_response_time_minutes,'}
           ${await ticketsHasColumn('sla_resolution_time_minutes') ? 'sla_resolution_time_minutes,' : 'NULL AS sla_resolution_time_minutes,'}
           ${await ticketsHasColumn('is_escalated') ? 'COALESCE(is_escalated, 0) AS is_escalated,' : '0 AS is_escalated,'}
           ${await ticketsHasColumn('escalation_level') ? 'COALESCE(escalation_level, 0) AS escalation_level,' : '0 AS escalation_level,'}
           ${await ticketsHasColumn('escalated_at') ? 'escalated_at,' : 'NULL AS escalated_at,'}
           ${await ticketsHasColumn('reopen_count') ? 'COALESCE(reopen_count, 0) AS reopen_count,' : '0 AS reopen_count,'}
           ${await ticketsHasColumn('last_agent_reply_at') ? 'last_agent_reply_at' : 'NULL AS last_agent_reply_at'}
         FROM tickets
         WHERE tenant_id = ?
         ORDER BY created_at DESC`,
        [tenantId]
      );
      return res.json({ success: true, data: tickets });
    }

    // Product SPOC Scoping (tenant-level)
    if (authRole === 'product_spoc') {
      const [tickets] = await pool.execute(
        `SELECT
           id, tenant_id, user_id, name, email, mobile, country_code,
           product, product_id, module, module_id, utm_description,
           description, issue_type, issue_type_other, issue_title,
           attachment_name, attachment_type,
           status, priority,
           assigned_to, assigned_by, current_owner_id, current_level,
           parent_ticket_id,
           first_response_at, sla_first_response_met, resolved_at, closed_at,
           created_at, updated_at, resolution_time,
           ${await ticketsHasColumn('sla_response_time_minutes') ? 'sla_response_time_minutes,' : 'NULL AS sla_response_time_minutes,'}
           ${await ticketsHasColumn('sla_resolution_time_minutes') ? 'sla_resolution_time_minutes,' : 'NULL AS sla_resolution_time_minutes,'}
           ${await ticketsHasColumn('is_escalated') ? 'COALESCE(is_escalated, 0) AS is_escalated,' : '0 AS is_escalated,'}
           ${await ticketsHasColumn('escalation_level') ? 'COALESCE(escalation_level, 0) AS escalation_level,' : '0 AS escalation_level,'}
           ${await ticketsHasColumn('escalated_at') ? 'escalated_at,' : 'NULL AS escalated_at,'}
           ${await ticketsHasColumn('reopen_count') ? 'COALESCE(reopen_count, 0) AS reopen_count,' : '0 AS reopen_count,'}
           ${await ticketsHasColumn('last_agent_reply_at') ? 'last_agent_reply_at' : 'NULL AS last_agent_reply_at'}
         FROM tickets
         WHERE tenant_id = ? AND product_id = ?
         ORDER BY created_at DESC`,
        [tenantId, authUser.product_scope_id || 0]
      );
      return res.json({ success: true, data: tickets });
    }

    // Check if userId is actually an email
    if (userId.includes('@')) {
      // If userId is an email, get tickets directly by email
      const [tickets] = await pool.execute(
        `SELECT
           id, tenant_id, user_id, name, email, mobile, country_code,
           product, product_id, module, module_id, utm_description,
           description, issue_type, issue_type_other, issue_title,
           attachment_name, attachment_type,
           status, priority,
           assigned_to, assigned_by, current_owner_id, current_level,
           parent_ticket_id,
           first_response_at, sla_first_response_met, resolved_at, closed_at,
           created_at, updated_at, resolution_time,
           ${await ticketsHasColumn('sla_response_time_minutes') ? 'sla_response_time_minutes,' : 'NULL AS sla_response_time_minutes,'}
           ${await ticketsHasColumn('sla_resolution_time_minutes') ? 'sla_resolution_time_minutes,' : 'NULL AS sla_resolution_time_minutes,'}
           ${await ticketsHasColumn('is_escalated') ? 'COALESCE(is_escalated, 0) AS is_escalated,' : '0 AS is_escalated,'}
           ${await ticketsHasColumn('escalation_level') ? 'COALESCE(escalation_level, 0) AS escalation_level,' : '0 AS escalation_level,'}
           ${await ticketsHasColumn('escalated_at') ? 'escalated_at,' : 'NULL AS escalated_at,'}
           ${await ticketsHasColumn('reopen_count') ? 'COALESCE(reopen_count, 0) AS reopen_count,' : '0 AS reopen_count,'}
           ${await ticketsHasColumn('last_agent_reply_at') ? 'last_agent_reply_at' : 'NULL AS last_agent_reply_at'}
         FROM tickets
         WHERE tenant_id = ? AND LOWER(TRIM(email)) = LOWER(TRIM(?))
         ORDER BY created_at DESC`,
        [tenantId, userId]
      );
      
      return res.json({ success: true, data: tickets });
    }

    // Customer view: trust authenticated customer identity (not agent table id collisions).
    const isCustomer = ['user', 'customer'].includes(String(authUser.role || '').toLowerCase());
    const effectiveUserId = isCustomer ? Number(authUserId || userId) : Number(userId);
    let userEmail = authEmail || null;
    if (!userEmail && Number.isFinite(effectiveUserId)) {
      const [users] = await pool.execute(
        'SELECT email FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
        [effectiveUserId, tenantId]
      );
      if (users.length > 0) userEmail = String(users[0].email || '').trim().toLowerCase();
    }
    const [tickets] = await pool.execute(
      `SELECT
         id, tenant_id, user_id, name, email, mobile, country_code,
         product, product_id, module, module_id, utm_description,
         description, issue_type, issue_type_other, issue_title,
         attachment_name, attachment_type,
         status, priority,
         assigned_to, assigned_by, current_owner_id, current_level,
         parent_ticket_id,
         first_response_at, sla_first_response_met, resolved_at, closed_at,
         created_at, updated_at, resolution_time,
         ${await ticketsHasColumn('sla_response_time_minutes') ? 'sla_response_time_minutes,' : 'NULL AS sla_response_time_minutes,'}
         ${await ticketsHasColumn('sla_resolution_time_minutes') ? 'sla_resolution_time_minutes,' : 'NULL AS sla_resolution_time_minutes,'}
         ${await ticketsHasColumn('is_escalated') ? 'COALESCE(is_escalated, 0) AS is_escalated,' : '0 AS is_escalated,'}
         ${await ticketsHasColumn('escalation_level') ? 'COALESCE(escalation_level, 0) AS escalation_level,' : '0 AS escalation_level,'}
         ${await ticketsHasColumn('escalated_at') ? 'escalated_at,' : 'NULL AS escalated_at,'}
         ${await ticketsHasColumn('reopen_count') ? 'COALESCE(reopen_count, 0) AS reopen_count,' : '0 AS reopen_count,'}
         ${await ticketsHasColumn('last_agent_reply_at') ? 'last_agent_reply_at' : 'NULL AS last_agent_reply_at'}
       FROM tickets
       WHERE tenant_id = ?
         AND (
           user_id = ?
           OR (email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(?)))
         )
       ORDER BY created_at DESC`,
      [tenantId, Number.isFinite(effectiveUserId) ? effectiveUserId : -1, userEmail || '']
    );
    
    res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user tickets' });
  }
});

// POST /api/tickets/:id/customer-escalate - Customer-controlled escalation (reopen_count>=2 OR inactivity)
router.post('/:id/customer-escalate', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureCustomerEscalationSchema();
    const tenantId = req.tenantId || 1;
    const { id } = req.params;
    const actor = req.user || {};
    const actorRole = String(actor.role || '').toLowerCase();
    if (!['user', 'customer', 'org_spoc', 'product_spoc'].includes(actorRole)) {
      return res.status(403).json({ success: false, message: 'Only customers can escalate tickets.' });
    }

    const reason = String(req.body?.reason || '').trim();
    const comment = String(req.body?.comment || '').trim();
    const allowedReasons = new Set(['Issue not resolved', 'Delay in response', 'Incorrect resolution', 'Other']);
    if (!allowedReasons.has(reason)) {
      return res.status(400).json({ success: false, message: 'Reason is required.' });
    }

    const actorId = actor.id ?? actor.userId ?? actor.user_id;
    const actorEmail = String(actor.email || '').trim().toLowerCase();
    const hasActorId = actorId !== undefined && actorId !== null && String(actorId).trim() !== '';
    const hasActorEmail = !!actorEmail;
    if (!hasActorId && !hasActorEmail) {
      return res.status(401).json({ success: false, message: 'Invalid user context.' });
    }

    const [rows] = await pool.execute(
      `SELECT
         id, tenant_id, user_id, name, email, status, priority, assigned_to, current_owner_id,
         created_at, updated_at, product_id,
         ${await ticketsHasColumn('reopen_count') ? 'COALESCE(reopen_count, 0) AS reopen_count,' : '0 AS reopen_count,'}
         ${await ticketsHasColumn('last_agent_reply_at') ? 'last_agent_reply_at,' : 'NULL AS last_agent_reply_at,'}
         ${await ticketsHasColumn('is_escalated') ? 'COALESCE(is_escalated, 0) AS is_escalated,' : '0 AS is_escalated,'}
         ${await ticketsHasColumn('escalation_level') ? 'COALESCE(escalation_level, 0) AS escalation_level,' : '0 AS escalation_level,'}
         ${await ticketsHasColumn('escalated_at') ? 'escalated_at' : 'NULL AS escalated_at'}
       FROM tickets
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [id, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }
    const ticket = rows[0];

    // Ownership & Isolation check (reopen/escalation safety)
    let hasAccess = false;
    
    // Tenant-level SPOC access control
    if (actorRole === 'org_spoc') {
      // Org SPOC has access to all tickets in their tenant
      hasAccess = Number(ticket.tenant_id || 0) === Number(actor.tenant_id || 0);
    } else if (actorRole === 'product_spoc') {
      // Product SPOC has access to tickets in their tenant for their scoped product
      hasAccess = Number(ticket.tenant_id || 0) === Number(actor.tenant_id || 0) &&
                  Number(ticket.product_id || 0) === Number(actor.product_scope_id || 0);
    } else {
      hasAccess = (hasActorId && ticket.user_id && Number(ticket.user_id) === Number(actorId)) ||
                  (hasActorEmail && ticket.email && String(ticket.email).trim().toLowerCase() === actorEmail);
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const statusLower = String(ticket.status || '').toLowerCase();
    if (statusLower === 'closed' || statusLower === 'resolved') {
      return res.status(409).json({ success: false, message: 'Escalation is not allowed for resolved/closed tickets.' });
    }
    if (statusLower !== 'in_progress') {
      return res.status(409).json({ success: false, message: 'Escalation is available only when the ticket is in progress.' });
    }

    // Cooldown
    const cooldownHours = Number(process.env.CUSTOMER_ESCALATE_COOLDOWN_HOURS || 8);
    const lastEsc = ticket.escalated_at ? new Date(ticket.escalated_at) : null;
    if (lastEsc && Number.isFinite(lastEsc.getTime())) {
      const ms = Date.now() - lastEsc.getTime();
      if (ms < cooldownHours * 3600 * 1000) {
        return res.status(409).json({
          success: false,
          message: 'This ticket is already escalated and under review. Please wait before escalating again.'
        });
      }
    }

    // Trigger conditions
    const reopenCount = Number(ticket.reopen_count || 0);
    const inactivityHours = Number(process.env.CUSTOMER_ESCALATE_INACTIVITY_HOURS || 24);
    const lastAgent = ticket.last_agent_reply_at ? new Date(ticket.last_agent_reply_at) : null;
    const lastAgentMs = lastAgent && Number.isFinite(lastAgent.getTime()) ? lastAgent.getTime() : new Date(ticket.created_at || ticket.updated_at || Date.now()).getTime();
    const inactiveForMs = Date.now() - lastAgentMs;
    const inactiveLong = inactiveForMs >= inactivityHours * 3600 * 1000;
    const eligible = reopenCount >= 2 || inactiveLong;
    if (!eligible) {
      return res.status(403).json({ success: false, message: 'Escalation is not available for this ticket yet.' });
    }

    const nextLevel = Number(ticket.escalation_level || 0) + 1;
    // Priority bump: medium/low -> high, keep urgent as urgent
    const currentPriority = String(ticket.priority || 'medium').toLowerCase();
    const nextPriority = currentPriority === 'urgent' ? 'urgent' : (currentPriority === 'high' ? 'urgent' : 'high');

    await pool.execute(
      `UPDATE tickets
       SET is_escalated = 1,
           escalation_level = ?,
           escalation_reason = ?,
           escalation_comment = ?,
           escalated_at = NOW(),
           status = 'escalated',
           assigned_to = NULL,
           assigned_by = NULL,
           current_owner_id = NULL,
           priority = ?,
           updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [nextLevel, reason, comment || null, nextPriority, id, tenantId]
    );
    cacheInvalidateTicketsLists();

    // Notify managers + inform previous assigned agent (best effort)
    try {
      const notifyTicket = {
        ...ticket,
        escalation_level: nextLevel,
        is_escalated: 1,
        priority: nextPriority,
        status: 'escalated'
      };
      await ticketEventNotificationService.notifyCustomerEscalated({
        ticket: notifyTicket,
        tenantId,
        reason: `Customer escalation to manager: ${reason}${comment ? ` — ${comment}` : ''}`,
        comment,
        actorName: actor.name || actor.email || 'Customer'
      });
    } catch (e) {
      console.warn('Customer escalate notifications failed:', e?.message);
    }

    return res.json({
      success: true,
      message: `Ticket #${id} has been escalated.`,
      data: {
        id: Number(id),
        status: 'escalated',
        is_escalated: 1,
        escalation_level: nextLevel,
        priority: nextPriority
      }
    });
  } catch (e) {
    console.error('Customer escalate error:', e);
    return res.status(500).json({ success: false, message: 'Failed to escalate ticket.' });
  }
});

// DELETE /api/tickets/:id - Delete a ticket
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if ticket exists
    const [tickets] = await pool.execute(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    const ticket = tickets[0];
    
    // Delete the ticket
    const [result] = await pool.execute(
      'DELETE FROM tickets WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Send WhatsApp notification if mobile number exists
    if (ticket.mobile) {
      const whatsappMessage = `📋 Ticket Deleted\n\n` +
        `🎫 Ticket ID: #${ticket.id}\n` +
        `🏷️ Issue: ${ticket.issue_title}\n` +
        `❌ Status: Deleted\n\n` +
        `Your ticket has been deleted from our system.`;
      
      await sendWhatsAppMessage(ticket.mobile, whatsappMessage);
    }
    
    res.json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ticket'
    });
  }
});

// GET /api/tickets/assignment-stats - Get ticket assignment statistics
router.get('/assignment-stats', setTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const stats = await TicketAssignmentService.getAssignmentStatistics(tenantId);
    
    res.json({
      success: true,
      message: 'Assignment statistics retrieved successfully',
      data: {
        agents: stats,
        total_agents: stats.length,
        total_tickets: stats.reduce((sum, agent) => sum + agent.total_tickets, 0),
        average_tickets_per_agent: stats.length > 0 ? 
          (stats.reduce((sum, agent) => sum + agent.total_tickets, 0) / stats.length).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Error getting assignment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get assignment statistics'
    });
  }
});

// POST /api/tickets/rebalance - Rebalance ticket assignments
router.post('/rebalance', setTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const result = await TicketAssignmentService.rebalanceAssignments(tenantId);
    
    res.json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    console.error('Error rebalancing assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rebalance assignments'
    });
  }
});

// POST /api/tickets/:id/assign-equally - Manually assign a ticket using equal distribution
router.post('/:id/assign-equally', authenticateToken, setTenantContext, verifyTenantAccess, async (req, res) => {
  try {
    const actorRole = String(req.user?.role || '').toLowerCase();
    if (!MANAGER_ROLES.includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only managers can assign tickets.'
      });
    }
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { assigned_by } = req.body;
    const [tickets] = await pool.execute(
      'SELECT id, parent_ticket_id FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1',
      [id, tenantId]
    );
    if (!tickets.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (tickets[0].parent_ticket_id) {
      return res.status(409).json({
        success: false,
        message: `Ticket is linked to parent #${tickets[0].parent_ticket_id}. Assign from parent ticket only.`
      });
    }

    // Internal linked-ticket groups: only the primary ticket can be assigned.
    try {
      const hasLinkItems = await hasTicketLinkItemsTable();
      if (hasLinkItems) {
        const [g] = await pool.execute(
          `SELECT group_id
           FROM ticket_link_group_items
           WHERE tenant_id = ? AND ticket_id = ?
           LIMIT 1`,
          [tenantId, Number(id)]
        );
        const groupId = Number(g?.[0]?.group_id || 0);
        if (groupId) {
          const [gr] = await pool.execute(
            `SELECT primary_ticket_id FROM ticket_link_groups WHERE tenant_id = ? AND id = ? LIMIT 1`,
            [tenantId, groupId]
          );
          const primaryId = Number(gr?.[0]?.primary_ticket_id || 0);
          if (primaryId && primaryId !== Number(id)) {
            return res.status(409).json({
              success: false,
              message: `This ticket is linked under primary ticket #${primaryId}. Assign from the primary ticket only.`,
              data: { primary_ticket_id: primaryId }
            });
          }
        }
      }
    } catch (_) {}
    
    const result = await TicketAssignmentService.assignTicketEqually(parseInt(id), assigned_by, tenantId);
    
    res.json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    console.error('Error assigning ticket equally:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to assign ticket'
    });
  }
});

// Add a new route for testing timestamp recording
router.put('/:id/status-test', async (req, res) => {
  try {
    console.log('🔍 TEST ROUTE: /api/tickets/:id/status-test called');
    const { id } = req.params;
    const { status } = req.body;
    
    // Get current ticket status
    const [tickets] = await pool.execute(
      'SELECT status, first_response_at, resolved_at FROM tickets WHERE id = ?',
      [id]
    );
    
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    const ticket = tickets[0];
    const now = new Date();
    
    // Prepare update query with timestamp tracking
    let updateQuery = 'UPDATE tickets SET status = ?';
    let queryParams = [status];
    
    // Record first response time when status changes to 'in_progress'
    if (status === 'in_progress' && ticket.status !== 'in_progress' && !ticket.first_response_at) {
      updateQuery += ', first_response_at = ?';
      queryParams.push(now);
      console.log(`📝 Recording first response time for ticket ${id}: ${now.toISOString()}`);
    }
    
    // Record resolution time when status changes to 'closed'
    if (status === 'closed' && ticket.status !== 'closed' && !ticket.resolved_at) {
      updateQuery += ', resolved_at = ?';
      queryParams.push(now);
      console.log(`📝 Recording resolution time for ticket ${id}: ${now.toISOString()}`);
    }
    
    queryParams.push(id);
    updateQuery += ' WHERE id = ?';
    
    const [result] = await pool.execute(updateQuery, queryParams);
    
    console.log(`✅ TEST ROUTE: Status updated for ticket ${id}: ${status}`);
    
    res.json({
      success: true,
      message: 'Ticket status updated successfully (test route)'
    });
  } catch (error) {
    console.error('Error in test route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
});

// GET /api/tickets/agent/:agentId - Get tickets assigned to the logged-in agent
// NOTE: :agentId from the URL is ignored; we always use the authenticated agent from the token.
router.get('/agent/:agentId', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const user = req.user;
    const tenantId = req.tenantId || user.tenant_id || 1;

    // For staff, auth middleware sets agentId when this is an agent record
    const agentId = user.agentId || user.id;
    console.log(`🔍 Fetching tickets for logged-in agent. URL param: ${req.params.agentId}, effective agentId: ${agentId}, tenantId: ${tenantId}`);

    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'Agent context not found for current user'
      });
    }

    const taskTableExists = await hasTicketTasksTable();
    if (taskTableExists) {
      await ensureTicketTasksAssignmentStatusColumn();
    }
    const taskSummaryJoin = taskTableExists ? `
      LEFT JOIN (
        SELECT
          tt.ticket_id,
          tt.tenant_id,
          COUNT(*) AS total_tasks,
          SUM(CASE WHEN tt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
          GROUP_CONCAT(DISTINCT a2.name ORDER BY a2.name SEPARATOR ', ') AS grouped_assigned_agents
        FROM ticket_tasks tt
        LEFT JOIN agents a2 ON a2.id = tt.assigned_agent_id AND a2.tenant_id = tt.tenant_id
        WHERE COALESCE(tt.is_removed, 0) = 0
        GROUP BY tt.ticket_id, tt.tenant_id
      ) ttask ON ttask.ticket_id = t.id AND ttask.tenant_id = t.tenant_id
    ` : '';
    const myTaskJoin = taskTableExists ? `
      LEFT JOIN (
        SELECT ttx.*
        FROM ticket_tasks ttx
        INNER JOIN (
          SELECT ticket_id, tenant_id, assigned_agent_id, MIN(id) AS mid
          FROM ticket_tasks
          WHERE COALESCE(is_removed, 0) = 0
          GROUP BY ticket_id, tenant_id, assigned_agent_id
        ) pick ON pick.mid = ttx.id
        WHERE COALESCE(ttx.is_removed, 0) = 0
      ) tt_me ON tt_me.ticket_id = t.id AND tt_me.tenant_id = t.tenant_id AND tt_me.assigned_agent_id = ?
    ` : '';

    let listQuery = `
      SELECT 
        t.id,
        t.name,
        t.email,
        t.mobile,
        t.product,
        t.product_id,
        t.module,
        t.module_id,
        t.description,
        t.issue_type,
        t.issue_type_other,
        t.issue_title,
        t.status,
        t.priority,
        t.assigned_to,
        t.assigned_by,
        t.created_at,
        t.updated_at,
        t.closed_at,
        t.first_response_at,
        t.resolved_at,
        t.sla_first_response_met,
        t.attachment_name,
        t.attachment_type,
        a.name as assigned_to_name,
        a.email as assigned_to_email,
        ${taskTableExists ? 'COALESCE(ttask.total_tasks, 0)' : '0'} as total_tasks,
        ${taskTableExists ? 'COALESCE(ttask.completed_tasks, 0)' : '0'} as completed_tasks,
        ${taskTableExists ? 'COALESCE(ttask.grouped_assigned_agents, \'\')' : '\'\''} as grouped_assigned_agents,
        ${taskTableExists ? 'CASE WHEN COALESCE(ttask.total_tasks, 0) > 0 THEN 1 ELSE 0 END' : '0'} as is_grouped,
        ${taskTableExists ? 'tt_me.id' : 'NULL'} as my_task_id,
        ${taskTableExists ? 'tt_me.status' : 'NULL'} as my_task_work_status,
        ${taskTableExists ? 'tt_me.assignment_status' : 'NULL'} as my_task_assignment_status
      FROM tickets t
      LEFT JOIN agents a ON t.assigned_to = a.id
      ${taskSummaryJoin}
      ${myTaskJoin}
      WHERE t.tenant_id = ?
    `;
    const listParams = [];
    if (taskTableExists) {
      listParams.push(agentId);
    }
    listParams.push(tenantId);
    if (taskTableExists) {
      listQuery += ` AND (
        t.assigned_to = ?
        OR EXISTS (
          SELECT 1
          FROM ticket_tasks tt_scope
          WHERE tt_scope.ticket_id = t.id
            AND tt_scope.tenant_id = t.tenant_id
            AND tt_scope.assigned_agent_id = ?
            AND COALESCE(tt_scope.is_removed, 0) = 0
        )
      )`;
      listParams.push(agentId, agentId);
    } else {
      listQuery += ' AND t.assigned_to = ?';
      listParams.push(agentId);
    }
    listQuery += `
      ORDER BY t.updated_at DESC, t.created_at DESC
    `;
    const [tickets] = await pool.execute(listQuery, listParams);
    const normalizedTickets = (tickets || []).map((ticket) => {
      const totalTasks = Number(ticket.total_tasks || 0);
      const fromTasks = String(ticket.grouped_assigned_agents || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      const groupedNames =
        totalTasks > 0
          ? fromTasks
          : (() => {
              const names = [...fromTasks];
              const primaryAssignee = String(ticket.assigned_to_name || '').trim();
              if (primaryAssignee && !names.includes(primaryAssignee)) names.unshift(primaryAssignee);
              return names;
            })();

      const work = String(ticket.my_task_work_status || '').toLowerCase();
      const assign = String(ticket.my_task_assignment_status || 'new').toLowerCase();
      const rawParentStatus =
        String(ticket.status != null ? ticket.status : 'new')
          .trim()
          .toLowerCase() || 'new';
      // Hard safety: once closed_at is present, always bucket to closed for agent tabs.
      const parentStatus = ticket.closed_at ? 'closed' : rawParentStatus;
      let agent_tab_status = parentStatus;

      return {
        ...ticket,
        grouped_assigned_agents: groupedNames.join(', '),
        is_grouped: totalTasks > 0 ? 1 : 0,
        agent_tab_status
      };
    });

    console.log(`✅ Found ${tickets.length} tickets for agent ${agentId} (tenant ${tenantId})`);

    res.json({
      success: true,
      message: `Found ${normalizedTickets.length} tickets for agent`,
      data: normalizedTickets
    });

  } catch (error) {
    console.error('Error fetching agent tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent tickets'
    });
  }
});

// PUT /api/tickets/:ticketId/close - Close ticket after resolution
router.put('/:ticketId/close', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const tenantId = req.tenantId || 1;
    const actor = req.user || {};
    const actorRole = (actor.role || '').toLowerCase();
    const actorId = actor.id ?? actor.userId ?? actor.user_id;
    const actorEmail = (actor.email || '').trim().toLowerCase();

    const isCustomerActor = actorRole === 'user' || actorRole === 'customer';
    const isManagerActor = ['support_manager', 'manager', 'ceo', 'admin'].includes(actorRole);
    if (!isCustomerActor && !isManagerActor) {
      return res.status(403).json({ success: false, message: 'Not authorized to close tickets' });
    }

    let ticket = null;
    if (isCustomerActor) {
      const hasActorId = actorId !== undefined && actorId !== null && String(actorId).trim() !== '';
      const hasActorEmail = !!actorEmail;
      if (!hasActorId && !hasActorEmail) {
        return res.status(401).json({ success: false, message: 'Invalid user context' });
      }

      let ownershipQuery = `
        SELECT id, user_id, email, status, resolved_at
        FROM tickets
        WHERE id = ? AND tenant_id = ?`;
      const ownershipParams = [ticketId, tenantId];
      const ownershipChecks = [];
      if (hasActorId) {
        ownershipChecks.push('user_id = ?');
        ownershipParams.push(Number(actorId));
      }
      if (hasActorEmail) {
        ownershipChecks.push('LOWER(TRIM(email)) = ?');
        ownershipParams.push(actorEmail);
      }
      ownershipQuery += ` AND (${ownershipChecks.join(' OR ')})`;

      const [tickets] = await pool.execute(ownershipQuery, ownershipParams);
      if (tickets.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      ticket = tickets[0];
    } else {
      const [tickets] = await pool.execute(
        `SELECT id, status, resolved_at
         FROM tickets
         WHERE id = ? AND tenant_id = ?
         LIMIT 1`,
        [ticketId, tenantId]
      );
      if (!tickets.length) return res.status(404).json({ success: false, message: 'Ticket not found' });
      ticket = tickets[0];
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Ticket is already closed' });
    }
    if (ticket.status !== 'resolved') {
      return res.status(400).json({
        success: false,
        message: 'Ticket can be closed only after manager/support marks it resolved.'
      });
    }
    await ensureTicketsReopenedColumn();
    let updateQuery = 'UPDATE tickets SET status = ?, updated_at = NOW()';
    const params = ['closed'];
    if (await ticketsHasColumn('is_reopened')) {
      updateQuery += ', is_reopened = 0';
    }
    const hasClosedAt = await ticketsHasColumn('closed_at');
    if (hasClosedAt) {
      updateQuery += ', closed_at = NOW()';
    }
    updateQuery += ' WHERE id = ? AND tenant_id = ?';
    params.push(ticketId, tenantId);
    await pool.execute(updateQuery, params);
    await upsertKnowledgeEntryFromTicket({ ticketId: Number(ticketId), tenantId });
    // Always compute SLA timers/deadlines from the original ticket.created_at (single SLA cycle).
    await applyResolvedSlaToTicket({ ticketId: Number(ticketId), tenantId });

    try {
      const [notifyRows] = await pool.execute(
        'SELECT id, tenant_id, status, name, email, mobile, issue_title, description, user_id FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1',
        [ticketId, tenantId]
      );
      if (notifyRows.length > 0) {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: notifyRows[0],
          tenantId,
          previousStatus: 'resolved',
          newStatus: 'closed',
          actorId: actorId || null,
          actorName: actor.name || actor.email || (isManagerActor ? 'Manager' : 'Customer')
        });
      }
    } catch (e) {
      console.warn('Could not run centralized close notifications:', e?.message);
    }

    return res.json({
      success: true,
      message: 'Ticket closed successfully',
      data: { ticketId: Number(ticketId), status: 'closed', closedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error closing ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to close ticket' });
  }
});

// PUT /api/tickets/:ticketId/reopen - Customer reopens own closed ticket
router.put('/:ticketId/reopen', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const tenantId = req.tenantId || 1;
    const actor = req.user || {};
    const actorRole = (actor.role || '').toLowerCase();
    const actorId = actor.id ?? actor.userId ?? actor.user_id;
    const actorEmail = (actor.email || '').trim().toLowerCase();

    if (actorRole !== 'user' && actorRole !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can reopen tickets' });
    }

    const hasActorId = actorId !== undefined && actorId !== null && String(actorId).trim() !== '';
    const hasActorEmail = !!actorEmail;
    if (!hasActorId && !hasActorEmail) {
      return res.status(401).json({ success: false, message: 'Invalid user context' });
    }

    let ownershipQuery = `
      SELECT id, user_id, email, status,
             sla_response_time_minutes, sla_resolution_time_minutes
      FROM tickets
      WHERE id = ? AND tenant_id = ?`;
    const ownershipParams = [ticketId, tenantId];
    const ownershipChecks = [];
    if (hasActorId) {
      ownershipChecks.push('user_id = ?');
      ownershipParams.push(Number(actorId));
    }
    if (hasActorEmail) {
      ownershipChecks.push('LOWER(TRIM(email)) = ?');
      ownershipParams.push(actorEmail);
    }
    ownershipQuery += ` AND (${ownershipChecks.join(' OR ')})`;

    const [tickets] = await pool.execute(ownershipQuery, ownershipParams);
    if (tickets.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const ticket = tickets[0];
    if (ticket.status !== 'closed') {
      return res.status(400).json({ success: false, message: 'Only closed tickets can be reopened' });
    }

    const reopenReason = String(req.body?.reason || '').trim();
    if (!reopenReason || reopenReason.length < 3) {
      return res.status(400).json({ success: false, message: 'Reason is required (min 3 characters).' });
    }

    // Reopened tickets must start fresh as standalone tickets (detach any prior linking).
    await detachLinkedWorkflowForReopen(Number(ticketId), tenantId);

    await ensureTicketsReopenedColumn();
    // Customer reopen: reset workflow to "in_progress" and (optionally) reset SLA deadlines.
    // - status -> in_progress
    // - reopened_at -> now
    // - do NOT modify created_at (reporting baseline), first_response_at, sla_first_response_met, resolution_time
    await ensureTicketsReopenedAtColumn();
    await ensureTicketsReopenCountColumn();
    await ensureTicketsReopenReasonColumn();

    let updateQuery = 'UPDATE tickets SET status = ?, updated_at = NOW()';
    const params = ['in_progress'];

    if (await ticketsHasColumn('is_reopened')) updateQuery += ', is_reopened = 1';
    if (await ticketsHasColumn('reopened_at')) updateQuery += ', reopened_at = NOW()';
    if (await ticketsHasColumn('reopen_count')) updateQuery += ', reopen_count = reopen_count + 1';
    if (await ticketsHasColumn('reopen_reason')) {
      updateQuery += ', reopen_reason = ?';
      params.push(reopenReason);
    }
    // Reset escalation flag on reopen so customer can escalate again after repeated reopen attempts.
    if (await ticketsHasColumn('is_escalated')) updateQuery += ', is_escalated = 0';
    // Stale ETA from prior workflow should not trigger immediate auto-escalation after reopen.
    if (await ticketsHasColumn('eta_due_at')) updateQuery += ', eta_due_at = NULL';
    if (await ticketsHasColumn('eta_reason')) updateQuery += ', eta_reason = NULL';
    if (await ticketsHasColumn('closed_at')) updateQuery += ', closed_at = NULL';
    if (await ticketsHasColumn('resolved_at')) updateQuery += ', resolved_at = NULL';

    // Reset SLA deadlines on reopen so stale due_at values do not cause immediate breach/escalation.
    // This keeps created_at intact but restarts the active SLA countdown from "now".
    try {
      const { ensureSlaResolutionSchema } = require('../services/slaResolutionService');
      await ensureSlaResolutionSchema();
      const respMin = Number(ticket.sla_response_time_minutes || 0) || 480;
      const resMin = Number(ticket.sla_resolution_time_minutes || 0) || respMin || 480;
      if (await ticketsHasColumn('sla_response_due_at')) {
        updateQuery += ', sla_response_due_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)';
        params.push(respMin);
      }
      if (await ticketsHasColumn('sla_resolution_due_at')) {
        updateQuery += ', sla_resolution_due_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)';
        params.push(resMin);
      }
    } catch (e) {
      console.warn('⚠️ Could not reset SLA due_at on reopen:', e?.message);
    }

    updateQuery += ' WHERE id = ? AND tenant_id = ?';
    params.push(ticketId, tenantId);
    await pool.execute(updateQuery, params);
    cacheInvalidateTicketsLists();
    await resetTicketTasksForReopen(Number(ticketId), tenantId);

    // Best-effort: reset any SLA timer rows so the UI shows the restarted SLA window.
    try {
      const respMin = Number(ticket.sla_response_time_minutes || 0) || 480;
      const resMin = Number(ticket.sla_resolution_time_minutes || 0) || respMin || 480;
      await pool.execute(
        `UPDATE sla_timers
         SET sla_deadline = DATE_ADD(NOW(), INTERVAL ? MINUTE),
             status = 'active',
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND ticket_id = ? AND timer_type = 'response'`,
        [respMin, tenantId, ticketId]
      );
      await pool.execute(
        `UPDATE sla_timers
         SET sla_deadline = DATE_ADD(NOW(), INTERVAL ? MINUTE),
             status = 'active',
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND ticket_id = ? AND timer_type = 'resolution'`,
        [resMin, tenantId, ticketId]
      );
    } catch (_) {}

    // Store reopen reason in unified thread so staff see it immediately.
    try {
      const ticketMessagesService = require('../services/ticketMessagesService');
      await ticketMessagesService.addMessage({
        ticketId: Number(ticketId),
        tenantId,
        senderType: ticketMessagesService.SENDER_TYPES.USER,
        senderName: actor.name || actor.email || 'Customer',
        senderId: hasActorId ? Number(actorId) : null,
        message: `Customer reopened the ticket:\n${reopenReason}`,
        channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
        isInternal: false
      });
    } catch (e) {
      console.warn('Could not append customer reopen reason message:', e?.message);
    }

    // Availability gate on reopen:
    // keep current assignee only if still available; otherwise re-run normal auto assignment flow.
    try {
      const [assignmentRows] = await pool.execute(
        `SELECT t.assigned_to, COALESCE(a.availability_status, 'available') AS availability_status
         FROM tickets t
         LEFT JOIN agents a ON a.id = t.assigned_to
         WHERE t.id = ? AND (t.tenant_id = ? OR t.tenant_id IS NULL)
         LIMIT 1`,
        [ticketId, tenantId]
      );
      const assignmentInfo = assignmentRows?.[0];
      const currentAssignedTo = assignmentInfo?.assigned_to;
      const currentAvailability = String(assignmentInfo?.availability_status || 'available').toLowerCase();
      const assigneeUnavailable = currentAssignedTo && currentAvailability !== 'available';

      if (assigneeUnavailable) {
        // Clear stale assignee first so unavailable/on-leave agent does not keep reopened ticket.
        let [clearResult] = await pool.execute(
          `UPDATE tickets
           SET assigned_to = NULL, assigned_by = NULL, current_owner_id = NULL
           WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
          [ticketId, tenantId]
        );
        if (!clearResult.affectedRows) {
          await pool.execute(
            'UPDATE tickets SET assigned_to = NULL, assigned_by = NULL, current_owner_id = NULL WHERE id = ?',
            [ticketId]
          );
        }

        try {
          await TicketAssignmentService.assignTicketEqually(Number(ticketId), null, tenantId);
        } catch (reassignErr) {
          // Preserve existing fallback behavior: ticket can remain unassigned when no available agents exist.
          console.warn(`⚠️ Reopen reassignment skipped for ticket ${ticketId}:`, reassignErr?.message || reassignErr);
        }
      }
    } catch (availabilityErr) {
      console.warn(`⚠️ Reopen availability check failed for ticket ${ticketId}:`, availabilityErr?.message || availabilityErr);
    }

    try {
      const [notifyRows] = await pool.execute(
        `SELECT id, tenant_id, status, name, email, mobile, issue_title, description, user_id,
                product, module, issue_type, issue_type_other, priority, assigned_to
         FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [ticketId, tenantId]
      );
      if (notifyRows.length > 0) {
        await ticketEventNotificationService.notifyTicketReopenedByCustomer({
          ticket: notifyRows[0],
          tenantId,
          actorId: actorId ?? null,
          actorName: actor.name || actor.email || 'Customer'
        });
        try {
          const appNotificationService = require('../services/appNotificationService');
          await appNotificationService.notifyReopenReasonInApp(pool, {
            tenantId,
            ticketId: Number(ticketId),
            reason: reopenReason
          });
        } catch (inAppErr) {
          console.warn('⚠️ In-app reopen reason notification failed:', inAppErr?.message);
        }
      }
    } catch (notifyErr) {
      console.warn('Could not run reopen notifications:', notifyErr?.message);
    }

    return res.json({
      success: true,
      message: 'Ticket reopened successfully',
      data: { ticketId: Number(ticketId), status: 'in_progress', reopened: true }
    });
  } catch (error) {
    console.error('Error reopening ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to reopen ticket' });
  }
});

// PUT /api/tickets/:ticketId/reject-resolution - Customer rejects resolution (resolved -> in_progress) with required reason
router.put('/:ticketId/reject-resolution', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const tenantId = req.tenantId || 1;
    const actor = req.user || {};
    const actorRole = (actor.role || '').toLowerCase();
    const actorId = actor.id ?? actor.userId ?? actor.user_id;
    const actorEmail = (actor.email || '').trim().toLowerCase();
    const reason = String(req.body?.reason || '').trim();

    if (actorRole !== 'user' && actorRole !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can reject resolution' });
    }
    if (!reason || reason.length < 3) {
      return res.status(400).json({ success: false, message: 'Reason is required (min 3 characters).' });
    }

    const hasActorId = actorId !== undefined && actorId !== null && String(actorId).trim() !== '';
    const hasActorEmail = !!actorEmail;
    if (!hasActorId && !hasActorEmail) {
      return res.status(401).json({ success: false, message: 'Invalid user context' });
    }

    let ownershipQuery = `
      SELECT id, tenant_id, user_id, name, email, status, assigned_to, issue_title, description
      FROM tickets
      WHERE id = ? AND tenant_id = ?`;
    const ownershipParams = [ticketId, tenantId];
    const ownershipChecks = [];
    if (hasActorId) {
      ownershipChecks.push('user_id = ?');
      ownershipParams.push(Number(actorId));
    }
    if (hasActorEmail) {
      ownershipChecks.push('LOWER(TRIM(email)) = ?');
      ownershipParams.push(actorEmail);
    }
    ownershipQuery += ` AND (${ownershipChecks.join(' OR ')})`;

    const [tickets] = await pool.execute(ownershipQuery, ownershipParams);
    if (tickets.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const ticket = tickets[0];
    if (String(ticket.status).toLowerCase() !== 'resolved') {
      return res.status(400).json({ success: false, message: 'Only resolved tickets can be rejected.' });
    }

    // A customer "reject resolution" is effectively a reopen.
    // Detach any previous linking so this ticket restarts standalone.
    try {
      await detachLinkedWorkflowForReopen(Number(ticketId), tenantId);
    } catch (_) {}

    // Post the rejection reason into the unified ticket thread so agents see the current issue.
    try {
      const ticketMessagesService = require('../services/ticketMessagesService');
      await ticketMessagesService.addMessage({
        ticketId: Number(ticketId),
        tenantId,
        senderType: ticketMessagesService.SENDER_TYPES.USER,
        senderName: ticket.name || actor.name || actor.email || 'Customer',
        senderId: hasActorId ? Number(actorId) : null,
        message: `Customer rejected the resolution:\n${reason}`,
        channel: ticketMessagesService.CHANNELS.PLATFORM_CHAT,
        isInternal: false
      });
    } catch (e) {
      console.warn('Could not append customer rejection message:', e?.message);
    }

    await ensureTicketsReopenedColumn();
    await ensureTicketsReopenedAtColumn();
    await ensureTicketsReopenCountColumn();
    await ensureTicketsReopenReasonColumn();

    let updateQuery = 'UPDATE tickets SET status = ?, updated_at = NOW()';
    const params = ['in_progress'];
    if (await ticketsHasColumn('is_reopened')) updateQuery += ', is_reopened = 1';
    if (await ticketsHasColumn('reopened_at')) updateQuery += ', reopened_at = NOW()';
    if (await ticketsHasColumn('reopen_count')) updateQuery += ', reopen_count = reopen_count + 1';
    if (await ticketsHasColumn('reopen_reason')) {
      updateQuery += ', reopen_reason = ?';
      params.push(reason);
    }
    if (await ticketsHasColumn('is_escalated')) updateQuery += ', is_escalated = 0';
    if (await ticketsHasColumn('eta_due_at')) updateQuery += ', eta_due_at = NULL';
    if (await ticketsHasColumn('eta_reason')) updateQuery += ', eta_reason = NULL';
    // Reset SLA due_at on "reject resolution" reopen as well.
    try {
      const { ensureSlaResolutionSchema } = require('../services/slaResolutionService');
      await ensureSlaResolutionSchema();
      const respMin = Number(ticket.sla_response_time_minutes || 0) || 480;
      const resMin = Number(ticket.sla_resolution_time_minutes || 0) || respMin || 480;
      if (await ticketsHasColumn('sla_response_due_at')) {
        updateQuery += ', sla_response_due_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)';
        params.push(respMin);
      }
      if (await ticketsHasColumn('sla_resolution_due_at')) {
        updateQuery += ', sla_resolution_due_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)';
        params.push(resMin);
      }
    } catch (_) {}
    if (await ticketsHasColumn('resolved_at')) updateQuery += ', resolved_at = NULL';
    if (await ticketsHasColumn('closed_at')) updateQuery += ', closed_at = NULL';

    updateQuery += ' WHERE id = ? AND tenant_id = ?';
    params.push(ticketId, tenantId);
    await pool.execute(updateQuery, params);

    // Notify assigned agent immediately (single-assignee).
    try {
      await ticketEventNotificationService.notifyAssignedAgentCustomerRejectedResolution({
        ticket: { ...ticket, id: Number(ticketId), status: 'in_progress' },
        tenantId,
        actorName: actor.name || actor.email || 'Customer',
        reason
      });
    } catch (e) {
      console.warn('Assigned-agent rejection notification failed:', e?.message);
    }

    // Also reuse reopen fanout semantics (customer confirmation + lifecycle log).
    try {
      const [notifyRows] = await pool.execute(
        `SELECT id, tenant_id, status, name, email, mobile, issue_title, description, user_id,
                product, module, issue_type, issue_type_other, priority, assigned_to
         FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [ticketId, tenantId]
      );
      if (notifyRows.length > 0) {
        await ticketEventNotificationService.notifyStatusChanged({
          ticket: notifyRows[0],
          tenantId,
          previousStatus: 'resolved',
          newStatus: 'in_progress',
          actorId: actorId ?? null,
          actorName: actor.name || actor.email || 'Customer'
        });
        try {
          const appNotificationService = require('../services/appNotificationService');
          await appNotificationService.notifyReopenReasonInApp(pool, {
            tenantId,
            ticketId: Number(ticketId),
            reason
          });
        } catch (inAppErr) {
          console.warn('⚠️ In-app reopen reason notification failed:', inAppErr?.message);
        }
      }
    } catch (e) {
      console.warn('Could not run reject-resolution status notifications:', e?.message);
    }

    return res.json({
      success: true,
      message: 'Resolution rejected and ticket reopened',
      data: { ticketId: Number(ticketId), status: 'in_progress' }
    });
  } catch (error) {
    console.error('Error rejecting resolution:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject resolution' });
  }
});

module.exports = router;