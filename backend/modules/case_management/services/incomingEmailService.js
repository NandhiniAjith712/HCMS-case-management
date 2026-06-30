/**
 * Incoming Email Service - Handles both replies to existing tickets and new ticket creation.
 */
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { pool } = require('../../shared/database/database');
const ticketMessagesService = require('./ticketMessagesService');
const ticketService = require('./ticketService');
const aiExtractionService = require('./aiExtractionService');
const emailService = require('./emailService');
const emailCleaner = require('../../shared/utils/emailCleaner');

const POLL_INTERVAL_MS = parseInt(process.env.IMAP_POLL_INTERVAL_MS || '60000', 10);

/**
 * Wraps a promise in a timeout to guarantee it completes or falls back.
 */
function withTimeout(promise, ms, defaultValue) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([
    promise.then(res => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise
  ]).catch(err => {
    console.warn(`⚠️ Timeout/failure in AI operation: ${err.message}. Using default values.`);
    return defaultValue;
  });
}
let client = null;
let pollTimer = null;
let isShuttingDown = false;

function getImapConfig() {
  const user = process.env.GMAIL_USER || process.env.SMTP_EMAIL || process.env.EMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD || process.env.EMAIL_PASS;
  const host = process.env.IMAP_HOST || process.env.IMAP_SERVER || 'imap.gmail.com';
  const port = parseInt(process.env.IMAP_PORT || '993', 10);
  const secure = port === 993;
  const enabled = process.env.IMAP_INCOMING_ENABLED !== 'false';
  return { user, pass, host, port, secure, enabled };
}

/**
 * Strip quoted/forwarded content from email body
 */
function stripQuotedContent(text) {
  if (!text || typeof text !== 'string') return '';
  const onWrote = text.search(/\s+On\s+[A-Za-z]{3},.+wrote:/i);
  if (onWrote > 0) return text.substring(0, onWrote).trim();
  const teamWrote = text.search(/\s+ITSM Ticketing Support Team[^>]*>?\s*wrote:/i);
  if (teamWrote > 0) return text.substring(0, teamWrote).trim();
  
  const lines = text.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^On\s+.+wrote:/i.test(t)) break;
    if (/\bwrote:\s*$/.test(t) && result.length > 0) break;
    if (/^-{3,}\s*Forwarded message\s*-{3,}/i.test(line)) break;
    if (/^>{0,2}\s*From:\s+/i.test(t) && result.length > 0) break;
    if (/^>\s*$/.test(line)) continue;
    const trimmed = line.replace(/^>\s?/, '').trim();
    if (trimmed && !/^<[^>]+>\s*wrote:/i.test(trimmed)) result.push(trimmed);
  }
  return result.join('\n').trim();
}

/**
 * Extract ticket ID from email subject (e.g. "Re: Ticket #123")
 */
function extractTicketIdFromSubject(subject) {
  if (!subject || typeof subject !== 'string') return null;
  const match = subject.match(/#(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Get plain body from parsed mail */
function getRawBody(parsed) {
  if (parsed.text && parsed.text.trim()) return parsed.text.trim();
  if (parsed.html) {
    const stripped = parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped) return stripped;
  }
  return '';
}

/** Validation logic for incoming emails */
async function validateEmail(parsed, tenantId = 1) {
  const validation = {
    emailType: 'valid_user_mail',
    isSpam: false,
    isAutoReply: false,
    isEmpty: false,
    reasons: []
  };

  const subject = (parsed.subject || '').toLowerCase();
  const body = getRawBody(parsed).toLowerCase();
  const fromEmail = (parsed.from?.value?.[0]?.address || '').toLowerCase();

  // 1. Auto-reply / System notification detection
  const isAuto = parsed.headers.has('x-auto-response-suppress') || 
                 parsed.headers.has('auto-submitted') || 
                 subject.includes('out of office') || 
                 subject.includes('auto-reply') ||
                 subject.includes('automatic reply') ||
                 subject.includes('delivery status notification') ||
                 subject.includes('failure notice') ||
                 subject.includes('undelivered') ||
                 subject.includes('returned mail') ||
                 subject.includes('delivery failure') ||
                 fromEmail.startsWith('noreply') ||
                 fromEmail.startsWith('no-reply') ||
                 fromEmail.startsWith('postmaster') ||
                 fromEmail.includes('mailer-daemon') ||
                 fromEmail.includes('googlemail.com') && fromEmail.includes('postmaster') ||
                 body.includes('this is an automated message') ||
                 body.includes('delivery subsystem');
  
  if (isAuto) {
    validation.isAutoReply = true;
    const isDelivery = subject.includes('delivery') || subject.includes('failure') || subject.includes('undelivered') || fromEmail.includes('mailer-daemon') || body.includes('delivery subsystem');
    validation.emailType = isDelivery ? 'delivery_failure' : 'auto_reply';
    validation.reasons.push(validation.emailType);
  }

  // 2. Spam / Promotional patterns
  const spamKeywords = ['unsubscribe', 'newsletter', 'advertisement', 'promotion', 'subscription'];
  if (spamKeywords.some(kw => subject.includes(kw) || body.includes(kw))) {
    validation.isSpam = true;
    validation.emailType = 'spam';
    validation.reasons.push('spam_keywords');
  }

  // 3. Empty content
  if (!body || body.trim().length < 5) {
    validation.isEmpty = true;
    validation.reasons.push('empty body');
  }

  // 4. Organization Domain Validation
  if (validation.emailType === 'valid_user_mail' && fromEmail) {
    const domainParts = fromEmail.split('@');
    const senderDomain = domainParts.length > 1 ? domainParts[1] : '';
    
    if (senderDomain) {
      const publicDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com'];
      const isPublic = publicDomains.includes(senderDomain.toLowerCase());

      // Check if a user with this email already exists for the tenant
      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE LOWER(email) = ? AND tenant_id = ? LIMIT 1',
        [fromEmail.toLowerCase(), tenantId]
      );

      if (existingUsers.length > 0) {
        validation.emailType = 'valid_user_mail';
      } else if (isPublic) {
        validation.emailType = 'invalid_domain';
        validation.reasons.push('public_domain_rejected');
      } else {
        validation.emailType = 'unregistered_domain';
      }
    } else {
      validation.emailType = 'invalid_domain';
      validation.reasons.push('no_domain');
    }
  }

  return validation;
}

/** User Identification & Creation */
async function findOrCreateUserForEmail(email, name, tenantId) {
  try {
    // 1. Check for existing user
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1',
      [email, tenantId]
    );

    if (existing.length > 0) {
      return { userId: existing[0].id, isNew: false };
    }

    // 2. Create new user if not found
    const [result] = await pool.execute(
      `INSERT INTO users (email, name, role, tenant_id, is_external, account_status, is_active) 
       VALUES (?, ?, 'user', ?, 0, 'active', 1)`,
      [email, name, tenantId]
    );

    return { userId: result.insertId, isNew: true };
  } catch (err) {
    console.error('❌ findOrCreateUserForEmail error:', err);
    return { userId: null, isNew: false };
  }
}

async function processInbox() {
  const config = getImapConfig();
  if (!config.enabled) {
    console.log('📧 IMAP incoming email processing disabled via IMAP_INCOMING_ENABLED=false');
    return;
  }
  if (!config.user || !config.pass) return;

  try {
    const imapClient = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      logger: false,
      socketTimeout: 30000,
      connectionTimeout: 30000
    });
    
    imapClient.on('error', err => {
      if (!err.message?.includes('closed')) {
        console.error('📧 IMAP Client Error:', err.message);
      }
    });

    client = imapClient;

    await imapClient.connect();
    const lock = await imapClient.getMailboxLock('INBOX');
    let processed = 0;
    
    try {
      const uids = await imapClient.search({ seen: false });
      if (uids && uids.length > 0) {
        // Process newest first
        uids.reverse();
        const batch = uids.slice(0, 20);
        
        for (const uid of batch) {
          try {
            const msg = await imapClient.fetchOne(uid, { source: true });
            if (!msg) continue;

            const parsed = await simpleParser(msg.source);
            const messageId = parsed.messageId;
            const fromEmail = parsed.from?.value?.[0]?.address || '';
            const fromName = parsed.from?.value?.[0]?.name || fromEmail.split('@')[0];
            const subject = parsed.subject || '(no subject)';
            const body = getRawBody(parsed);
            const tenantId = 1;

            const [existing] = await pool.execute('SELECT id FROM incoming_emails WHERE message_id = ? LIMIT 1', [messageId]);
            if (existing.length > 0) {
              await imapClient.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
              continue;
            }

            const ticketId = extractTicketIdFromSubject(subject);

            if (ticketId) {
              // Handle REPLY to existing ticket (Automatic)
              const [tickets] = await pool.execute(
                'SELECT id, tenant_id, assigned_to FROM cases WHERE id = ? AND tenant_id = ? LIMIT 1',
                [ticketId, tenantId]
              );

              if (tickets.length > 0) {
                const cleanText = stripQuotedContent(body) || body.substring(0, 2000);

                await ticketMessagesService.addMessage({
                  ticketId,
                  tenantId,
                  senderType: 'user',
                  senderName: fromName,
                  message: cleanText,
                  channel: 'email',
                  externalId: messageId
                });

                await pool.execute(
                  'INSERT INTO incoming_emails (tenant_id, sender_email, sender_name, subject, body, message_id, received_at, processing_status, linked_ticket_id, email_type) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)',
                  [tenantId, fromEmail, fromName, subject, body, messageId, 'processed', ticketId, 'valid_user_mail']
                );
                console.log(`📧 Email reply added to ticket #${ticketId} from ${fromEmail}`);
              } else {
                // Invalid ticket ID or missing ticket - ignore
                console.log(`📧 Email reply to non-existent ticket #${ticketId} from ${fromEmail} - ignored`);
                await pool.execute(
                  'INSERT INTO incoming_emails (tenant_id, sender_email, sender_name, subject, body, message_id, received_at, processing_status, email_type) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)',
                  [tenantId, fromEmail, fromName, subject, body, messageId, 'ignored', 'invalid_ticket']
                );
              }
            } else {
              // No ticket ID in subject - ignore (HCMS does not create tickets from email)
              console.log(`📧 Email from ${fromEmail} has no ticket ID in subject - ignored (ticket creation disabled)`);
              await pool.execute(
                'INSERT INTO incoming_emails (tenant_id, sender_email, sender_name, subject, body, message_id, received_at, processing_status, email_type) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)',
                [tenantId, fromEmail, fromName, subject, body, messageId, 'ignored', 'no_ticket_id']
              );
            }

            await imapClient.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
            processed++;
          } catch (msgErr) {
            console.error(`Error processing UID ${uid}:`, msgErr);
          }
        }
      }
    } finally {
      lock.release();
      await imapClient.logout();
    }
  } catch (err) {
    if (!err.message?.includes('closed')) {
      console.warn('Incoming email poll error:', err);
    }
  } finally {
    client = null;
  }
}

function startIncomingEmailPoller() {
  isShuttingDown = false;
  const config = getImapConfig();
  if (!config.user || !config.pass) return;

  console.log('📧 Email Intake Service started - polling for tickets and replies');
  const run = () => {
    processInbox().finally(() => {
      if (!isShuttingDown) pollTimer = setTimeout(run, POLL_INTERVAL_MS);
    });
  };
  run();
}

function stopIncomingEmailPoller() {
  isShuttingDown = true;
  if (pollTimer) clearTimeout(pollTimer);
  if (client) try { client.close(); } catch (_) {}
}

module.exports = { startIncomingEmailPoller, stopIncomingEmailPoller, processInbox };
