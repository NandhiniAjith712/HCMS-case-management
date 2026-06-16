const express = require('express');
const { getNvidiaClient } = require('../services/nvidiaAiService');
const { buildSystemContent } = require('../services/itsmAssistantPrompt');
const { generateTicketReplySuggestions } = require('../services/aiTemplateSuggestionService');
const { authenticateToken } = require('../../shared/middleware/auth');
const { verifyTenantAccess } = require('../../shared/middleware/tenant');
const { pool } = require('../../shared/database/database');

const router = express.Router();

const MAX_MESSAGES = 24;
const MAX_CONTENT_LEN = 8000;
const MAX_REPLY_CHARS_DEFAULT = 900;

/** End-user / customer roles only (not staff or business dashboard). */
function assertCustomerAssistantUser(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'user' || role === 'customer') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'The ITSM Support Assistant is only available for customer accounts.'
  });
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const m of input.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    let content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (content.length > MAX_CONTENT_LEN) content = content.slice(0, MAX_CONTENT_LEN);
    if (!content.trim()) continue;
    out.push({ role, content: content.trim() });
  }
  return out;
}

function getLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return messages[i].content || '';
  }
  return '';
}

function normalizeText(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function classifySmallTalk(text) {
  const t = normalizeText(text).replace(/[.!?,]/g, '');
  if (!t) return null;
  if (/^(hi|hello|hey|hii|helo)$/.test(t)) return 'greeting';
  if (/^(thanks|thank you|thankyou|thx|ty)$/.test(t)) return 'thanks';
  if (/^(ok|okay|kk|got it|understood|alright|all right|noted)$/.test(t)) return 'ack';
  if (/^(bye|goodbye|see you|cya|talk later)$/.test(t)) return 'bye';
  return null;
}

function smallTalkReply(kind) {
  switch (kind) {
    case 'greeting': return 'Hello! How can I help you with the ITSM platform?';
    case 'thanks': return "You're welcome!";
    case 'ack': return 'Alright.';
    case 'bye': return 'See you!';
    default: return null;
  }
}

function needsDetailedAnswer(text) {
  const t = normalizeText(text);
  if (!t) return false;
  return /(in detail|detailed|step by step|steps|walk me through|explain more|elaborate|confused|not clear|dont understand|do not understand)/.test(t);
}

function trimAssistantReply(reply, allowLong) {
  const text = String(reply || '').trim();
  if (!text) return text;
  if (allowLong || text.length <= MAX_REPLY_CHARS_DEFAULT) return text;

  // Keep concise answer by clipping after a reasonable sentence boundary.
  const clipped = text.slice(0, MAX_REPLY_CHARS_DEFAULT);
  const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('\n'));
  if (sentenceEnd > 120) {
    return `${clipped.slice(0, sentenceEnd + 1).trim()}`;
  }
  return `${clipped.trim()}...`;
}

/**
 * GET /api/ai/health
 * Tests NVIDIA API credentials and connectivity (no auth — add auth if you expose publicly).
 */
router.get('/health', async (req, res) => {
  try {
    const client = getNvidiaClient();
    const result = await client.healthCheck();
    const ok = result.status === 'success';
    return res.status(ok ? 200 : 503).json({
      success: ok,
      data: result
    });
  } catch (e) {
    const message = e.message || String(e);
    const configured =
      !!(process.env.NVIDIA_API_KEY || '').trim() &&
      !!(process.env.NVIDIA_MODEL || '').trim();
    return res.status(503).json({
      success: false,
      message,
      hint: configured
        ? 'Check NVIDIA_API_KEY, NVIDIA_MODEL, and NVIDIA_BASE_URL in config.env.'
        : 'Set NVIDIA_API_KEY and NVIDIA_MODEL in backend/config.env.'
    });
  }
});

/**
 * POST /api/ai/assistant
 * Authenticated ITSM help assistant (NVIDIA). Does not mutate tickets.
 * Body: { messages: [{ role: 'user'|'assistant', content: string }], context?: object }
 */
router.post(
  '/assistant',
  authenticateToken,
  assertCustomerAssistantUser,
  verifyTenantAccess,
  async (req, res) => {
  try {
    const rawMessages = sanitizeMessages(req.body?.messages);
    if (rawMessages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Send at least one user message in messages[].'
      });
    }
    if (rawMessages[rawMessages.length - 1].role !== 'user') {
      return res.status(400).json({
        success: false,
        message: 'Last message must be from the user.'
      });
    }

    const latestUserMessage = getLastUserMessage(rawMessages);
    const smallTalkKind = classifySmallTalk(latestUserMessage);
    if (smallTalkKind) {
      return res.json({
        success: true,
        data: { reply: smallTalkReply(smallTalkKind), quickReply: true }
      });
    }
    const allowLong = needsDetailedAnswer(latestUserMessage);

    const context = req.body?.context;
    const systemContent = buildSystemContent(
      typeof context === 'object' && context !== null ? context : {}
    );

    const openAiMessages = [{ role: 'system', content: systemContent }, ...rawMessages];

    const client = getNvidiaClient();
    const reply = await client.chatMessages(
      openAiMessages,
      0.3,
      Math.min(parseInt(process.env.NVIDIA_ASSISTANT_MAX_TOKENS || (allowLong ? '900' : '420'), 10), 2048),
      undefined,
      {}
    );

    return res.json({
      success: true,
      data: { reply: trimAssistantReply(reply, allowLong) }
    });
  } catch (e) {
    console.error('POST /api/ai/assistant error:', e?.message || e);
    const msg = e.message || String(e);
    const isJson = msg.includes('valid JSON');
    return res.status(503).json({
      success: false,
      message: isJson
        ? 'Assistant temporarily unavailable.'
        : 'Assistant temporarily unavailable. Please try again in a moment.'
    });
  }
});

/**
 * POST /api/ai/ticket-reply-suggestions
 * Generate 3-4 short reply suggestions for ticket chat.
 * Body: { ticketId: number, draftMessage?: string }
 */
router.post(
  '/ticket-reply-suggestions',
  authenticateToken,
  verifyTenantAccess,
  async (req, res) => {
    try {
      const ticketId = Number(req.body?.ticketId);
      const draftMessage = String(req.body?.draftMessage || '');
      if (!ticketId || Number.isNaN(ticketId)) {
        return res.status(400).json({
          success: false,
          message: 'ticketId is required.'
        });
      }

      let tenantId = req.tenantId;
      let [ticketRows] = await pool.execute(
        `SELECT id, tenant_id, issue_title, description, priority, status, product, module, user_id, email
         FROM tickets
         WHERE id = ? AND tenant_id = ?
         LIMIT 1`,
        [ticketId, tenantId]
      );

      const requesterRole = String(req.user?.role || '').toLowerCase();
      if (ticketRows.length === 0 && (requesterRole === 'user' || requesterRole === 'customer')) {
        [ticketRows] = await pool.execute(
          `SELECT id, tenant_id, issue_title, description, priority, status, product, module, user_id, email
           FROM tickets
           WHERE id = ?
           LIMIT 1`,
          [ticketId]
        );
        if (ticketRows.length > 0) {
          const t = ticketRows[0];
          const isOwner = (t.user_id && Number(t.user_id) === Number(req.user?.id)) ||
            (t.email && t.email.toLowerCase() === String(req.user?.email || '').toLowerCase());
          if (!isOwner) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
          }
          tenantId = t.tenant_id || tenantId || 1;
        }
      }

      if (ticketRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      const [messageRows] = await pool.execute(
        `SELECT sender_type, sender_name, message, created_at
         FROM ticket_messages
         WHERE ticket_id = ? AND tenant_id = ? AND channel = 'platform_chat'
         ORDER BY created_at DESC
         LIMIT 12`,
        [ticketId, tenantId]
      );

      const recentMessages = [...messageRows].reverse();
      const suggestions = await generateTicketReplySuggestions({
        ticket: ticketRows[0],
        role: requesterRole,
        recentMessages,
        draftMessage
      });

      return res.json({
        success: true,
        data: { suggestions }
      });
    } catch (e) {
      console.error('POST /api/ai/ticket-reply-suggestions error:', e?.message || e);
      return res.status(503).json({
        success: false,
        message: 'Could not generate suggestions right now.'
      });
    }
  }
);

module.exports = router;
