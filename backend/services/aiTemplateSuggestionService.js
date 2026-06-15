const { getNvidiaClient } = require('./nvidiaAiService');

const MAX_SUGGESTIONS = 4;
const MIN_SUGGESTIONS = 3;
const MAX_SUGGESTION_LEN = 140;

const USER_ROLES = new Set(['user', 'customer']);

const USER_FALLBACKS = [
  'Please check this once again.',
  'I am still facing the same issue.',
  'Thank you for the update.'
];

const STAFF_FALLBACKS = [
  'We are checking this issue.',
  'Could you please share more details?',
  'Please confirm whether the issue still persists.'
];

const SMALL_TALK_USER = {
  greeting: ['Hi, I need help with this ticket.', 'Hello, could you please check this issue?', 'Good day, I need an update on this ticket.'],
  thanks: ['Thank you for your support.', 'Thanks, I appreciate the quick update.', 'Thank you, this is helpful.'],
  ack: ['Okay, I will check and update.', 'Understood, I will try this and confirm.', 'Noted, I will get back to you shortly.'],
  bye: ['Thanks again, I will close this for now.', 'Okay, I will reconnect if needed.', 'Thank you. Have a good day.']
};

const SMALL_TALK_STAFF = {
  greeting: ['Hello, how can I assist you today?', 'Hi, please share the issue details.', 'Hello, I am here to help with your ticket.'],
  thanks: ['You are welcome.', 'Glad to help.', 'Happy to assist.'],
  ack: ['Noted. We will proceed accordingly.', 'Understood. We are checking this now.', 'Okay. We will update you shortly.'],
  bye: ['Thank you. Reach out if you need further help.', 'Have a good day.', 'Closing this update for now.']
};

function isEndUserRole(role) {
  return USER_ROLES.has(String(role || '').toLowerCase());
}

function normalizeSuggestions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();

  for (const item of list) {
    const value = String(item || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    if (value.length > MAX_SUGGESTION_LEN) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_SUGGESTIONS) break;
  }

  return out;
}

function getFallbacks(role) {
  return isEndUserRole(role) ? USER_FALLBACKS : STAFF_FALLBACKS;
}

function normalizeText(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function classifySmallTalk(draftMessage) {
  const t = normalizeText(draftMessage).replace(/[.!?,]/g, '');
  if (!t) return null;
  if (/^(hi|hello|hey|hii|helo)\b/.test(t) || /\b(good morning|good afternoon|good evening)\b/.test(t)) return 'greeting';
  if (/\b(thanks|thank you|thankyou|thx|ty|welcome|you are welcome|happy to help|glad to help)\b/.test(t)) return 'thanks';
  if (/\b(ok|okay|kk|got it|gotcha|understood|alright|all right|noted|roger)\b/.test(t)) return 'ack';
  if (/\b(bye|goodbye|see you|cya|talk later)\b/.test(t)) return 'bye';
  return null;
}

function smallTalkSuggestions(role, kind) {
  if (!kind) return null;
  const source = isEndUserRole(role) ? SMALL_TALK_USER : SMALL_TALK_STAFF;
  return source[kind] || null;
}

function buildPrompt({ ticket, role, recentMessages, draftMessage }) {
  const roleKind = isEndUserRole(role) ? 'end_user' : 'support_staff';
  const messages = Array.isArray(recentMessages) ? recentMessages.slice(-10) : [];

  const compactMessages = messages.map((m) => ({
    senderType: String(m?.sender_type || '').toLowerCase(),
    senderName: String(m?.sender_name || '').slice(0, 50),
    message: String(m?.message || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  }));

  return `Generate smart reply templates for ITSM ticket support chat.

Current writer role: ${roleKind}

Rules:
- Return JSON only: {"suggestions":["...", "...", "..."]}
- Provide 3 to 5 suggestions.
- Each suggestion must be short (max 20 words), professional, and ready to send.
- No markdown, no bullets, no numbering, no explanations.
- Avoid duplicates and generic repetition.
- Do not include placeholders like [name] or [ticket].
- Do not suggest actions outside normal support chat.
- These are suggestions only (not auto-send commands).

Tone rules:
- If current writer role is end_user: use follow-up, clarification, confirmation, complaint, acknowledgment style.
- If current writer role is support_staff: use acknowledgment, troubleshooting request, investigation update, resolution confirmation style.

Ticket context:
${JSON.stringify({
  issue_title: ticket?.issue_title || null,
  description: String(ticket?.description || '').slice(0, 500),
  priority: ticket?.priority || 'medium',
  status: ticket?.status || 'new',
  product: ticket?.product || null,
  module: ticket?.module || null
})}

Recent conversation:
${JSON.stringify(compactMessages)}

Current draft message being typed:
${JSON.stringify(String(draftMessage || '').slice(0, 280))}`;
}

async function generateTicketReplySuggestions({ ticket, role, recentMessages, draftMessage }) {
  const fallback = getFallbacks(role);
  const quickSuggestions = smallTalkSuggestions(role, classifySmallTalk(draftMessage));
  if (Array.isArray(quickSuggestions) && quickSuggestions.length >= MIN_SUGGESTIONS) {
    return quickSuggestions.slice(0, MAX_SUGGESTIONS);
  }
  try {
    const client = getNvidiaClient();
    const systemPrompt = 'You are an ITSM support reply suggestion engine.';
    const prompt = buildPrompt({ ticket, role, recentMessages, draftMessage });
    const json = await client.jsonResponse(prompt, systemPrompt, 0.2, 420);
    const suggestions = normalizeSuggestions(json?.suggestions);
    if (suggestions.length >= MIN_SUGGESTIONS) {
      return suggestions;
    }
    return fallback;
  } catch (error) {
    console.error('AI template suggestions failed:', error?.message || error);
    return fallback;
  }
}

module.exports = {
  generateTicketReplySuggestions,
  normalizeSuggestions
};
