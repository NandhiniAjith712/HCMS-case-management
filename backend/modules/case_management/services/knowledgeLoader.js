/**
 * HCMS Assistant Knowledge Loader
 *
 * Reads modular knowledge files from backend/modules/case_management/knowledge
 * and combines them into a single knowledge string for injection into the AI
 * assistant prompt. New knowledge files are picked up automatically.
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.resolve(__dirname, '../knowledge');

// Sections that are always loaded because they define boundaries and core terminology.
const CORE_SECTIONS = ['overview', 'cases', 'permissions'];

// Keyword -> section name mapping. Used to pick relevant knowledge for a query.
// Keep keywords lowercase and punctuation-free.
const SECTION_KEYWORDS = {
  overview: ['hcms', 'hr', 'employee', 'portal', 'help', 'what is', 'about', 'who can use'],
  dashboard: ['dashboard', 'metrics', 'total', 'open', 'closed', 'summary', 'cards', 'home'],
  cases: ['case', 'create', 'submit', 'raise', 'ticket', 'new', 'issue', 'request', 'subject', 'category', 'subcategory', 'reporting', 'mode', 'edit', 'update', 'delete', 'remove'],
  'case-lifecycle': ['lifecycle', 'stages', 'after submit', 'resolved', 'close', 'reopen', 'reject', 'escalate', 'assigned', 'submit'],
  'case-statuses': ['status', 'open', 'progress', 'resolved', 'closed', 'escalated', 'waiting', 'rejected', 'meaning', 'state'],
  'special-cases': ['confidential', 'sensitive', 'anonymous', 'privacy', 'hide', 'restricted', 'private'],
  escalation: ['escalate', 'level', 'l1', 'l2', 'l3', 'l4', 'l5', 'consent', 'higher', 'authority', 'next level'],
  notifications: ['notification', 'alert', 'notify', 'unread', 'read'],
  attachments: ['attachment', 'file', 'upload', 'document', 'image', 'download', 'attach', 'pdf'],
  profile: ['profile', 'name', 'email', 'phone', 'password', 'account', 'my details'],
  settings: ['settings', 'configuration', 'sla', 'department', 'routing', 'configure'],
  permissions: ['permission', 'role', 'access', 'can', 'cannot', 'allowed', 'view', 'see', 'capable'],
  faq: ['faq', 'common question', 'frequently asked']
};

/**
 * Load all .md files from the knowledge directory, ordered alphabetically.
 * Returns a single string with each file's content separated by a header.
 *
 * @returns {string}
 */
function loadKnowledge() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    return '';
  }

  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort();

  const parts = [];
  for (const file of files) {
    const fullPath = path.join(KNOWLEDGE_DIR, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8').trim();
      if (content) {
        const sectionName = file.replace(/\.md$/i, '').replace(/-/g, ' ');
        parts.push(`--- ${sectionName.toUpperCase()} ---\n${content}`);
      }
    } catch (err) {
      console.error(`[knowledgeLoader] Failed to read ${file}:`, err.message);
    }
  }

  return parts.join('\n\n');
}

/**
 * Normalize text for keyword matching.
 * @param {string} text
 * @returns {string}
 */
function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.!?,.:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Select sections relevant to a query and return their combined content.
 * Core sections are always included.
 *
 * @param {string} query
 * @returns {string}
 */
function loadRelevantKnowledge(query) {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    return '';
  }

  const normalizedQuery = normalizeForMatch(query);
  const selectedSections = new Set(CORE_SECTIONS);

  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalizedQuery.includes(keyword)) {
        selectedSections.add(section);
        break;
      }
    }
  }

  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort();

  const parts = [];
  for (const file of files) {
    const sectionName = file.replace(/\.md$/i, '').replace(/-/g, ' ');
    const sectionKey = sectionName.replace(/\s+/g, '-').toLowerCase();
    if (!selectedSections.has(sectionKey)) continue;

    const fullPath = path.join(KNOWLEDGE_DIR, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8').trim();
      if (content) {
        parts.push(`--- ${sectionName.toUpperCase()} ---\n${content}`);
      }
    } catch (err) {
      console.error(`[knowledgeLoader] Failed to read ${file}:`, err.message);
    }
  }

  return parts.join('\n\n');
}

/**
 * Load a single knowledge section by file name (without extension).
 *
 * @param {string} sectionName
 * @returns {string}
 */
function loadKnowledgeSection(sectionName) {
  const filePath = path.join(KNOWLEDGE_DIR, `${sectionName}.md`);
  if (!fs.existsSync(filePath)) {
    return '';
  }
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (err) {
    console.error(`[knowledgeLoader] Failed to read ${sectionName}.md:`, err.message);
    return '';
  }
}

module.exports = {
  loadKnowledge,
  loadRelevantKnowledge,
  loadKnowledgeSection,
  KNOWLEDGE_DIR
};
