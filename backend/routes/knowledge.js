const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../middleware/tenant');

router.use(setTenantContext);

const STAFF_ROLES = ['support_agent', 'agent', 'support_manager', 'manager', 'ceo', 'admin'];
const MANAGER_ROLES = ['support_manager', 'manager', 'ceo', 'admin'];

let knowledgeSchemaEnsured = false;
let ticketsCategoryColumnExists = null;
const ensureKnowledgeBaseSchema = async () => {
  if (knowledgeSchemaEnsured) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      source_ticket_id INT NOT NULL,
      title TEXT NULL,
      issue_type TEXT NULL,
      category TEXT NULL,
      resolution LONGTEXT NULL,
      resolution_summary TEXT NULL,
      tags TEXT NULL,
      search_keywords TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_knowledge_ticket (tenant_id, source_ticket_id),
      KEY idx_knowledge_tenant_created (tenant_id, created_at),
      CONSTRAINT fk_knowledge_ticket FOREIGN KEY (source_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  knowledgeSchemaEnsured = true;
};

const hasTicketsCategoryColumn = async () => {
  if (ticketsCategoryColumnExists !== null) return ticketsCategoryColumnExists;
  const [rows] = await pool.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tickets'
       AND COLUMN_NAME = 'category'
     LIMIT 1`
  );
  ticketsCategoryColumnExists = rows.length > 0;
  return ticketsCategoryColumnExists;
};

const backfillKnowledgeFromHistoricalTickets = async (tenantId) => {
  await ensureKnowledgeBaseSchema();
  const hasCategory = await hasTicketsCategoryColumn();
  const categorySel = hasCategory ? 't.category' : 'NULL';

  await pool.execute(
    `INSERT INTO knowledge_base
      (tenant_id, source_ticket_id, title, issue_type, category, resolution, resolution_summary, created_at, updated_at)
     SELECT
       t.tenant_id,
       t.id AS source_ticket_id,
       NULLIF(TRIM(COALESCE(t.issue_title, CONCAT('Ticket #', t.id, ' resolution'))), '') AS title,
       NULLIF(TRIM(COALESCE(t.issue_type, '')), '') AS issue_type,
       ${categorySel} AS category,
       NULLIF(TRIM(COALESCE(rd.internal_steps, rd.resolution_summary, '')), '') AS resolution,
       LEFT(
         NULLIF(TRIM(COALESCE(rd.resolution_summary, rd.internal_steps, '')), ''),
         200
       ) AS resolution_summary,
       COALESCE(t.closed_at, t.resolved_at, t.updated_at, NOW()) AS created_at,
       NOW() AS updated_at
     FROM tickets t
     INNER JOIN ticket_resolution_details rd
       ON rd.ticket_id = t.id AND rd.tenant_id = t.tenant_id
     WHERE t.tenant_id = ?
       AND LOWER(COALESCE(t.status, '')) IN ('resolved', 'closed')
       AND NULLIF(TRIM(COALESCE(rd.internal_steps, rd.resolution_summary, '')), '') IS NOT NULL
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       issue_type = VALUES(issue_type),
       category = VALUES(category),
       resolution = VALUES(resolution),
       resolution_summary = VALUES(resolution_summary),
       updated_at = NOW()`,
    [tenantId]
  );
};

const requireStaff = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (!STAFF_ROLES.includes(role)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  return next();
};

const requireManager = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (!MANAGER_ROLES.includes(role)) {
    return res.status(403).json({ success: false, message: 'Only managers can edit knowledge entries.' });
  }
  return next();
};

// GET /api/knowledge?q=&issue_type=
router.get('/', authenticateToken, verifyTenantAccess, requireStaff, async (req, res) => {
  try {
    await ensureKnowledgeBaseSchema();
    const tenantId = req.tenantId || 1;
    await backfillKnowledgeFromHistoricalTickets(tenantId);
    const q = String(req.query.q || '').trim();
    const issueType = String(req.query.issue_type || '').trim();

    let sql = `
      SELECT id, source_ticket_id, title, issue_type, category, resolution_summary, created_at, updated_at
      FROM knowledge_base
      WHERE tenant_id = ?
    `;
    const params = [tenantId];

    if (issueType) {
      sql += ' AND LOWER(COALESCE(issue_type, "")) = LOWER(?)';
      params.push(issueType);
    }
    if (q) {
      sql += `
        AND (
          LOWER(COALESCE(title, "")) LIKE LOWER(?)
          OR LOWER(COALESCE(resolution_summary, "")) LIKE LOWER(?)
          OR LOWER(COALESCE(resolution, "")) LIKE LOWER(?)
          OR LOWER(COALESCE(search_keywords, "")) LIKE LOWER(?)
        )
      `;
      const like = `%${q}%`;
      const exact = q.toLowerCase();
      params.push(like, like, like, like);
      sql += `
        ORDER BY
          (
            CASE
              WHEN LOWER(COALESCE(title, '')) = ? THEN 120
              WHEN LOWER(COALESCE(title, '')) LIKE ? THEN 90
              WHEN LOWER(COALESCE(resolution_summary, '')) LIKE ? THEN 70
              WHEN LOWER(COALESCE(issue_type, '')) LIKE ? THEN 50
              WHEN LOWER(COALESCE(resolution, '')) LIKE ? THEN 30
              ELSE 0
            END
          ) DESC,
          updated_at DESC
      `;
      params.push(
        exact,
        `${exact}%`,
        `%${exact}%`,
        `%${exact}%`,
        `%${exact}%`
      );
    } else {
      sql += ' ORDER BY updated_at DESC';
    }

    const [rows] = await pool.execute(sql, params);
    return res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error fetching knowledge entries:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch knowledge entries.' });
  }
});

// GET /api/knowledge/:id
router.get('/:id', authenticateToken, verifyTenantAccess, requireStaff, async (req, res) => {
  try {
    await ensureKnowledgeBaseSchema();
    const tenantId = req.tenantId || 1;
    const knowledgeId = Number(req.params.id);
    if (!knowledgeId) return res.status(400).json({ success: false, message: 'Invalid knowledge entry id.' });

    const [rows] = await pool.execute(
      `SELECT id, source_ticket_id, title, issue_type, category, resolution, resolution_summary, tags, search_keywords, created_at, updated_at
       FROM knowledge_base
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [knowledgeId, tenantId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Knowledge entry not found.' });
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching knowledge entry:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch knowledge entry.' });
  }
});

// PUT /api/knowledge/:id (manager only)
router.put('/:id', authenticateToken, verifyTenantAccess, requireManager, async (req, res) => {
  try {
    await ensureKnowledgeBaseSchema();
    const tenantId = req.tenantId || 1;
    const knowledgeId = Number(req.params.id);
    if (!knowledgeId) return res.status(400).json({ success: false, message: 'Invalid knowledge entry id.' });

    const title = String(req.body?.title || '').trim() || null;
    const resolutionSummary = String(req.body?.resolution_summary || '').trim() || null;
    const resolution = String(req.body?.resolution || '').trim() || null;
    if (!title && !resolutionSummary && !resolution) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    await pool.execute(
      `UPDATE knowledge_base
       SET title = COALESCE(?, title),
           resolution_summary = COALESCE(?, resolution_summary),
           resolution = COALESCE(?, resolution),
           updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [title, resolutionSummary, resolution, knowledgeId, tenantId]
    );

    const [rows] = await pool.execute(
      `SELECT id, source_ticket_id, title, issue_type, category, resolution, resolution_summary, updated_at
       FROM knowledge_base
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [knowledgeId, tenantId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Knowledge entry not found.' });
    return res.json({ success: true, message: 'Knowledge entry updated.', data: rows[0] });
  } catch (error) {
    console.error('Error updating knowledge entry:', error);
    return res.status(500).json({ success: false, message: 'Failed to update knowledge entry.' });
  }
});

module.exports = {
  router,
  ensureKnowledgeBaseSchema
};
