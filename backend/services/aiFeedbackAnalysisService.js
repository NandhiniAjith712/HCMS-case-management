const { getNvidiaClient } = require('./nvidiaAiService');

const SENTIMENT_VALUES = ['positive', 'neutral', 'negative'];

function normalizeFeedbackAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sentimentRaw = String(raw.sentiment || '').toLowerCase();
  const sentiment = SENTIMENT_VALUES.includes(sentimentRaw) ? sentimentRaw : 'neutral';
  const summary = String(raw.summary || '').trim().slice(0, 800);
  const keyTheme = String(raw.key_theme || raw.keyTheme || '').trim().slice(0, 255);
  const improvementSignal = String(raw.improvement_signal || raw.improvementSignal || '').trim().slice(0, 800);

  return {
    sentiment,
    summary: summary || 'No clear summary available.',
    key_theme: keyTheme || 'General support experience',
    improvement_signal: improvementSignal || 'Continue monitoring customer feedback.'
  };
}

async function analyzeFeedbackWithAi({ rating, feedbackText, product, module, issueTitle }) {
  const client = getNvidiaClient();
  const promptInput = {
    rating: Number(rating),
    feedback_text: String(feedbackText || '').trim(),
    product: product || null,
    module: module || null,
    issue_title: issueTitle || null
  };

  const response = await client.jsonResponse(
    `Analyze customer support feedback JSON:\n${JSON.stringify(promptInput)}\nReturn only strict JSON with keys: sentiment, summary, key_theme, improvement_signal.`,
    `You are an ITSM feedback analyst.
Rules:
- sentiment must be exactly one of: positive, neutral, negative.
- summary: one concise sentence, max 30 words.
- key_theme: short phrase (2-6 words).
- improvement_signal: one concise actionable line.
- Avoid generic chatbot phrasing.`,
    0.1,
    220
  );

  return normalizeFeedbackAnalysis(response);
}

module.exports = {
  analyzeFeedbackWithAi,
  normalizeFeedbackAnalysis
};

