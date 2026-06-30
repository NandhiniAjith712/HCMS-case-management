/**
 * Assistant Intent Resolver
 *
 * Maps employee questions to HCMS intents using a semantic scoring model.
 * This avoids simple keyword matching by considering verbs, objects, boosters,
 * blockers, and full phrase patterns together. Questions with the same intent
 * always receive the same response.
 *
 * If a query is ambiguous, the resolver returns a clarification request so the
 * assistant can ask the user what they mean instead of guessing.
 */

const INTENTS = {
  CREATE_CASE: {
    verbs: ['create', 'raise', 'submit', 'report', 'file', 'open', 'register', 'make', 'log', 'add'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue', 'concern', 'complaint', 'problem', 'request'],
    boosters: ['new', 'fresh', 'creation'],
    blockers: ['view', 'see', 'find', 'track', 'where', 'created', 'submitted', 'reported', 'raised', 'closed', 'updated', 'edited', 'deleted', 'existing', 'previous', 'my'],
    patterns: [
      'how do i create a case',
      'how can i create a case',
      'how do i raise a case',
      'how can i raise a case',
      'how do i submit a case',
      'how do i report an issue',
      'how do i report a problem',
      'i want to create a case',
      'i need to create a case',
      'create a new case',
      'case creation',
      'help me create a case',
      'help me with case creation',
      'help creating a case',
      'creating a new case'
    ],
    response:
      'Open the Create Case page, fill in the form with the required details, and submit. Your case will be created and routed to the appropriate HR team based on its category and type.'
  },
  VIEW_CASES: {
    verbs: ['view', 'see', 'find', 'check', 'show', 'display', 'look', 'access', 'list', 'where', 'are'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue', 'issues'],
    boosters: ['my', 'created', 'submitted', 'reported', 'raised', 'existing', 'previous', 'all', 'closed', 'updated', 'resolved'],
    blockers: ['create', 'raise', 'submit', 'report', 'close', 'update', 'edit', 'delete', 'escalate', 'new', 'creation'],
    patterns: [
      'how do i view my cases',
      'how can i see my cases',
      'how do i view the cases created',
      'how do i view the cases i created',
      'where can i find my submitted cases',
      'where are my submitted cases',
      'where are my reported cases',
      'where are my cases',
      'show me my cases',
      'list my cases',
      'see my cases'
    ],
    response:
      'Go to the Dashboard or My Tickets page and open the case. You can see its status, comments, history, and attachments.'
  },
  TRACK_CASE: {
    verbs: ['track', 'follow', 'status', 'progress', 'where', 'is'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue'],
    boosters: ['my', 'current', 'now'],
    blockers: ['create', 'raise', 'submit', 'report', 'close', 'update', 'edit', 'delete', 'new', 'creation'],
    patterns: [
      'where is my case',
      'how do i track my case',
      'what is the status of my case',
      'check my case status'
    ],
    response:
      'Go to the Dashboard or My Tickets page and open the case. You can see its status, comments, history, and attachments.'
  },
  CLOSE_CASE: {
    verbs: ['close', 'finish', 'end', 'resolve'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue'],
    boosters: ['my'],
    blockers: ['view', 'see', 'find', 'track', 'where', 'create', 'raise', 'submit', 'report', 'new', 'creation'],
    patterns: ['how do i close a case', 'how can i close my case', 'close my case'],
    response:
      'Open the case and select the close option if available. You can reopen it later if you need further help.'
  },
  UPDATE_CASE: {
    verbs: ['update', 'edit', 'modify', 'change', 'amend'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue'],
    boosters: ['my'],
    blockers: ['view', 'see', 'find', 'track', 'where', 'create', 'raise', 'submit', 'report', 'new', 'creation'],
    patterns: ['how do i update a case', 'how can i edit my case', 'update my case'],
    response:
      'Open the case and use the edit or comment option if available. Resolved or closed cases may have limited editing.'
  },
  DELETE_CASE: {
    verbs: ['delete', 'remove', 'drop'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue'],
    boosters: ['my'],
    blockers: ['view', 'see', 'find', 'track', 'where', 'create', 'raise', 'submit', 'report'],
    patterns: ['can i delete my case', 'how do i delete a case', 'remove my case'],
    response:
      'You can delete your own case only if the system allows it. The option is available on the case detail page when permitted.'
  },
  ESCALATE_CASE: {
    verbs: ['escalate', 'escalation', 'forward', 'escalated'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue'],
    boosters: ['my'],
    blockers: ['view', 'see', 'find', 'track', 'create', 'raise', 'submit', 'report'],
    patterns: ['how do i escalate a case', 'how can i escalate my case', 'escalate my case'],
    response:
      'Open the case and choose the escalation option if available. Select the next level, provide a reason, and confirm if consent is required.'
  },
  ADD_ATTACHMENT: {
    verbs: ['add', 'attach', 'upload', 'include'],
    objects: ['attachment', 'attachments', 'file', 'files', 'document', 'documents', 'image', 'images'],
    boosters: ['case', 'ticket'],
    blockers: ['view', 'see', 'find', 'delete', 'remove'],
    patterns: ['how do i add an attachment', 'how can i attach a file', 'upload a file to a case'],
    response:
      'You can add attachments when creating a case or from the case detail page. Files are visible to you and the HR users who can view the case.'
  },
  CONFIDENTIAL_CASE: {
    verbs: ['what', 'is', 'how'],
    objects: ['case', 'cases'],
    boosters: ['confidential'],
    blockers: ['sensitive', 'anonymous'],
    patterns: ['what is a confidential case', 'confidential case'],
    response:
      'A confidential case restricts visibility. Only you, the assigned HR user, and authorized users at the right escalation level can view it.'
  },
  SENSITIVE_CASE: {
    verbs: ['what', 'is', 'how'],
    objects: ['case', 'cases'],
    boosters: ['sensitive'],
    blockers: ['confidential', 'anonymous'],
    patterns: ['what is a sensitive case', 'sensitive case'],
    response:
      'A sensitive case is restricted to authorized users at the right escalation level, similar to a confidential case.'
  },
  ANONYMOUS_CASE: {
    verbs: ['what', 'is', 'how'],
    objects: ['case', 'cases'],
    boosters: ['anonymous'],
    blockers: ['confidential', 'sensitive'],
    patterns: ['what is an anonymous case', 'anonymous case'],
    response:
      'An anonymous case hides your identity from others. Your name appears as Anonymous Employee.'
  },
  SPECIAL_CASE_DIFFERENCE: {
    verbs: ['what', 'difference', 'compare', 'versus', 'vs'],
    objects: ['case', 'cases'],
    boosters: ['confidential', 'sensitive', 'anonymous'],
    blockers: [],
    patterns: [
      'difference between confidential sensitive and anonymous',
      'confidential vs sensitive vs anonymous'
    ],
    response:
      'Confidential limits visibility to authorized users, Sensitive is controlled by escalation level, and Anonymous hides your identity from others.'
  },
  NOTIFICATIONS: {
    verbs: ['how', 'what', 'where', 'check'],
    objects: ['notification', 'notifications', 'alert', 'alerts', 'message', 'messages'],
    boosters: ['work', 'case', 'receive'],
    blockers: [],
    patterns: ['how do notifications work', 'where are my notifications', 'how do i check notifications'],
    response:
      'You receive notifications when a case is created, updated, commented on, escalated, or resolved. Check the notification panel to view them.'
  },
  PROFILE_UPDATE: {
    verbs: ['update', 'edit', 'change', 'modify'],
    objects: ['profile', 'account', 'details', 'password'],
    boosters: ['my'],
    blockers: ['case', 'ticket', 'issue'],
    patterns: ['how do i update my profile', 'how can i change my password', 'update my profile'],
    response:
      'Go to your profile page, update your details, and save. You can also change your password from there or from the settings page.'
  },
  STATUS_IN_PROGRESS: {
    verbs: ['what', 'is', 'does', 'mean'],
    objects: ['status', 'case'],
    boosters: ['in progress'],
    blockers: ['open', 'resolved', 'closed', 'escalated', 'waiting', 'rejected'],
    patterns: ['what does in progress mean', 'what is in progress status', 'in progress status'],
    response: 'In Progress means HR is actively working on your case.'
  },
  ACTION_REQUEST: {
    verbs: ['can', 'will', 'please', 'do'],
    objects: ['case', 'cases', 'ticket', 'tickets', 'issue'],
    boosters: ['you', 'for me', 'my'],
    blockers: [],
    patterns: [
      'can you create a case for me',
      'can you close my case',
      'can you update my case',
      'can you delete my case',
      'can you escalate my case',
      'please create a case for me'
    ],
    response:
      'I cannot perform actions on your behalf. Open the Create Case page, fill in the form, and submit. I can guide you through the steps if you need help.'
  },
  OUT_OF_SCOPE: {
    verbs: [],
    objects: [],
    boosters: ['python', 'java', 'javascript', 'coding', 'programming', 'weather', 'news', 'math', 'maths'],
    blockers: ['case', 'ticket', 'issue', 'hcms'],
    patterns: ['what is python', 'what is java', 'how to code', 'what is the weather'],
    response: 'I\'m here to help with HCMS only. Let me know if you have a case-related question.'
  }
};

const WEIGHTS = {
  pattern: 10,
  verb: 3,
  object: 2,
  booster: 2,
  blocker: -8
};

const SCORE_THRESHOLD = 6;
const AMBIGUITY_MARGIN = 2;

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:\\'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeText(text).split(' ').filter(Boolean);
}

function scoreIntent(query, tokens, intent) {
  let score = 0;

  // Full phrase match is the strongest signal.
  for (const pattern of intent.patterns) {
    if (query.includes(pattern)) {
      score += WEIGHTS.pattern;
    }
  }

  // Verb signals (what the user wants to do).
  for (const verb of intent.verbs) {
    if (tokens.includes(verb)) {
      score += WEIGHTS.verb;
    }
  }

  // Object signals (what the user is talking about).
  for (const object of intent.objects) {
    if (tokens.includes(object)) {
      score += WEIGHTS.object;
    }
  }

  // Boosters strengthen the intent (e.g., "my", "created" for viewing).
  for (const booster of intent.boosters) {
    if (query.includes(booster)) {
      score += WEIGHTS.booster;
    }
  }

  // Blockers indicate a different intent. Use token matching so "created" does
  // not match the "create" blocker for viewing intents.
  for (const blocker of intent.blockers) {
    if (tokens.includes(blocker)) {
      score += WEIGHTS.blocker;
    }
  }

  return score;
}

/**
 * Resolve a user query to a known assistant intent.
 *
 * @param {string} text
 * @returns {{ intent: string|null, response: string|null, confidence: 'high'|'low'|'ambiguous', clarification?: string }}
 */
function resolveIntent(text) {
  const query = normalizeText(text);
  const tokens = tokenize(text);

  if (!query) {
    return { intent: null, response: null, confidence: 'low' };
  }

  const scores = {};
  for (const [intentName, intent] of Object.entries(INTENTS)) {
    scores[intentName] = scoreIntent(query, tokens, intent);
  }

  const entries = Object.entries(scores)
    .sort((a, b) => b[1] - a[1]);

  const best = entries[0];
  const second = entries[1];

  if (!best || best[1] < SCORE_THRESHOLD) {
    return { intent: null, response: null, confidence: 'low' };
  }

  // If two intents are close, the query is ambiguous.
  if (second && best[1] - second[1] < AMBIGUITY_MARGIN) {
    return {
      intent: null,
      response: null,
      confidence: 'ambiguous',
      clarification:
        'I want to make sure I help you correctly. Are you looking to create a new case, or view the cases you have already created?'
    };
  }

  const intentName = best[0];
  return {
    intent: intentName,
    response: INTENTS[intentName].response,
    confidence: 'high'
  };
}

module.exports = {
  resolveIntent,
  INTENTS
};
