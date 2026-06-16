const express = require('express');
const router = express.Router();
const { pool } = require('../../../shared/database/database');
const { authenticateToken } = require('../../../shared/middleware/auth');
const { verifyTenantAccess, setTenantContext } = require('../../../shared/middleware/tenant');
const ticketService = require('../../services/ticketService');

// Apply middleware
router.use(authenticateToken);
router.use(setTenantContext);
router.use(verifyTenantAccess);

/**
 * POST /api/mail-review/approve-thread
 * Convert multiple related emails into ONE single ticket
 */
router.post('/approve-thread-bulk', async (req, res) => {
  console.log('POST /api/mail-review/approve-thread-bulk called with body:', req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { ids } = req.body; // Array of incoming_emails.ids
    const tenantId = req.tenantId;
    const actorId = req.user.id || req.user.userId;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No email IDs provided' });
    }

    // Get all emails in the thread
    const [emails] = await connection.query(
      'SELECT * FROM incoming_emails WHERE id IN (?) AND tenant_id = ?',
      [ids, tenantId]
    );

    if (emails.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Emails not found' });
    }

    const firstEmail = emails[0];
    const aiExtractionService = require('../../services/aiExtractionService');
    
    // Generate a combined professional summary
    const combined = await aiExtractionService.generateCombinedSummary(emails);
    const aiData = firstEmail.ai_extracted_fields || {};

    // 1. Create the ONE single ticket
    const ticketResult = await ticketService.createTicket({
      tenantId,
      name: firstEmail.sender_name,
      email: firstEmail.sender_email,
      product: aiData.product || 'IT Support',
      module: aiData.module || 'General',
      issueTitle: combined.final_summary || firstEmail.subject,
      description: combined.combined_description,
      issueType: aiData.issueType || 'Incident',
      priority: aiData.priority,
      source: 'email'
    }, req.user);

    // 2. Update status for ALL emails in the thread
    await connection.query(
      `UPDATE incoming_emails 
       SET processing_status = 'converted_to_ticket', 
           linked_ticket_id = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW() 
       WHERE id IN (?)`,
      [ticketResult.ticketId, actorId, ids]
    );

    await connection.commit();
    res.json({ 
      success: true, 
      message: 'Thread converted to a single ticket successfully',
      ticketId: ticketResult.ticketId 
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error approving thread conversion:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to approve thread' });
  } finally {
    connection.release();
  }
});

/**
 * GET /api/mail-review
 * List emails pending manager review
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    // Fetch emails pending review
    const [emails] = await pool.execute(`
      SELECT 
        e.*,
        u.name as existing_user_name,
        u.role as existing_user_role
      FROM incoming_emails e
      LEFT JOIN users u ON e.existing_user_id = u.id
      WHERE e.tenant_id = ? 
        AND e.processing_status = 'pending_review'
        AND e.email_type IN ('valid_user_mail', 'unregistered_domain')
      ORDER BY e.received_at DESC
    `, [tenantId]);

    // For each email, find possible duplicates or related tickets
    const enrichedEmails = await Promise.all(emails.map(async (email) => {
      // 1. Check for other pending emails from same sender
      const [otherPending] = await pool.execute(
        'SELECT id, subject, received_at FROM incoming_emails WHERE sender_email = ? AND id != ? AND processing_status = "pending_review"',
        [email.sender_email, email.id]
      );

      // 2. Check for existing open tickets from same sender
      const [openTickets] = await pool.execute(
        'SELECT id, issue_title, status, created_at FROM tickets WHERE email = ? AND status IN ("new", "in_progress", "escalated") ORDER BY created_at DESC LIMIT 5',
        [email.sender_email]
      );

      return {
        ...email,
        related: {
          pending_emails_count: otherPending.length,
          open_tickets: openTickets,
          is_possible_duplicate: otherPending.length > 0 || openTickets.some(t => t.issue_title.toLowerCase().includes(email.subject.toLowerCase()))
        }
      };
    }));

    res.json({ success: true, data: enrichedEmails });
  } catch (error) {
    console.error('Error fetching mail review inbox:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch mail review inbox' });
  }
});

/**
 * GET /api/mail-review/ticketed
 * List emails that have been converted to tickets
 */
router.get('/ticketed', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const [rows] = await pool.execute(`
      SELECT 
        e.*,
        t.status as ticket_status,
        a.name as assigned_agent_name
      FROM incoming_emails e
      LEFT JOIN tickets t ON e.linked_ticket_id = t.id
      LEFT JOIN agents a ON t.assigned_to = a.id
      WHERE e.tenant_id = ? 
        AND e.processing_status = 'converted_to_ticket'
      ORDER BY e.reviewed_at DESC
      LIMIT 50
    `, [tenantId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching ticketed emails:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticketed emails' });
  }
});

/**
 * POST /api/mail-review/:id/approve
 * Convert an email into a ticket
 */
router.post('/:id/approve', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params; // incoming_emails.id
    const tenantId = req.tenantId;
    const actorId = req.user.id || req.user.userId;

    // Get the email
    const [eRows] = await connection.execute(
      'SELECT * FROM incoming_emails WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (eRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const email = eRows[0];
    const ai = email.ai_extracted_fields || {};

    // 1. Create the ticket
    const ticketResult = await ticketService.createTicket({
      tenantId,
      name: email.sender_name,
      email: email.sender_email,
      product: ai.product || 'IT Support',
      module: ai.module || 'General',
      issueTitle: ai.summary || email.subject,
      description: ai.clean_description || email.body, // Use clean description if available
      issueType: ai.issueType || 'Incident',
      priority: ai.priority,
      source: 'email'
    }, req.user);

    // 2. Update the email status
    await connection.execute(
      `UPDATE incoming_emails 
       SET processing_status = 'converted_to_ticket', 
           linked_ticket_id = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW() 
       WHERE id = ?`,
      [ticketResult.ticketId, actorId, id]
    );

    await connection.commit();
    res.json({ 
      success: true, 
      message: 'Email converted to ticket successfully',
      ticketId: ticketResult.ticketId 
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error approving email conversion:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to approve email' });
  } finally {
    connection.release();
  }
});





/**
 * POST /api/mail-review/:id/ignore
 * Mark an email as ignored or spam
 */
router.post('/:id/ignore', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'ignored' or 'spam'
    const tenantId = req.tenantId;
    const actorId = req.user.id || req.user.userId;

    const status = type === 'spam' ? 'spam' : 'ignored';

    await pool.execute(
      `UPDATE incoming_emails 
       SET processing_status = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW() 
       WHERE id = ? AND tenant_id = ?`,
      [status, actorId, id, tenantId]
    );

    res.json({ success: true, message: `Email marked as ${status}` });
  } catch (error) {
    console.error('Error ignoring email:', error);
    res.status(500).json({ success: false, message: 'Failed to ignore email' });
  }
});

/**
 * Strip quoted/forwarded content from email body (local helper)
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
  return result.join('\n');
}

/**
 * GET /api/mail-review/continuation-queue
 * List emails pending continuation/duplicate review
 */
router.get('/continuation-queue', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const [rows] = await pool.execute(`
      SELECT 
        e.*,
        t.id as ticket_id,
        t.name as ticket_requester,
        t.issue_title as ticket_title,
        t.status as ticket_status,
        t.priority as ticket_priority,
        a.name as ticket_agent_name
      FROM incoming_emails e
      LEFT JOIN tickets t ON e.matched_ticket_id = t.id
      LEFT JOIN agents a ON t.assigned_to = a.id
      WHERE e.tenant_id = ? 
        AND e.processing_status = 'pending_continuation_review'
      ORDER BY e.received_at DESC
    `, [tenantId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching continuation queue:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch continuation queue' });
  }
});

/**
 * POST /api/mail-review/:id/continue-ticket
 * Accept continuation suggestion: Attach email reply to matched ticket
 */
router.post('/:id/continue-ticket', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const tenantId = req.tenantId;
    const actorId = req.user.id || req.user.userId;

    const [eRows] = await connection.execute(
      'SELECT * FROM incoming_emails WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (eRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const email = eRows[0];
    const ticketId = email.matched_ticket_id;

    if (!ticketId) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'No matched ticket ID associated with this email' });
    }

    // 1. Add email body as message to ticket
    const ticketMessagesService = require('../../services/ticketMessagesService');
    const cleanText = stripQuotedContent(email.body) || email.body.substring(0, 2000);
    
    await ticketMessagesService.addMessage({
      ticketId,
      tenantId,
      senderType: 'user',
      senderName: email.sender_name,
      message: cleanText,
      channel: 'email',
      externalId: email.message_id
    });

    // 2. Update incoming email status
    await connection.execute(
      `UPDATE incoming_emails 
       SET processing_status = 'converted_to_ticket', 
           linked_ticket_id = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW() 
       WHERE id = ?`,
      [ticketId, actorId, id]
    );

    await connection.commit();
    res.json({ success: true, message: 'Email successfully attached to existing ticket', ticketId });
  } catch (error) {
    await connection.rollback();
    console.error('Error continuing ticket:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to attach email to ticket' });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/mail-review/:id/new-ticket
 * Override continuation suggestion: Convert this email to a brand new ticket
 */
router.post('/:id/new-ticket', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const tenantId = req.tenantId;
    const actorId = req.user.id || req.user.userId;

    const [eRows] = await connection.execute(
      'SELECT * FROM incoming_emails WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (eRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const email = eRows[0];
    const ai = email.ai_extracted_fields || {};

    // 1. Create a brand new ticket
    const ticketResult = await ticketService.createTicket({
      tenantId,
      name: email.sender_name,
      email: email.sender_email,
      product: ai.product || 'IT Support',
      module: ai.module || 'General',
      issueTitle: ai.summary || email.subject,
      description: ai.clean_description || email.body,
      issueType: ai.issueType || 'Incident',
      priority: ai.priority || 'medium',
      userId: email.existing_user_id,
      source: 'email'
    }, req.user);

    // 2. Update incoming email status
    await connection.execute(
      `UPDATE incoming_emails 
       SET processing_status = 'converted_to_ticket', 
           linked_ticket_id = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW() 
       WHERE id = ?`,
      [ticketResult.ticketId, actorId, id]
    );

    await connection.commit();
    res.json({ success: true, message: 'New ticket created successfully from email', ticketId: ticketResult.ticketId });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating new ticket from continuation override:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to convert email to new ticket' });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/mail-review/:id/reassign-ticket
 * Manual Override: Attach email reply to a different, specified ticket
 */
router.post('/:id/reassign-ticket', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { ticketId } = req.body;
    const tenantId = req.tenantId;
    const actorId = req.user.id || req.user.userId;

    if (!ticketId) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Target ticket ID is required' });
    }

    const [eRows] = await connection.execute(
      'SELECT * FROM incoming_emails WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (eRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const email = eRows[0];

    // Verify target ticket exists
    const [tRows] = await connection.execute(
      'SELECT id FROM tickets WHERE id = ? AND tenant_id = ? LIMIT 1',
      [ticketId, tenantId]
    );

    if (tRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: `Target Ticket #${ticketId} not found` });
    }

    // 1. Add email body as message to manually specified ticket
    const ticketMessagesService = require('../../services/ticketMessagesService');
    const cleanText = stripQuotedContent(email.body) || email.body.substring(0, 2000);
    
    await ticketMessagesService.addMessage({
      ticketId,
      tenantId,
      senderType: 'user',
      senderName: email.sender_name,
      message: cleanText,
      channel: 'email',
      externalId: email.message_id
    });

    // 2. Update incoming email status and matched_ticket_id
    await connection.execute(
      `UPDATE incoming_emails 
       SET processing_status = 'converted_to_ticket', 
           linked_ticket_id = ?, 
           matched_ticket_id = ?,
           reviewed_by = ?, 
           reviewed_at = NOW() 
       WHERE id = ?`,
      [ticketId, ticketId, actorId, id]
    );

    await connection.commit();
    res.json({ success: true, message: `Email successfully attached to Ticket #${ticketId}`, ticketId });
  } catch (error) {
    await connection.rollback();
    console.error('Error reassigning ticket continuation:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to reassign email to ticket' });
  } finally {
    connection.release();
  }
});

module.exports = router;
