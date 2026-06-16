const { getNvidiaClient } = require('./nvidiaAiService');

function toCleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set([
  'how', 'do', 'i', 'is', 'the', 'what', 'can', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'at', 'with',
  'my', 'me', 'we', 'us', 'you', 'your', 'it', 'this', 'that', 'these', 'those', 'from', 'are', 'was', 'were', 'be',
  'been', 'being', 'as', 'by', 'if', 'then', 'than', 'when', 'where', 'which', 'who', 'whom', 'why', 'please', 'help'
]);

function normalizeAndTokenize(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return [];
  return s
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);
}

function stemToken(t) {
  const token = String(t || '').trim().toLowerCase();
  if (!token) return '';
  const direct = {
    notification: 'notify',
    notifications: 'notify',
    notifying: 'notify',
    verification: 'verify',
    verified: 'verify',
    verifying: 'verify',
    changes: 'change',
    changed: 'change',
    changing: 'change'
  };
  if (direct[token]) return direct[token];
  // Light suffix stripping (keep conservative)
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  if (token.length > 6 && token.endsWith('tion')) return token.slice(0, -4);
  return token;
}

function preprocessQuery(raw) {
  const tokens = normalizeAndTokenize(raw)
    .map(stemToken)
    .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t));
  // De-dupe, preserve order
  const out = [];
  const seen = new Set();
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;
  const m = s.length;
  const n = t.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,      // deletion
        dp[j - 1] + 1,  // insertion
        prev + cost     // substitution
      );
      prev = tmp;
    }
  }
  return dp[n];
}

function tokenizeFaqFields(faq) {
  const qTokens = normalizeAndTokenize(faq?.question).map(stemToken).filter(Boolean);
  const aTokens = normalizeAndTokenize(faq?.answer).map(stemToken).filter(Boolean);
  const tTokens = normalizeAndTokenize(faq?.tags).map(stemToken).filter(Boolean);
  return {
    questionTokens: qTokens,
    answerTokens: aTokens,
    tagsTokens: tTokens,
    questionText: toCleanText(faq?.question).toLowerCase(),
    combinedText: `${toCleanText(faq?.question)} ${toCleanText(faq?.answer)} ${toCleanText(faq?.tags)}`.toLowerCase()
  };
}

function keywordScore({ queryTokens, queryPhrase, faq, productBoost = false, categoryBoost = false }) {
  const { questionTokens, answerTokens, tagsTokens, questionText, combinedText } = tokenizeFaqFields(faq);
  const qSet = new Set(questionTokens);
  const aSet = new Set(answerTokens);
  const tSet = new Set(tagsTokens);

  let matched = 0;
  let questionHits = 0;
  const total = Math.max(1, queryTokens.length);

  const tryMatchToken = (qt) => {
    if (qSet.has(qt) || tSet.has(qt) || aSet.has(qt)) {
      if (qSet.has(qt)) questionHits += 1;
      return 1.0;
    }
    // partial: startsWith / includes
    const pools = [
      { tokens: questionTokens, weight: 0.8, isQuestion: true },
      { tokens: tagsTokens, weight: 0.65, isQuestion: false },
      { tokens: answerTokens, weight: 0.5, isQuestion: false }
    ];
    for (const p of pools) {
      for (const tok of p.tokens) {
        if (tok.startsWith(qt)) {
          if (p.isQuestion) questionHits += 1;
          return p.weight;
        }
      }
    }
    for (const p of pools) {
      for (const tok of p.tokens) {
        if (tok.includes(qt)) {
          if (p.isQuestion) questionHits += 1;
          return Math.max(0.4, p.weight - 0.15);
        }
      }
    }
    // fuzzy (typo tolerance)
    if (qt.length >= 4) {
      for (const p of pools) {
        for (const tok of p.tokens) {
          if (Math.abs(tok.length - qt.length) > 2) continue;
          const d = levenshtein(qt, tok);
          if (d <= 2) {
            if (p.isQuestion) questionHits += 1;
            return Math.max(0.45, p.weight - 0.1);
          }
        }
      }
    }
    return 0;
  };

  let matchStrengthSum = 0;
  for (const qt of queryTokens) {
    const s = tryMatchToken(qt);
    if (s > 0) {
      matched += 1;
      matchStrengthSum += s;
    }
  }

  const matchedRatio = matched / total; // 0..1
  const base = matchedRatio * 0.6;
  const phrase = queryPhrase && questionText.includes(queryPhrase) ? 0.3 : 0;
  const overlapBonus = matchedRatio >= 0.5 ? Math.min(0.1, (matchedRatio - 0.5) * 0.2 + 0.02) : 0;
  const questionBoost = Math.min(0.15, questionHits * 0.05);
  const filterBoost = (productBoost ? 0.05 : 0) + (categoryBoost ? 0.05 : 0);

  // Small boost if combined text contains the raw phrase
  const combinedPhraseBoost = queryPhrase && !phrase && combinedText.includes(queryPhrase) ? 0.05 : 0;

  let score = base + phrase + overlapBonus + questionBoost + filterBoost + combinedPhraseBoost;
  // If fuzzy/partial matches dominated, allow a tiny extra bump via avg strength
  if (matched > 0) {
    const avgStrength = matchStrengthSum / matched; // ~0.4..1.0
    score += Math.min(0.08, Math.max(0, avgStrength - 0.7) * 0.2);
  }
  return Math.max(0, Math.min(1, score));
}

function l2Normalize(vec) {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => v / norm);
}

function cosineSimilarityUnitVectors(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return dot;
}

function safeParseEmbedding(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map((v) => Number(v));
  // mysql2 may return JSON columns as Buffer depending on connection settings
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      if (Array.isArray(parsed)) return parsed.map((v) => Number(v));
    } catch {
      return null;
    }
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => Number(v));
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && raw !== null && Array.isArray(raw.embedding)) {
    return raw.embedding.map((v) => Number(v));
  }
  return null;
}

function keywordBoostScore({ query, faq }) {
  const q = toCleanText(query).toLowerCase();
  if (!q) return 0;
  const question = toCleanText(faq?.question).toLowerCase();
  const answer = toCleanText(faq?.answer).toLowerCase();
  const tags = toCleanText(faq?.tags).toLowerCase();

  // Small deterministic boost so semantic ranking stays primary.
  if (question.includes(q)) return 0.06;
  if (answer.includes(q)) return 0.03;
  if (tags && tags.includes(q)) return 0.02;
  return 0;
}

async function embedText(text) {
  const client = getNvidiaClient();
  const vec = await client.embedding(text);
  return l2Normalize(vec);
}

async function scoreFaqsSemantically({ query, faqs }) {
  const cleanQuery = toCleanText(query);
  if (!cleanQuery) return new Map();
  const qVec = await embedText(cleanQuery);
  const out = new Map();
  for (const f of Array.isArray(faqs) ? faqs : []) {
    const vecRaw = f?.faq_embedding;
    const vec = safeParseEmbedding(vecRaw);
    if (!Array.isArray(vec) || vec.length === 0) continue;
    const unit = l2Normalize(vec.map((v) => Number(v)));
    const sim = cosineSimilarityUnitVectors(qVec, unit);
    out.set(Number(f.id), sim);
  }
  return out;
}

/**
 * Ranks FAQs by semantic similarity. Assumes items are already filtered by product/category/tenant.
 * Returns top N with optional keyword boost.
 */
async function rankFaqsSemantically({ query, faqs, limit = 10 }) {
  const cleanQuery = toCleanText(query);
  if (!cleanQuery) return [];
  const qVec = await embedText(cleanQuery);

  const debug = process.env.DEBUG_FAQ_SEMANTIC === '1';
  const scored = [];
  let compared = 0;
  let parsed = 0;
  for (const f of Array.isArray(faqs) ? faqs : []) {
    compared += 1;
    const vecRaw = f?.faq_embedding;
    const vec = safeParseEmbedding(vecRaw);
    if (!Array.isArray(vec) || vec.length === 0) continue;
    parsed += 1;
    const unit = l2Normalize(vec.map((v) => Number(v)));
    const sim = cosineSimilarityUnitVectors(qVec, unit);
    const boosted = sim + keywordBoostScore({ query: cleanQuery, faq: f });
    scored.push({ faq: f, score: boosted, semantic_score: sim });
  }

  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, Math.max(1, limit)).map((x) => ({
    ...x.faq,
    semantic_score: Number.isFinite(x.semantic_score) ? x.semantic_score : null
  }));
  if (debug) {
    const top = out.slice(0, 5).map((x) => Number(x?.semantic_score ?? 0));
    console.log('[faq-semantic]', { compared, parsed, returned: out.length, top_scores: top });
  }
  return out;
}

async function buildFaqEmbeddingText({ question, answer }) {
  const q = toCleanText(question);
  const a = toCleanText(answer);
  // Keep stable, simple; combine question+answer for retrieval.
  return `Q: ${q}\nA: ${a}`.trim();
}

async function generateFaqEmbedding({ question, answer }) {
  const input = await buildFaqEmbeddingText({ question, answer });
  const client = getNvidiaClient();
  const vec = await client.embedding(input);
  // Store raw vector (not normalized) so we can change normalization strategy later.
  return vec.map((v) => Number(v));
}

module.exports = {
  rankFaqsSemantically,
  scoreFaqsSemantically,
  preprocessQuery,
  keywordScore,
  generateFaqEmbedding,
  safeParseEmbedding
};

