const DEFAULTS = {
  affected_users: 'single_user',
  business_impact: 'medium'
};

const severityMap = {
  low: 1,
  medium: 2,
  high: 3
};

const impactMap = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const urgencyMap = {
  normal: 1,
  urgent: 2
};

function normalizeEnum(value, allowed, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

function extractSeverity(ticket = {}) {
  // Reuse existing AI priority output if present; map to severity 1..3.
  const p = String(ticket?.ai_predicted_priority || ticket?.aiPriority || ticket?.priority || '').trim().toLowerCase();
  const text = `${ticket.issue_title || ticket.issueTitle || ticket.title || ''} ${ticket.description || ticket.issue_description || ''}`.toLowerCase();

  const highSignals = [
    'outage',
    'down',
    'system down',
    'service down',
    'production',
    'p0',
    'p1',
    'sev1',
    'sev 1',
    'critical',
    'blocked',
    'cannot',
    "can't",
    'unable',
    'data loss',
    'security',
    'breach'
  ];
  const lowSignals = [
    'minor',
    'cosmetic',
    'typo',
    'spelling',
    'alignment',
    'ui alignment',
    'nice to have',
    'enhancement',
    'feature request',
    'suggestion',
    'low impact'
  ];

  // If text clearly indicates severity, prefer it over a generic/medium AI output.
  if (highSignals.some((k) => text.includes(k))) return 3;
  if (lowSignals.some((k) => text.includes(k))) return 1;

  if (p === 'urgent') return 3;
  if (p === 'high') return 3;
  if (p === 'medium') return 2;
  if (p === 'low') return 1;
  return 2;
}

function detectUrgency(text = '') {
  const t = String(text || '').toLowerCase();
  const urgentKeywords = [
    'urgent',
    'asap',
    'immediately',
    'down',
    'outage',
    'blocked',
    'cannot',
    "can't",
    'unable',
    'production',
    'sev',
    'severity',
    'p1',
    'p0',
    'critical'
  ];
  return urgentKeywords.some((k) => t.includes(k)) ? 'urgent' : 'normal';
}

function severityLabelFromScore(severityScore) {
  const n = Number(severityScore || 0);
  if (n >= 3) return 'high';
  if (n >= 2) return 'medium';
  return 'low';
}

function affectedUsersLabel(key) {
  switch (String(key || '').toLowerCase()) {
    case 'organization_wide':
      return 'organization-wide';
    case 'multiple_teams':
      return 'multiple teams';
    case 'team':
      return 'a small team';
    default:
      return 'a single user';
  }
}

function issueSnippet({ issueTitle, description }) {
  const title = String(issueTitle || '').trim();
  if (title) return title.slice(0, 90);
  const desc = String(description || '').replace(/\s+/g, ' ').trim();
  if (!desc) return 'this issue';
  return desc.slice(0, 90);
}

function stableHash(input = '') {
  const s = String(input || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return Math.abs(h);
}

function impactText(impact) {
  const map = {
    1: 'a user',
    2: 'users',
    3: 'users across teams',
    4: 'all users'
  };
  return map[Number(impact)] || 'users';
}

function severityText(severity) {
  const map = {
    1: 'low',
    2: 'moderate',
    3: 'high'
  };
  return map[Number(severity)] || 'moderate';
}

function extractKeyword(title) {
  const t = String(title || '').trim();
  if (!t) return 'reported issue';
  return t.length > 60 ? `${t.slice(0, 60)}...` : t;
}

function detectDomain(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (t.includes('login') || t.includes('auth') || t.includes('sso') || t.includes('mfa')) return 'authentication';
  if (t.includes('api') || t.includes('endpoint') || t.includes('request') || t.includes('timeout')) return 'API';
  if (t.includes('payment') || t.includes('invoice') || t.includes('billing') || t.includes('checkout')) return 'payment';
  if (t.includes('ui') || t.includes('button') || t.includes('screen') || t.includes('page')) return 'UI';
  if (t.includes('policy') || t.includes('grc') || t.includes('compliance')) return 'compliance';
  return null;
}

function inferAffectedUsers(ticket = {}) {
  const text = `${ticket.issue_title || ticket.issueTitle || ticket.title || ''} ${ticket.description || ticket.issue_description || ''}`.toLowerCase();
  if (!text.trim()) return null;

  // Strong signals
  if (
    text.includes('all users') ||
    text.includes('everyone') ||
    text.includes('entire org') ||
    text.includes('organization-wide') ||
    text.includes('company-wide') ||
    text.includes('entire organization')
  ) return 'organization_wide';

  if (
    text.includes('multiple teams') ||
    text.includes('many teams') ||
    text.includes('across teams') ||
    text.includes('cross-team') ||
    text.includes('departments') ||
    text.includes('several teams')
  ) return 'multiple_teams';

  if (
    text.includes('team') ||
    text.includes('department') ||
    text.includes('group') ||
    text.includes('squad') ||
    text.includes('approvers') ||
    text.includes('reviewers')
  ) return 'team';

  // Weak/default
  if (text.includes('my account') || text.includes('single user') || text.includes('only me')) return 'single_user';
  return null;
}

function inferBusinessImpact(ticket = {}) {
  const text = `${ticket.issue_title || ticket.issueTitle || ticket.title || ''} ${ticket.description || ticket.issue_description || ''}`.toLowerCase();
  if (!text.trim()) return null;

  // Critical / blocked operations
  const criticalSignals = [
    'outage',
    'down',
    'system down',
    'service down',
    'production down',
    'cannot access',
    'can’t access',
    "can't access",
    'unable to access',
    'blocked',
    'business operations',
    'sev1',
    'sev 1',
    'p0',
    'critical'
  ];
  if (criticalSignals.some((k) => text.includes(k))) return 'critical';

  // High impact / workflow broken
  const highSignals = [
    'cannot login',
    'can’t login',
    "can't login",
    'login failing',
    'payment failed',
    'data loss',
    'security',
    'breach',
    'deadline',
    'audit',
    'compliance',
    'major',
    'fails',
    'failure',
    'error',
    'timeout'
  ];
  if (highSignals.some((k) => text.includes(k))) return 'high';

  // Low impact / cosmetic
  const lowSignals = [
    'minor',
    'cosmetic',
    'typo',
    'spelling',
    'alignment',
    'ui alignment',
    'nice to have',
    'enhancement',
    'feature request',
    'suggestion',
    'low impact',
    'no impact'
  ];
  if (lowSignals.some((k) => text.includes(k))) return 'low';

  return null; // default handled by normalizer
}

function pickTemplateIndex(ticket = {}, count = 1) {
  const seed = [
    ticket.id,
    ticket.issue_title,
    ticket.issueTitle,
    ticket.title,
    ticket.description,
    ticket.issue_description,
    ticket.business_impact,
    ticket.affected_users,
    ticket.priority
  ]
    .map((v) => String(v || ''))
    .join('|');
  return stableHash(seed) % Math.max(1, Number(count) || 1);
}

// Dynamic, varied, context-aware reason generator (no external AI dependency).
function generateReason(ticket = {}, priority, severity, impact, urgency) {
  try {
    const title = ticket.issue_title || ticket.issueTitle || ticket.title || '';
    const desc = ticket.description || ticket.issue_description || '';
    const keyword = extractKeyword(title || issueSnippet({ issueTitle: '', description: desc }));
    const domain = detectDomain(`${title} ${desc}`);
    const domainText = domain ? ` in ${domain}` : '';
    const impactPhrase = impactText(impact);
    const severityPhrase = severityText(severity);
    const isUrgent = String(urgency || '').toLowerCase() === 'urgent';
    const urgencyText = isUrgent ? 'urgent' : 'timely';

    const templates = [
      `Assigned ${priority} priority as this issue impacts ${impactPhrase} and requires ${urgencyText} attention${domainText}.`,
      `Marked as ${priority} due to ${impactPhrase} impact combined with ${severityPhrase} severity${domainText}.`,
      `This ticket is classified as ${priority} since it affects ${impactPhrase} and may disrupt ongoing workflows${domainText}.`,
      `Based on the issue "${keyword}", this is prioritized as ${priority} considering its business impact on ${impactPhrase}${domainText}.`,
      `Set to ${priority} because the issue influences ${impactPhrase} and carries ${severityPhrase} technical significance${domainText}.`,
      `${priority} priority assigned as the reported problem could impact ${impactPhrase} if not addressed promptly${domainText}.`,
      `The issue "${keyword}" indicates ${severityPhrase} severity and impacts ${impactPhrase}, therefore marked as ${priority}${domainText}.`
    ];

    const idx = pickTemplateIndex(ticket, templates.length);
    return templates[idx] || `Priority set to ${priority} based on issue analysis and business impact.`;
  } catch (_) {
    return `Priority set to ${priority} based on issue analysis and business impact.`;
  }
}

function generatePriorityReason(ticket = {}) {
  const inferredAffected = inferAffectedUsers(ticket);
  const inferredImpact = inferBusinessImpact(ticket);

  const affectedUsers = normalizeEnum(
    ticket.affected_users || inferredAffected,
    ['single_user', 'team', 'multiple_teams', 'organization_wide'],
    DEFAULTS.affected_users
  );
  const businessImpact = normalizeEnum(
    ticket.business_impact || inferredImpact,
    ['low', 'medium', 'high', 'critical'],
    DEFAULTS.business_impact
  );
  const priority = normalizeEnum(
    ticket.priority,
    ['low', 'medium', 'high', 'urgent'],
    'medium'
  );
  const severity = extractSeverity(ticket); // 1..3
  const impact = impactMap[businessImpact] || 2; // 1..4
  const urgencyKey = detectUrgency(ticket.description || ticket.issue_description || '');
  return generateReason(
    { ...ticket, affected_users: affectedUsers, business_impact: businessImpact, priority },
    priority,
    severity,
    impact,
    urgencyKey
  );
}

function calculatePriority(ticket = {}) {
  const inferredAffected = inferAffectedUsers(ticket);
  const inferredImpact = inferBusinessImpact(ticket);

  const affectedUsers = normalizeEnum(
    ticket.affected_users || inferredAffected,
    ['single_user', 'team', 'multiple_teams', 'organization_wide'],
    DEFAULTS.affected_users
  );
  const businessImpact = normalizeEnum(
    ticket.business_impact || inferredImpact,
    ['low', 'medium', 'high', 'critical'],
    DEFAULTS.business_impact
  );

  const severity = extractSeverity(ticket); // 1..3
  const impact = impactMap[businessImpact] || 2; // 1..4
  const urgencyKey = detectUrgency(ticket.description || ticket.issue_description || '');
  const urgency = urgencyMap[urgencyKey] || 1; // 1..2

  const score = (severity * 0.4) + (impact * 0.4) + (urgency * 0.2);

  let priority;
  if (score >= 3.5) priority = 'urgent';
  else if (score >= 2.5) priority = 'high';
  else if (score >= 1.5) priority = 'medium';
  else priority = 'low';

  const reason = generateReason(
    { ...ticket, affected_users: affectedUsers, business_impact: businessImpact, priority },
    priority,
    severity,
    impact,
    urgencyKey
  );

  return {
    priority,
    score,
    reason,
    inputs: { affected_users: affectedUsers, business_impact: businessImpact, urgency: urgencyKey, severity, impact }
  };
}

module.exports = {
  calculatePriority,
  generatePriorityReason,
  extractSeverity,
  detectUrgency,
  DEFAULTS
};

