const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pool } = require('../database');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../middleware/tenant');
const { generateFaqEmbedding, preprocessQuery, keywordScore, scoreFaqsSemantically } = require('../services/faqSemanticSearchService');

router.use(setTenantContext);

async function resolveCanonicalProductName({ tenantId, product }) {
  const raw = String(product || '').trim();
  if (!raw) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT name
       FROM products
       WHERE tenant_id = ?
         AND status = 'active'
         AND LOWER(name) = LOWER(?)
       LIMIT 1`,
      [tenantId, raw]
    );
    const name = String(rows?.[0]?.name || '').trim();
    return name || null;
  } catch {
    return null;
  }
}

// --- Lightweight in-memory caching (no external infra) ---
// Enable with CACHE_ENABLED=1.
const CACHE_ENABLED = process.env.CACHE_ENABLED === '1';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 45_000);
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only Excel (.xlsx, .xls) or CSV files allowed'));
  }
});

// GET /api/faqs?product=GRC&category=Billing&search=password
// Public - no auth required (FAQs are help content)
router.get('/', async (req, res) => {
  try {
    const { product, category, search } = req.query;
    const random = String(req.query.random || '') === '1';
    const perProduct = String(req.query.per_product || '') === '1';
    const semanticEnabled = String(req.query.semantic || '1') === '1';
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10000) : 8;
    let tenantId = req.tenantId || 1;

    const cacheKey = `faqs:list:v1:tenant=${tenantId}:product=${String(product || '')}:category=${String(category || '')}:search=${String(search || '')}:semantic=${semanticEnabled ? 1 : 0}:limit=${limit}:random=${random ? 1 : 0}:per_product=${perProduct ? 1 : 0}`;
    const cached = cacheGet(cacheKey);
    if (!random && !perProduct && cached) {
      return res.json({ success: true, data: cached, meta: { mode: 'cache' }, cached: true });
    }

    // NOTE: "tags" / "faq_embedding" may not exist on older DBs; when absent we skip it.
    const [colRows] = await pool.execute(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'faqs'
         AND COLUMN_NAME IN ('tags', 'faq_embedding')`
    );
    const colSet = new Set((colRows || []).map((r) => String(r?.COLUMN_NAME || '').toLowerCase()).filter(Boolean));
    const hasTags = colSet.has('tags');
    const hasEmbedding = colSet.has('faq_embedding');

    let sql = `SELECT id, product, category, question, answer${hasTags ? ', tags' : ''} FROM faqs WHERE tenant_id = ?`;
    const params = [tenantId];

    if (product) {
      sql += ' AND (product = ? OR LOWER(product) = LOWER(?))';
      params.push(product, product);
    }
    if (category) {
      sql += ' AND (category = ? OR LOWER(category) = LOWER(?))';
      params.push(category, category);
    }

    const rawSearch = String(search || '').trim();
    const normalizedSearch = rawSearch.toLowerCase();
    const debugSemantic = process.env.DEBUG_FAQ_SEMANTIC === '1';
    let semanticAttempted = false;

    // Landing mode: return one FAQ per product (capped by limit) so "All Products" isn't biased.
    if (perProduct && !product && !category && !rawSearch) {
      const maxProducts = Math.min(Math.max(limit || 6, 1), 20);
      const [prodRows] = await pool.execute(
        `SELECT name
         FROM products
         WHERE tenant_id = ?
           AND status = 'active'
           AND name IS NOT NULL
           AND TRIM(name) <> ''
         ORDER BY name ASC
         LIMIT ${maxProducts}`,
        [tenantId]
      );
      const products = (prodRows || [])
        .map((r) => String(r.name || '').trim())
        .filter(Boolean);
      const out = [];
      for (const p of products) {
        const [one] = await pool.execute(
          `SELECT id, product, category, question, answer${hasTags ? ', tags' : ''}
           FROM faqs
           WHERE tenant_id = ?
             AND (product = ? OR LOWER(product) = LOWER(?))
           ORDER BY ${random ? 'RAND()' : 'updated_at DESC'}
           LIMIT 1`,
          [tenantId, p, p]
        );
        if (one?.[0]) out.push(one[0]);
      }
      return res.json({ success: true, data: out, meta: { mode: 'per_product', randomized: random } });
    }

    // Hybrid search: keyword (fuzzy/partial) + semantic (embeddings).
    // Applies only when search query is present; otherwise fall back to existing list behavior.
    if (rawSearch) {
      const queryTokens = preprocessQuery(rawSearch);
      const queryPhrase = String(rawSearch || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Fetch at most 100 candidates for performance.
      const maxCandidates = 100;
      const selectEmbedding = semanticEnabled && hasEmbedding ? ', faq_embedding' : '';
      const selectTags = hasTags ? ', tags' : '';
      const candSql =
        `SELECT id, product, category, question, answer${selectTags}${selectEmbedding}
         FROM faqs
         WHERE tenant_id = ?` +
        (product ? ' AND (product = ? OR LOWER(product) = LOWER(?))' : '') +
        (category ? ' AND (category = ? OR LOWER(category) = LOWER(?))' : '') +
        ' ORDER BY updated_at DESC' +
        ` LIMIT ${maxCandidates}`;
      const candParams = [tenantId];
      if (product) candParams.push(product, product);
      if (category) candParams.push(category, category);
      const [candidates] = await pool.execute(candSql, candParams);

      // Keyword scoring (always available).
      const productBoost = Boolean(product);
      const categoryBoost = Boolean(category);
      const scoredKeyword = (candidates || []).map((f) => ({
        faq: f,
        keyword_score: keywordScore({ queryTokens, queryPhrase, faq: f, productBoost, categoryBoost })
      }));

      // Semantic scoring (optional; fallback to keyword on failure).
      let semanticMap = new Map();
      let semanticOk = false;
      if (semanticEnabled && hasEmbedding) {
        semanticAttempted = true;
        try {
          semanticMap = await scoreFaqsSemantically({ query: rawSearch, faqs: candidates || [] });
          semanticOk = true;
        } catch (e) {
          console.warn('FAQ semantic scoring failed; falling back to keyword-only:', e?.message || e);
          semanticOk = false;
        }
      }

      const tokenCount = queryTokens.length;
      const semanticW = tokenCount < 2 ? 0.4 : 0.7;
      const keywordW = 1 - semanticW;

      const combined = [];
      for (const row of scoredKeyword) {
        const id = Number(row?.faq?.id);
        const semRaw = semanticOk ? Number(semanticMap.get(id)) : NaN; // typically [-1, 1]
        const sem01 = Number.isFinite(semRaw) ? Math.max(0, Math.min(1, (semRaw + 1) / 2)) : 0;
        const kw01 = Number(row.keyword_score || 0);
        const final = semanticOk
          ? (sem01 * semanticW + kw01 * keywordW)
          : kw01;
        if (final < 0.5) continue;
        combined.push({
          ...row.faq,
          semantic_score: Number.isFinite(semRaw) ? semRaw : null,
          keyword_score: kw01,
          final_score: final
        });
      }

      combined.sort((a, b) => (b.final_score - a.final_score) || (b.keyword_score - a.keyword_score));
      const top = combined.slice(0, Math.max(1, Math.min(limit, 8)));
      if (debugSemantic) {
        console.log('[faq-hybrid]', {
          q: rawSearch,
          tenantId,
          product: product || null,
          category: category || null,
          candidates: Array.isArray(candidates) ? candidates.length : 0,
          returned: top.length,
          semantic: semanticOk
        });
      }
      return res.json({
        success: true,
        data: top,
        meta: { mode: 'hybrid', semantic_used: semanticOk, fallback_used: semanticAttempted && !semanticOk }
      });
    }

    // No search term: return default listing behavior (keyword list, random, per_product).
    // MySQL prepared statements can be finicky about LIMIT placeholders depending on server/driver settings.
    // Since limit is fully validated/clamped above, interpolate it safely as a literal.
    if (normalizedSearch) {
      const exact = normalizedSearch;
      const partial = `%${normalizedSearch}%`;
      sql += hasTags
        ? ` ORDER BY
            CASE
              WHEN LOWER(question) = ? THEN 0
              WHEN LOWER(question) LIKE ? THEN 1
              WHEN LOWER(answer) LIKE ? THEN 2
              WHEN LOWER(tags) LIKE ? THEN 3
              ELSE 4
            END,
            category,
            question`
        : ` ORDER BY
            CASE
              WHEN LOWER(question) = ? THEN 0
              WHEN LOWER(question) LIKE ? THEN 1
              WHEN LOWER(answer) LIKE ? THEN 2
              ELSE 3
            END,
            category,
            question`;
      params.push(exact, partial, partial);
      if (hasTags) params.push(partial);
    } else {
      if (random && !product && !category && !rawSearch) {
        sql += ' ORDER BY RAND()';
      } else {
        sql += ' ORDER BY category, question';
      }
    }
    sql += ` LIMIT ${limit}`;
    const [rows] = await pool.execute(sql, params);
    const payload = { success: true, data: rows, meta: { mode: 'list' } };
    if (!random && !perProduct) cacheSet(cacheKey, rows);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/faqs error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/faqs/categories?product=GRC
router.get('/categories', async (req, res) => {
  try {
    const { product } = req.query;
    let tenantId = req.tenantId || 1;

    let sql = 'SELECT DISTINCT category FROM faqs WHERE tenant_id = ?';
    const params = [tenantId];
    if (product) {
      sql += ' AND (product = ? OR LOWER(product) = LOWER(?))';
      params.push(product, product);
    }
    sql += ' ORDER BY category';

    const [rows] = await pool.execute(sql, params);
    res.json({ success: true, data: rows.map(r => r.category) });
  } catch (err) {
    console.error('GET /api/faqs/categories error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/faqs/products - list products for dropdown (from products table only)
router.get('/products', async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const fromProducts = await pool.execute(
      'SELECT name FROM products WHERE tenant_id = ? AND status = ? ORDER BY name',
      [tenantId, 'active']
    ).then(([rows]) => (rows || []).map(r => r?.name).filter(Boolean));
    res.json({ success: true, data: fromProducts });
  } catch (err) {
    console.error('GET /api/faqs/products error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Admin routes (CEO only) ---

// POST /api/faqs/reconcile-products
// Normalize existing FAQ.product values to canonical products.name (case-insensitive match).
router.post('/reconcile-products', authenticateToken, authorizeRole(['ceo']), verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const [result] = await pool.execute(
      `UPDATE faqs f
       JOIN products p
         ON p.tenant_id = f.tenant_id
        AND p.status = 'active'
        AND LOWER(p.name) = LOWER(f.product)
       SET f.product = p.name
       WHERE f.tenant_id = ?`,
      [tenantId]
    );
    return res.json({ success: true, data: { updated_rows: Number(result?.affectedRows || 0) } });
  } catch (err) {
    console.error('POST /api/faqs/reconcile-products error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/faqs
router.post('/', authenticateToken, authorizeRole(['ceo']), verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const { product, category, question, answer } = req.body;
    if (!product || !category || !question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'product, category, question, and answer are required'
      });
    }
    const canonicalProduct = await resolveCanonicalProductName({ tenantId, product });
    if (!canonicalProduct) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product. Product must exist in products table.'
      });
    }
    const [result] = await pool.execute(
      `INSERT INTO faqs (product, category, question, answer, tenant_id)
       VALUES (?, ?, ?, ?, ?)`,
      [canonicalProduct, String(category).trim(), String(question).trim(), String(answer).trim(), tenantId]
    );
    const insertedId = result.insertId;
    res.status(201).json({
      success: true,
      message: 'FAQ added',
      data: { id: insertedId, product: canonicalProduct, category, question, answer }
    });

    // Best-effort semantic setup: compute embedding after insert (does not affect create flow on failure).
    try {
      const embedding = await generateFaqEmbedding({ question, answer });
      await pool.execute(
        'UPDATE faqs SET faq_embedding = ? WHERE id = ? AND tenant_id = ?',
        [JSON.stringify(embedding), insertedId, tenantId]
      );
    } catch (e) {
      console.warn('FAQ embedding generation (POST) failed:', e?.message || e);
    }
  } catch (err) {
    console.error('POST /api/faqs error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/faqs/:id
router.put('/:id', authenticateToken, authorizeRole(['ceo']), verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const id = parseInt(req.params.id, 10);
    const { product, category, question, answer } = req.body;
    if (!product || !category || !question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'product, category, question, and answer are required'
      });
    }
    const canonicalProduct = await resolveCanonicalProductName({ tenantId, product });
    if (!canonicalProduct) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product. Product must exist in products table.'
      });
    }
    const [result] = await pool.execute(
      `UPDATE faqs SET product=?, category=?, question=?, answer=? WHERE id=? AND tenant_id=?`,
      [canonicalProduct, String(category).trim(), String(question).trim(), String(answer).trim(), id, tenantId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    res.json({ success: true, message: 'FAQ updated' });

    // Best-effort: refresh embedding after update.
    try {
      const embedding = await generateFaqEmbedding({ question, answer });
      await pool.execute(
        'UPDATE faqs SET faq_embedding = ? WHERE id = ? AND tenant_id = ?',
        [JSON.stringify(embedding), id, tenantId]
      );
    } catch (e) {
      console.warn('FAQ embedding generation (PUT) failed:', e?.message || e);
    }
  } catch (err) {
    console.error('PUT /api/faqs/:id error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/faqs/reindex-embeddings (CEO only) - generate embeddings for missing rows
router.post('/reindex-embeddings', authenticateToken, authorizeRole(['ceo']), verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const limit = Math.min(Math.max(Number.parseInt(req.body?.limit, 10) || 50, 1), 500);

    const [rows] = await pool.execute(
      `SELECT id, question, answer
       FROM faqs
       WHERE tenant_id = ? AND (faq_embedding IS NULL OR faq_embedding = 'null')
       ORDER BY updated_at DESC
       LIMIT ?`,
      [tenantId, limit]
    );

    let updated = 0;
    for (const r of rows) {
      try {
        const embedding = await generateFaqEmbedding({ question: r.question, answer: r.answer });
        await pool.execute(
          'UPDATE faqs SET faq_embedding = ? WHERE id = ? AND tenant_id = ?',
          [JSON.stringify(embedding), r.id, tenantId]
        );
        updated += 1;
      } catch (e) {
        console.warn('FAQ embedding generation (reindex) failed for id', r?.id, e?.message || e);
      }
    }

    return res.json({
      success: true,
      message: `Reindex complete (${updated}/${rows.length})`,
      data: { processed: rows.length, updated }
    });
  } catch (e) {
    console.error('POST /api/faqs/reindex-embeddings error:', e?.message || e);
    return res.status(500).json({ success: false, message: e.message || 'Reindex failed' });
  }
});

// DELETE /api/faqs/:id
router.delete('/:id', authenticateToken, authorizeRole(['ceo']), verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const id = parseInt(req.params.id, 10);
    const [result] = await pool.execute('DELETE FROM faqs WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    res.json({ success: true, message: 'FAQ deleted' });
  } catch (err) {
    console.error('DELETE /api/faqs/:id error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/faqs/bulk-import - upload Excel/CSV
router.post('/bulk-import', authenticateToken, authorizeRole(['ceo']), verifyTenantAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const tenantId = req.tenantId || 1;
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const rows = [];

    if (ext === '.csv') {
      const text = req.file.buffer.toString('utf8');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const pIdx = headers.findIndex(h => h === 'product');
      const cIdx = headers.findIndex(h => h === 'category');
      const qIdx = headers.findIndex(h => h === 'question');
      const aIdx = headers.findIndex(h => h === 'answer');
      if (pIdx < 0 || cIdx < 0 || qIdx < 0 || aIdx < 0) {
        return res.status(400).json({ success: false, message: 'CSV must have Product, Category, Question, Answer columns' });
      }
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        const product = (cells[pIdx] || '').trim();
        const category = (cells[cIdx] || '').trim();
        const question = (cells[qIdx] || '').trim();
        const answer = (cells[aIdx] || '').trim();
        if (product && category && question && answer) rows.push({ product, category, question, answer });
      }
    } else {
      let XLSX;
      try {
        XLSX = require('xlsx');
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Excel support requires xlsx package. Run: npm install xlsx' });
      }
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!data.length) {
        return res.status(400).json({ success: false, message: 'Excel file is empty' });
      }
      const headers = (data[0] || []).map(h => String(h).trim().toLowerCase());
      const pIdx = headers.findIndex(h => h === 'product');
      const cIdx = headers.findIndex(h => h === 'category');
      const qIdx = headers.findIndex(h => h === 'question');
      const aIdx = headers.findIndex(h => h === 'answer');
      if (pIdx < 0 || cIdx < 0 || qIdx < 0 || aIdx < 0) {
        return res.status(400).json({ success: false, message: 'Excel must have Product, Category, Question, Answer columns' });
      }
      for (let i = 1; i < data.length; i++) {
        const row = data[i] || [];
        const product = String(row[pIdx] || '').trim();
        const category = String(row[cIdx] || '').trim();
        const question = String(row[qIdx] || '').trim();
        const answer = String(row[aIdx] || '').trim();
        if (product && category && question && answer) rows.push({ product, category, question, answer });
      }
    }

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid FAQ rows found' });
    }

    let inserted = 0;
    for (const r of rows) {
      try {
        await pool.execute(
          `INSERT INTO faqs (product, category, question, answer, tenant_id) VALUES (?, ?, ?, ?, ?)`,
          [r.product, r.category, r.question, r.answer, tenantId]
        );
        inserted++;
      } catch (e) {
        console.warn('Skipping duplicate or invalid row:', r, e.message);
      }
    }

    res.json({
      success: true,
      message: `Imported ${inserted} FAQ(s)`,
      data: { imported: inserted, total: rows.length }
    });
  } catch (err) {
    console.error('POST /api/faqs/bulk-import error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || c === '\n') {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

module.exports = router;
