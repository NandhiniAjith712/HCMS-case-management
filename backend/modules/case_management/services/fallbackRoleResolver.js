/**
 * Lightweight fallback role resolver for ticket assignment.
 *
 * This module is used only when the primary intent resolver cannot determine
 * a preferred role. It performs broad keyword matching across all available
 * ticket fields (category, subcategory, title, description, reporting mode, and
 * selected department) and returns the role with the most keyword hits.
 *
 * It is intentionally isolated from the primary intent resolver and the
 * assignment workflow so it can later be replaced by an AI-based classifier.
 */

const ROLE_KEYWORDS = {
  hr_executive: [
    'leave', 'attendance', 'payroll', 'salary', 'employee', 'insurance',
    'reimbursement', 'benefit', 'hr', 'human resources'
  ],
  hr_manager: [
    'policy', 'disciplinary', 'grievance', 'compliance', 'appraisal',
    'performance', 'conflict', 'hr policy'
  ],
  department_head: [
    'department', 'transfer', 'promotion', 'approval', 'reporting manager',
    'project allocation', 'team change', 'team', 'division', 'branch'
  ],
  system_admin: [
    'login', 'password', 'access', 'software', 'hardware', 'server',
    'application', 'network', 'technical', 'system', 'it', 'config'
  ],
  ceo: [
    'executive approval', 'organization-wide', 'strategic', 'board',
    'legal escalation', 'company policy exception', 'ceo', 'chief executive'
  ]
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSearchText(context) {
  return [
    context.category,
    context.subcategory,
    context.title,
    context.description,
    context.reportingMode,
    context.selectedDepartment
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
}

/**
 * Resolve a fallback role when the primary intent resolver cannot determine one.
 *
 * @param {object} context
 * @param {string|null} context.category
 * @param {string|null} context.subcategory
 * @param {string|null} context.title
 * @param {string|null} context.description
 * @param {string|null} context.reportingMode
 * @param {string|null} context.selectedDepartment
 * @returns {string|null} Fallback role (e.g. 'hr_executive') or null.
 */
function resolveFallbackRole(context) {
  const text = buildSearchText(context);
  if (!text) return null;

  let bestRole = null;
  let bestScore = 0;

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    const score = keywords.reduce((sum, keyword) => {
      return text.includes(keyword.toLowerCase()) ? sum + 1 : sum;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }

  return bestRole;
}

/**
 * Describe fallback scores for debugging.
 *
 * @param {object} context
 * @returns {object} Per-role scores.
 */
function describeFallbackScores(context) {
  const text = buildSearchText(context);
  const scores = {};
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    const matched = [];
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
        matched.push(keyword);
      }
    }
    scores[role] = { score, matched };
  }
  return scores;
}

module.exports = {
  resolveFallbackRole,
  describeFallbackScores,
  ROLE_KEYWORDS
};
