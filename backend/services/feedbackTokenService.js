const crypto = require('crypto');

const FEEDBACK_TOKEN_TTL_SECONDS = Number(process.env.FEEDBACK_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 14);

function base64UrlEncode(input) {
  return Buffer.from(String(input), 'utf8').toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(String(input), 'base64url').toString('utf8');
}

function getTokenSecret() {
  return String(
    process.env.FEEDBACK_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    'feedback-dev-secret'
  );
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getTokenSecret()).update(payload).digest('base64url');
}

function createFeedbackToken({ ticketId, tenantId, customerEmail, expiresInSeconds = FEEDBACK_TOKEN_TTL_SECONDS }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ticketId: Number(ticketId),
    tenantId: Number(tenantId),
    customerEmail: String(customerEmail || '').trim().toLowerCase(),
    iat: now,
    exp: now + Number(expiresInSeconds || FEEDBACK_TOKEN_TTL_SECONDS)
  };
  const payloadJson = JSON.stringify(payload);
  const payloadEncoded = base64UrlEncode(payloadJson);
  const signature = signPayload(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

function verifyFeedbackToken(token) {
  try {
    const raw = String(token || '');
    const [payloadEncoded, signature] = raw.split('.');
    if (!payloadEncoded || !signature) return { ok: false, reason: 'invalid_format' };
    const expected = signPayload(payloadEncoded);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return { ok: false, reason: 'invalid_signature' };
    }
    const payload = JSON.parse(base64UrlDecode(payloadEncoded));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || now > Number(payload.exp)) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, payload };
  } catch (_) {
    return { ok: false, reason: 'invalid_token' };
  }
}

module.exports = {
  FEEDBACK_TOKEN_TTL_SECONDS,
  createFeedbackToken,
  verifyFeedbackToken
};

