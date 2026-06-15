const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { verifyTenantAccess } = require('../middleware/tenant');
const { analyzeFeedbackWithAi } = require('../services/aiFeedbackAnalysisService');
const { verifyFeedbackToken } = require('../services/feedbackTokenService');

const router = express.Router();

let feedbackTableEnsured = false;
const ensureTicketFeedbackTable = async () => {
  if (feedbackTableEnsured) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ticket_feedback (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      ticket_id INT NOT NULL,
      user_id INT NULL,
      rating TINYINT NOT NULL,
      feedback_text TEXT NOT NULL,
      ai_sentiment ENUM('positive','neutral','negative') NULL,
      ai_feedback_summary TEXT NULL,
      ai_key_theme VARCHAR(255) NULL,
      ai_improvement_signal TEXT NULL,
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_feedback_ticket (ticket_id),
      KEY idx_feedback_tenant_submitted (tenant_id, submitted_at),
      KEY idx_feedback_tenant_sentiment (tenant_id, ai_sentiment),
      KEY idx_feedback_tenant_theme (tenant_id, ai_key_theme)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  feedbackTableEnsured = true;
};

const isInternalInsightsRole = (role) => {
  const r = String(role || '').toLowerCase();
  return ['support_manager', 'manager', 'ceo', 'admin'].includes(r);
};

const parseRating = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
};

const getTicketForPublicFeedback = async (ticketId) => {
  const [rows] = await pool.execute(
    `SELECT id, tenant_id, user_id, email, name, status, issue_title, product, module
     FROM tickets
     WHERE id = ?
     LIMIT 1`,
    [ticketId]
  );
  return rows[0] || null;
};

router.get('/public/:ticketId', async (req, res) => {
  try {
    await ensureTicketFeedbackTable();
    const ticketId = Number(req.params.ticketId);
    const token = String(req.query.token || '');
    if (!ticketId || !token) {
      return res.status(400).json({ success: false, message: 'Invalid feedback link.' });
    }

    const tokenCheck = verifyFeedbackToken(token);
    if (!tokenCheck.ok) {
      return res.status(401).json({ success: false, message: 'Feedback link is invalid or expired.' });
    }

    const ticket = await getTicketForPublicFeedback(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }
    if (String(ticket.status || '').toLowerCase() !== 'closed') {
      return res.status(400).json({ success: false, message: 'Feedback is available only after ticket closure.' });
    }

    const payload = tokenCheck.payload || {};
    const tokenTicket = Number(payload.ticketId);
    const tokenTenant = Number(payload.tenantId);
    const tokenEmail = String(payload.customerEmail || '').toLowerCase();
    const ticketEmail = String(ticket.email || '').toLowerCase();
    if (tokenTicket !== ticket.id || tokenTenant !== Number(ticket.tenant_id) || (tokenEmail && ticketEmail && tokenEmail !== ticketEmail)) {
      return res.status(401).json({ success: false, message: 'Feedback link is invalid for this ticket.' });
    }

    const [existing] = await pool.execute(
      'SELECT id, rating, feedback_text, submitted_at FROM ticket_feedback WHERE ticket_id = ? LIMIT 1',
      [ticket.id]
    );

    return res.json({
      success: true,
      data: {
        ticketId: ticket.id,
        issueTitle: ticket.issue_title || 'Support Request',
        product: ticket.product || '',
        customerName: ticket.name || 'Customer',
        alreadySubmitted: existing.length > 0,
        existingFeedback: existing[0] || null
      }
    });
  } catch (error) {
    console.error('Error validating public feedback link:', error);
    return res.status(500).json({ success: false, message: 'Failed to load feedback form.' });
  }
});

router.post('/public/:ticketId', async (req, res) => {
  try {
    await ensureTicketFeedbackTable();
    const ticketId = Number(req.params.ticketId);
    const { token, rating, feedbackText } = req.body || {};
    const normalizedText = String(feedbackText || '').trim();
    const normalizedRating = parseRating(rating);
    if (!ticketId || !token) {
      return res.status(400).json({ success: false, message: 'Invalid feedback request.' });
    }
    if (!normalizedRating) {
      return res.status(400).json({ success: false, message: 'Rating is required (1 to 5).' });
    }
    if (!normalizedText) {
      return res.status(400).json({ success: false, message: 'Feedback text is required.' });
    }

    const tokenCheck = verifyFeedbackToken(token);
    if (!tokenCheck.ok) {
      return res.status(401).json({ success: false, message: 'Feedback link is invalid or expired.' });
    }

    const ticket = await getTicketForPublicFeedback(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }
    if (String(ticket.status || '').toLowerCase() !== 'closed') {
      return res.status(400).json({ success: false, message: 'Feedback can be submitted only for closed tickets.' });
    }

    const payload = tokenCheck.payload || {};
    const tokenTicket = Number(payload.ticketId);
    const tokenTenant = Number(payload.tenantId);
    const tokenEmail = String(payload.customerEmail || '').toLowerCase();
    const ticketEmail = String(ticket.email || '').toLowerCase();
    if (tokenTicket !== ticket.id || tokenTenant !== Number(ticket.tenant_id) || (tokenEmail && ticketEmail && tokenEmail !== ticketEmail)) {
      return res.status(401).json({ success: false, message: 'Feedback link is invalid for this ticket.' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM ticket_feedback WHERE ticket_id = ? LIMIT 1',
      [ticket.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Feedback was already submitted for this ticket.' });
    }

    let ai = null;
    try {
      ai = await analyzeFeedbackWithAi({
        rating: normalizedRating,
        feedbackText: normalizedText,
        product: ticket.product,
        module: ticket.module,
        issueTitle: ticket.issue_title
      });
    } catch (aiError) {
      console.warn('Feedback AI analysis failed:', aiError?.message || aiError);
    }

    await pool.execute(
      `INSERT INTO ticket_feedback
       (tenant_id, ticket_id, user_id, rating, feedback_text, ai_sentiment, ai_feedback_summary, ai_key_theme, ai_improvement_signal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticket.tenant_id,
        ticket.id,
        ticket.user_id || null,
        normalizedRating,
        normalizedText,
        ai?.sentiment || null,
        ai?.summary || null,
        ai?.key_theme || null,
        ai?.improvement_signal || null
      ]
    );

    return res.json({ success: true, message: 'Feedback submitted successfully.' });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit feedback.' });
  }
});

router.get('/insights', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    await ensureTicketFeedbackTable();
    if (!isInternalInsightsRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const tenantId = req.tenantId || req.user?.tenant_id || 1;

    const [overallRows] = await pool.execute(
      `SELECT
        COUNT(*) AS total_feedback,
        ROUND(AVG(rating), 2) AS avg_rating,
        SUM(CASE WHEN ai_sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_count,
        SUM(CASE WHEN ai_sentiment = 'neutral' THEN 1 ELSE 0 END) AS neutral_count,
        SUM(CASE WHEN ai_sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_count
      FROM ticket_feedback
      WHERE tenant_id = ?`,
      [tenantId]
    );

    const [productRows] = await pool.execute(
      `SELECT
        COALESCE(NULLIF(TRIM(t.product), ''), 'Unspecified Product') AS product,
        COUNT(tf.id) AS feedback_count,
        ROUND(AVG(tf.rating), 2) AS avg_rating,
        SUM(CASE WHEN tf.ai_sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_count,
        SUM(CASE WHEN tf.ai_sentiment = 'neutral' THEN 1 ELSE 0 END) AS neutral_count,
        SUM(CASE WHEN tf.ai_sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_count,
        GROUP_CONCAT(tf.ai_key_theme ORDER BY tf.submitted_at DESC SEPARATOR '||') AS raw_themes
      FROM ticket_feedback tf
      INNER JOIN tickets t ON t.id = tf.ticket_id
      WHERE tf.tenant_id = ?
      GROUP BY COALESCE(NULLIF(TRIM(t.product), ''), 'Unspecified Product')
      ORDER BY feedback_count DESC, avg_rating ASC`,
      [tenantId]
    );

    const productInsights = productRows.map((row) => {
      const allThemes = String(row.raw_themes || '')
        .split('||')
        .map((t) => t.trim())
        .filter(Boolean);
      const themeCounts = {};
      allThemes.forEach((theme) => {
        const key = theme.toLowerCase();
        themeCounts[key] = (themeCounts[key] || { label: theme, count: 0 });
        themeCounts[key].count += 1;
      });
      const topThemes = Object.values(themeCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((x) => x.label);

      return {
        product: row.product,
        feedbackCount: Number(row.feedback_count || 0),
        avgRating: Number(row.avg_rating || 0),
        sentiment: {
          positive: Number(row.positive_count || 0),
          neutral: Number(row.neutral_count || 0),
          negative: Number(row.negative_count || 0)
        },
        topThemes
      };
    });

    const [themeRows] = await pool.execute(
      `SELECT ai_key_theme, COUNT(*) AS cnt
       FROM ticket_feedback
       WHERE tenant_id = ? AND ai_key_theme IS NOT NULL AND TRIM(ai_key_theme) <> ''
       GROUP BY ai_key_theme
       ORDER BY cnt DESC
       LIMIT 5`,
      [tenantId]
    );

    const [recentRows] = await pool.execute(
      `SELECT
        tf.ticket_id,
        tf.rating,
        tf.feedback_text,
        tf.ai_sentiment,
        tf.ai_feedback_summary,
        tf.ai_key_theme,
        tf.ai_improvement_signal,
        tf.submitted_at,
        t.product,
        t.issue_title
      FROM ticket_feedback tf
      INNER JOIN tickets t ON t.id = tf.ticket_id
      WHERE tf.tenant_id = ?
      ORDER BY tf.submitted_at DESC
      LIMIT 20`,
      [tenantId]
    );

    return res.json({
      success: true,
      data: {
        overall: {
          totalFeedback: Number(overallRows[0]?.total_feedback || 0),
          avgRating: Number(overallRows[0]?.avg_rating || 0),
          sentiment: {
            positive: Number(overallRows[0]?.positive_count || 0),
            neutral: Number(overallRows[0]?.neutral_count || 0),
            negative: Number(overallRows[0]?.negative_count || 0)
          },
          topThemes: themeRows.map((r) => ({ theme: r.ai_key_theme, count: Number(r.cnt || 0) }))
        },
        productInsights,
        recentFeedback: recentRows
      }
    });
  } catch (error) {
    console.error('Error loading feedback insights:', error);
    return res.status(500).json({ success: false, message: 'Failed to load feedback insights.' });
  }
});

module.exports = router;

