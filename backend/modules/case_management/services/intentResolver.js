/**
 * Intent-based role resolver for ticket assignment.
 *
 * Determines the preferred handling role for a ticket by scanning
 * category, subcategory, title, description, reporting mode, and selected
 * department for role-specific keywords. Title and description matches are
 * weighted higher than metadata matches so the actual ticket content drives
 * the decision.
 *
 * This module is intentionally isolated from the rest of the assignment
 * workflow so it can later be replaced by an AI-based classifier without
 * changing callers.
 */

const ROLE_KEYWORDS = {
  hr_executive: {
    keywords: [
      'leave', 'attendance', 'payroll', 'salary', 'employee information',
      'insurance', 'reimbursement'
    ]
  },
  hr_manager: {
    keywords: [
      'policy', 'disciplinary', 'grievance', 'compliance', 'appraisal',
      'performance', 'employee conflict'
    ]
  },
  department_head: {
    keywords: [
      'department', 'transfer', 'promotion', 'approval', 'reporting manager',
      'project allocation', 'team change'
    ]
  },
  system_admin: {
    keywords: [
      'login', 'password', 'access', 'software', 'hardware', 'server',
      'application', 'network', 'technical'
    ]
  },
  ceo: {
    keywords: [
      'executive approval', 'organization-wide', 'strategic', 'board',
      'legal escalation', 'company policy exception'
    ]
  }
};

const TITLE_WEIGHT = 5;
const DESCRIPTION_WEIGHT = 5;
const META_WEIGHT = 1;

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\-]/g, ' ');
}

function scoreRole(text, weight, keywords) {
  let score = 0;
  for (const keyword of keywords) {
    if (text.includes(normalizeText(keyword))) score += weight;
  }
  return score;
}

/**
 * Resolve the preferred role for a ticket based on its content.
 *
 * @param {object} context
 * @param {string|null} context.category
 * @param {string|null} context.subcategory
 * @param {string|null} context.title
 * @param {string|null} context.description
 * @param {string|null} context.reportingMode
 * @param {string|null} context.selectedDepartment
 * @returns {string|null} Preferred role (e.g. 'department_head') or null if no intent is detected.
 */
function resolvePreferredRole(context) {
  const title = normalizeText(context.title);
  const description = normalizeText(context.description);
  const metaText = [
    context.category,
    context.subcategory,
    context.reportingMode,
    context.selectedDepartment
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

  let bestRole = null;
  let bestScore = 0;

  for (const [role, config] of Object.entries(ROLE_KEYWORDS)) {
    const keywords = config.keywords;
    let score = 0;
    score += scoreRole(title, TITLE_WEIGHT, keywords);
    score += scoreRole(description, DESCRIPTION_WEIGHT, keywords);
    score += scoreRole(metaText, META_WEIGHT, keywords);

    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }

  return bestRole;
}

/**
 * Describe why a role was selected for a context. Useful for debugging.
 *
 * @param {object} context
 * @returns {object} Per-role scores and detected keywords.
 */
function describeRoleScores(context) {
  const title = normalizeText(context.title);
  const description = normalizeText(context.description);
  const metaText = [
    context.category,
    context.subcategory,
    context.reportingMode,
    context.selectedDepartment
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

  const scores = {};
  for (const [role, config] of Object.entries(ROLE_KEYWORDS)) {
    const matched = [];
    let score = 0;
    for (const keyword of config.keywords) {
      const normalized = normalizeText(keyword);
      if (title.includes(normalized)) {
        score += TITLE_WEIGHT;
        matched.push({ keyword, source: 'title', weight: TITLE_WEIGHT });
      }
      if (description.includes(normalized)) {
        score += DESCRIPTION_WEIGHT;
        matched.push({ keyword, source: 'description', weight: DESCRIPTION_WEIGHT });
      }
      if (metaText.includes(normalized)) {
        score += META_WEIGHT;
        matched.push({ keyword, source: 'metadata', weight: META_WEIGHT });
      }
    }
    scores[role] = { score, matched };
  }
  return scores;
}

module.exports = {
  resolvePreferredRole,
  describeRoleScores,
  ROLE_KEYWORDS
};
