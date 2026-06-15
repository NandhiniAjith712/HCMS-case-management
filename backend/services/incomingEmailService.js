/**
 * Incoming Email Service - Handles both replies to existing tickets and new ticket creation.
 */
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { pool } = require('../database');
const ticketMessagesService = require('./ticketMessagesService');
const ticketService = require('./ticketService');
const aiExtractionService = require('./aiExtractionService');
const emailService = require('./emailService');
const emailCleaner = require('../utils/emailCleaner');

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
  return { user, pass, host, port, secure };
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
                'SELECT id, tenant_id, assigned_to FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1',
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
              } else {
                // Invalid ticket ID or missing ticket
                await pool.execute(
                  'INSERT INTO incoming_emails (tenant_id, sender_email, sender_name, subject, body, message_id, received_at, processing_status, email_type) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)',
                  [tenantId, fromEmail, fromName, subject, body, messageId, 'review_required', 'valid_user_mail']
                );
              }
            } else {
              // NEW TICKET REQUEST - Auto-convert or Send to Review Inbox
              const validation = await validateEmail(parsed, tenantId);
              
              let userId = null;
              // ONLY create a new user record in the users table IF AND ONLY IF the email is valid for this tenant!
              if (validation.emailType === 'valid_user_mail') {
                const userRes = await findOrCreateUserForEmail(fromEmail, fromName, tenantId);
                userId = userRes.userId;
              } else {
                // For unregistered custom domains or personal domains, we do NOT create a new user record.
                // We only link them if the email address already exists in the users table.
                const [existing] = await pool.execute(
                  'SELECT id FROM users WHERE LOWER(email) = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1',
                  [fromEmail.toLowerCase(), tenantId]
                );
                if (existing.length > 0) {
                  userId = existing[0].id;
                }
              }
              
              let processingStatus = 'pending_review';
              if (validation.emailType === 'invalid_domain') {
                processingStatus = 'ignored';
              } else if (validation.emailType === 'spam' || validation.emailType === 'auto_reply' || validation.emailType === 'delivery_failure') {
                processingStatus = 'ignored';
              }

              // Send Auto-Rejection Email if sending from Personal/Invalid Domain
              if (validation.emailType === 'invalid_domain') {
                try {
                  console.log(`🚫 Personal domain detected for ${fromEmail}. Sending rejection reply.`);
                  await emailService.sendPersonalDomainRejection(fromEmail, fromName);
                } catch (rejectErr) {
                  console.error('❌ Failed to send personal domain rejection email:', rejectErr);
                }
              }

              // AI Field Extraction & Similarity Detection
              let aiExtractedFields = null;
              let threadId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

              const preCleanedBody = emailCleaner.cleanEmailBody(body);

              let linkedTicketId = null;
              let isDuplicateOfActive = false;
              let matchedTicketId = null;
              let aiConfidenceScore = null;
              let aiContinuationReason = null;

              if (processingStatus === 'pending_review' || validation.emailType === 'valid_user_mail') {
                try {
                  const defaultFields = {
                    product: 'IT Support',
                    module: 'General',
                    issueType: 'Incident',
                    priority: 'medium',
                    summary: subject,
                    clean_description: preCleanedBody.substring(0, 1000)
                  };

                  // Retrieve allowed products for tenant
                  const tenantSpocService = require('./organizationService');
                  let allowedProducts = [];
                  let allowedModulesMap = {};
                  allowedProducts = await tenantSpocService.getProductsForTenant(tenantId);
                  const allowedProductIds = allowedProducts.map(p => p.id);
                  if (allowedProductIds.length > 0) {
                    const [modules] = await pool.query(
                      'SELECT m.name as module_name, p.name as product_name FROM modules m JOIN products p ON m.product_id = p.id WHERE m.status = "active" AND m.product_id IN (?)',
                      [allowedProductIds]
                    );
                    for (const mod of modules) {
                      if (!allowedModulesMap[mod.product_name]) {
                        allowedModulesMap[mod.product_name] = [];
                      }
                      allowedModulesMap[mod.product_name].push(mod.module_name);
                    }
                  }

                  aiExtractedFields = await withTimeout(
                    aiExtractionService.extractTicketFields(
                      subject,
                      preCleanedBody,
                      allowedProducts.map(p => p.name),
                      allowedModulesMap
                    ),
                    45000,
                    defaultFields
                  );

                  // Intelligent Email-to-Ticket Continuation & Duplicate Detection
                  let candidateTickets = [];

                  const [senderTickets] = await pool.execute(
                    `SELECT id, issue_title, description, status, created_at, product, module 
                     FROM tickets 
                     WHERE email = ? AND status NOT IN ('resolved', 'closed')
                     ORDER BY created_at DESC LIMIT 5`,
                    [fromEmail]
                  );

                  // Merge candidates, de-dupe by id
                  const candidateMap = new Map();
                  for (const t of senderTickets) {
                    candidateMap.set(t.id, t);
                  }
                  candidateTickets = Array.from(candidateMap.values());

                  // Fetch last 3 messages for each candidate
                  for (const candidate of candidateTickets) {
                    const [messages] = await pool.execute(
                      `SELECT sender_type as sender_role, message as body FROM ticket_messages 
                       WHERE ticket_id = ? AND tenant_id = ? 
                       ORDER BY created_at DESC LIMIT 3`,
                      [candidate.id, tenantId]
                    );
                    candidate.messages = messages.reverse(); // Chronological order
                  }

                  if (candidateTickets.length > 0) {
                    console.log(`🤖 Running AI Continuation check against ${candidateTickets.length} active tickets...`);
                    const cleanLatestMessage = preCleanedBody.substring(0, 1000);
                    const matchResult = await withTimeout(
                      aiExtractionService.detectContinuation(
                        {
                          subject,
                          body,
                          latest_message: cleanLatestMessage,
                          from_email: fromEmail,
                          cc: parsed.cc?.value?.map(c => c.address).join(', ') || '',
                          product: aiExtractedFields?.product || 'Unknown',
                          module: aiExtractedFields?.module || 'Unknown'
                        },
                        candidateTickets
                      ),
                      45000,
                      { decision: 'new', matchedTicketId: null, confidence: 0, reason: 'AI matching timed out.' }
                    );

                    aiConfidenceScore = matchResult.confidence;
                    aiContinuationReason = matchResult.reason;

                    if (matchResult.decision === 'continuation') {
                      matchedTicketId = matchResult.matchedTicketId;

                      if (aiConfidenceScore >= 0.75) {
                        // HIGH confidence: Automatic merge/append
                        isDuplicateOfActive = true;
                        linkedTicketId = matchedTicketId;
                        processingStatus = 'converted_to_ticket';
                        console.log(`🔗 HIGH confidence AI Continuation matched to ticket #${matchedTicketId}. Appending reply.`);

                        const cleanText = stripQuotedContent(body) || body.substring(0, 2000);
                        await ticketMessagesService.addMessage({
                          ticketId: matchedTicketId,
                          tenantId,
                          senderType: 'user',
                          senderName: fromName,
                          message: cleanText,
                          channel: 'email',
                          externalId: messageId
                        });
                      } else if (aiConfidenceScore >= 0.40) {
                        // MEDIUM confidence: Queue for manager review
                        processingStatus = 'pending_continuation_review';
                        console.log(`⚠️ MEDIUM confidence AI Continuation (${aiConfidenceScore}) to ticket #${matchedTicketId}. Sending to review queue.`);
                      }
                    }
                  }

                  // Similarity Check 2: Pending Emails (fallback if not matched to active ticket)
                  if (!isDuplicateOfActive && processingStatus !== 'pending_continuation_review') {
                    const [others] = await pool.execute(
                      'SELECT id, subject, body, thread_id FROM incoming_emails WHERE sender_email = ? AND processing_status = "pending_review" ORDER BY received_at DESC LIMIT 5',
                      [fromEmail]
                    );

                    for (const other of others) {
                      const sim = await withTimeout(
                        aiExtractionService.detectSimilarity({ subject, body }, other),
                        4000,
                        { isSameIssue: false, confidence: 0 }
                      );

                      if (sim && sim.isSameIssue) {
                        threadId = other.thread_id || `t_cluster_${other.id}`;
                        if (!other.thread_id) {
                          await pool.execute('UPDATE incoming_emails SET thread_id = ? WHERE id = ?', [threadId, other.id]);
                        }
                        break;
                      }
                    }
                  }
                } catch (aiErr) {
                  console.error('📧 AI Analysis failed for incoming email:', aiErr.message);
                }
              }

              // DIRECT TICKET INGESTION FOR VALID TENANT USERS
              if (!linkedTicketId && validation.emailType === 'valid_user_mail' && userId && processingStatus !== 'ignored' && processingStatus !== 'pending_continuation_review') {
                try {
                  console.log(`🚀 Valid tenant user detected for ${fromEmail}. Directly creating ticket.`);
                  
                  const product = aiExtractedFields?.product || 'IT Support';
                  const module = aiExtractedFields?.module || 'General';
                  const issueType = aiExtractedFields?.issueType || 'Incident';
                  const priority = aiExtractedFields?.priority || 'medium';
                  const issueTitle = aiExtractedFields?.summary || subject;
                  const description = aiExtractedFields?.clean_description || preCleanedBody;

                  const ticketResult = await ticketService.createTicket({
                    tenantId,
                    name: fromName,
                    email: fromEmail,
                    product,
                    module,
                    issueTitle,
                    description,
                    issueType,
                    priority,
                    userId,
                    source: 'email'
                  }, { id: userId, name: fromName, role: 'user' });

                  if (ticketResult && ticketResult.success) {
                    linkedTicketId = ticketResult.ticketId;
                    processingStatus = 'converted_to_ticket';
                    console.log(`✅ Ticket #${linkedTicketId} created successfully for ${fromEmail}`);
                  }
                } catch (ticketErr) {
                  console.error('❌ Direct ticket creation failed, falling back to review queue:', ticketErr);
                  processingStatus = 'pending_review';
                }
              }

              // Send Notification Email to Support Managers if Custom Domain is Unregistered
              if (validation.emailType === 'unregistered_domain') {
                try {
                  console.log(`⚠️ Unregistered custom domain detected for ${fromEmail}. Notifying support managers.`);
                  const appNotificationService = require('./appNotificationService');
                  const [managers] = await pool.execute('SELECT id, email, name FROM agents WHERE role = "support_manager" AND is_active = 1');
                  for (const mgr of managers) {
                    await emailService.sendUnregisteredDomainNotification(mgr.email, mgr.name, fromEmail, subject, body);
                    await appNotificationService.notifyManagerStaffInApp(pool, {
                      tenantId,
                      managerStaffId: mgr.id,
                      title: 'Unregistered Domain Alert',
                      description: `Email from unregistered domain: ${fromEmail}. Subject: ${subject}`,
                      dedupeKey: `unreg_dom:${messageId}:${mgr.id}`
                    });
                  }
                } catch (notifyErr) {
                  console.error('❌ Failed to send manager unregistered domain alert:', notifyErr);
                }
              }

              await pool.execute(
                `INSERT INTO incoming_emails (
                  tenant_id, sender_email, sender_name, subject, body, 
                  message_id, received_at, processing_status, email_type, 
                  existing_user_id, validation_result, ai_extracted_fields, thread_id, 
                  linked_ticket_id, matched_ticket_id, ai_confidence_score, ai_continuation_reason
                ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  tenantId, fromEmail, fromName, subject, body, 
                  messageId, processingStatus, validation.emailType, 
                  userId, JSON.stringify(validation), 
                  aiExtractedFields ? JSON.stringify(aiExtractedFields) : null,
                  threadId, linkedTicketId, matchedTicketId || null,
                  aiConfidenceScore || null, aiContinuationReason || null
                ]
              );

              if (processingStatus === 'pending_review') {
                console.log(`📧 New email from ${fromEmail} added to Manager Review Inbox`);
              } else if (processingStatus === 'pending_continuation_review') {
                console.log(`📧 Potential duplicate/continuation email from ${fromEmail} added to Continuation Queue`);
              }
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
