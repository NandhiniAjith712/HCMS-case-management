const { getNvidiaClient } = require('./nvidiaAiService');

function toCleanString(value, fallback = '') {
  const out = String(value || '').replace(/\s+/g, ' ').trim();
  return out || fallback;
}

function validateAnalysis(raw) {
  const summary = toCleanString(raw?.summary, '');
  const keyPoints = Array.isArray(raw?.key_points)
    ? raw.key_points
        .map((p) => toCleanString(p, ''))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const documentType = toCleanString(raw?.document_type, 'Support document');
  const recommendedFocus = toCleanString(raw?.recommended_focus, 'Review the key points and validate against ticket details.');

  if (!summary) {
    return null;
  }

  return {
    summary,
    key_points: keyPoints,
    document_type: documentType,
    recommended_focus: recommendedFocus
  };
}

function fallbackAnalysis(extractedText) {
  const clean = toCleanString(extractedText, '');
  const summary =
    clean.length > 220
      ? `${clean.slice(0, 220).trim()}...`
      : clean || 'The attachment includes issue-related content.';

  return {
    summary,
    key_points: [
      'Review the extracted content for issue-specific clues.',
      'Compare attachment details with ticket description.',
      'Confirm affected module, users, and error pattern.'
    ],
    document_type: 'Support document',
    recommended_focus: 'Validate the reported issue flow and related logs/screenshots.'
  };
}

async function analyzeAttachmentText({ extractedText, ticketContext }) {
  const clippedText = String(extractedText || '').slice(0, 9000);
  const ctx = {
    issue_title: ticketContext?.issue_title || '',
    description: String(ticketContext?.description || '').slice(0, 400),
    product: ticketContext?.product || null,
    module: ticketContext?.module || null,
    priority: ticketContext?.priority || 'medium',
    status: ticketContext?.status || 'new'
  };

  try {
    const client = getNvidiaClient();
    const prompt = `Analyze this ITSM ticket attachment text for support teams.

Return JSON only with keys:
- summary (string)
- key_points (array of 3 to 5 short strings)
- document_type (string)
- recommended_focus (string)

Keep output concise, practical, and issue-focused.
No markdown. No extra keys.

Ticket context:
${JSON.stringify(ctx)}

Attachment text:
${JSON.stringify(clippedText)}`;

    const json = await client.jsonResponse(
      prompt,
      'You are an ITSM document analysis assistant for internal support teams.',
      0.2,
      520
    );

    const validated = validateAnalysis(json);
    if (validated) return { ok: true, analysis: validated };
    return { ok: true, analysis: fallbackAnalysis(clippedText) };
  } catch (error) {
    console.error('AI attachment analysis failed:', error?.message || error);
    return { ok: false, message: 'AI analysis is temporarily unavailable.' };
  }
}

module.exports = {
  analyzeAttachmentText,
  validateAnalysis
};
