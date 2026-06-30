/**
 * HCMS AI Assistant API (v2)
 * Employee-only assistant endpoint for the HCMS Employee Portal.
 * Base: /api/v2/ai
 */

const express = require('express');
const { getNvidiaClient } = require('../../services/nvidiaAiService');
const { buildSystemContent } = require('../../services/hcmsAssistantPrompt');
const { resolveIntent } = require('../../services/assistantIntentResolver');
const { authenticate, authorizeRoles } = require('../../../auth/middleware/auth.middleware');
const { ROLES } = require('../../../auth/constants/roles');
const { optionalTenantContext } = require('../../../shared/middleware/tenant');

const router = express.Router();

const MAX_MESSAGES = 24;
const MAX_CONTENT_LEN = 8000;
const MAX_REPLY_CHARS_DEFAULT = 650;
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Resolve a user question to a known HCMS intent and return the standard response.
 * If the intent is ambiguous, return a clarification question. If no intent is
 * detected, return null so the LLM can handle it.
 */
function findIntentReply(text) {
  const result = resolveIntent(text);
  if (result.confidence === 'high') {
    return { reply: result.response, quickReply: true };
  }
  if (result.confidence === 'ambiguous') {
    return { reply: result.clarification, quickReply: true, clarification: true };
  }
  return null;
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
  const t = normalizeText(text).replace(/[.!?,.]/g, '');
  if (!t) return null;
  if (/^(hi|hello|hey|hii|helo)$/.test(t)) return 'greeting';
  if (/^(thanks|thank you|thankyou|thx|ty)$/.test(t)) return 'thanks';
  if (/^(ok|okay|kk|got it|understood|alright|all right|noted)$/.test(t)) return 'ack';
  if (/^(bye|goodbye|see you|cya|talk later)$/.test(t)) return 'bye';
  return null;
}

function smallTalkReply(kind) {
  switch (kind) {
    case 'greeting': return 'Hello! How can I help you with HCMS today?';
    case 'thanks': return "You're welcome! Let me know if there's anything else I can help with.";
    case 'ack': return 'Got it. Let me know if you need anything else.';
    case 'bye': return 'Goodbye! Feel free to reach out if you need help with HCMS.';
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

  const clipped = text.slice(0, MAX_REPLY_CHARS_DEFAULT);
  const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('\n'));
  if (sentenceEnd > 120) {
    return `${clipped.slice(0, sentenceEnd + 1).trim()}`;
  }
  return `${clipped.trim()}...`;
}

/**
 * GET /api/v2/ai/health
 * Tests NVIDIA API credentials and connectivity.
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
 * POST /api/v2/ai/assistant
 * Authenticated HCMS employee assistant (NVIDIA). Does not mutate cases.
 * Body: { messages: [{ role: 'user'|'assistant', content: string }], context?: object }
 */
router.post(
  '/assistant',
  optionalTenantContext,
  authenticate,
  authorizeRoles(ROLES.EMPLOYEE),
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

      const intentReply = findIntentReply(latestUserMessage);
      if (intentReply) {
        return res.json({
          success: true,
          data: { reply: intentReply.reply, quickReply: true, clarification: intentReply.clarification || false }
        });
      }

      const allowLong = needsDetailedAnswer(latestUserMessage);

      const context = req.body?.context;
      const systemContent = buildSystemContent(
        latestUserMessage,
        typeof context === 'object' && context !== null ? context : {}
      );

      const openAiMessages = [{ role: 'system', content: systemContent }, ...rawMessages];

      const client = getNvidiaClient();
      const replyPromise = client.chatMessages(
        openAiMessages,
        0.3,
        Math.min(parseInt(process.env.NVIDIA_ASSISTANT_MAX_TOKENS || (allowLong ? '700' : '360'), 10), 1024),
        undefined,
        {}
      );

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Assistant response timed out')), REQUEST_TIMEOUT_MS);
      });

      const reply = await Promise.race([replyPromise, timeoutPromise]);

      return res.json({
        success: true,
        data: { reply: trimAssistantReply(reply, allowLong) }
      });
    } catch (e) {
      console.error('POST /api/v2/ai/assistant error:', e?.message || e);
      const msg = e.message || String(e);
      const isJson = msg.includes('valid JSON');
      const isTimeout = msg.includes('timed out') || msg.includes('timeout');
      return res.status(503).json({
        success: false,
        message: isTimeout
          ? 'The assistant is taking longer than usual. Please try rephrasing your question or ask a specific HCMS question like "How do I create a case?".'
          : isJson
            ? 'Assistant temporarily unavailable.'
            : 'Assistant temporarily unavailable. Please try again in a moment.'
      });
    }
  }
);

module.exports = router;
