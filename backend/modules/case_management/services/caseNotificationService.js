const nodemailer = require('nodemailer');
const { pool } = require('../../shared/database/database');

/**
 * Centralized email notification service for HCMS v2 case management.
 *
 * Design notes:
 * - All public methods accept a case id and resolve the case/audience internally.
 * - Only normal reporting_mode tickets trigger emails. Confidential/anonymous/sensitive
 *   cases are silently skipped so the same framework can be extended later.
 * - All emails share a single HTML template with a consistent ticket information block.
 * - Controllers should invoke these methods and catch errors; failed emails must not
 *   fail the API request.
 */
class CaseNotificationService {
  constructor() {
    this.transporter = null;
    this._initTransporter();
  }

  _getSmtpConfig() {
    const user = process.env.SMTP_EMAIL || process.env.EMAIL_USER;
    const rawPass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASS;
    const pass = rawPass ? String(rawPass).replace(/\s+/g, '') : rawPass;
    const fromName = process.env.EMAIL_FROM_NAME || 'Case Management Team';
    const fromAddress = process.env.SMTP_EMAIL || process.env.EMAIL_FROM_ADDRESS || user;
    return { user, pass, fromName, fromAddress };
  }

  _initTransporter() {
    try {
      const { user, pass } = this._getSmtpConfig();
      console.log('📧 SMTP Config Debug:', { user: user ? `${user.substring(0, 3)}***@${user.split('@')[1]}` : 'missing', pass: pass ? '***present***' : 'missing' });
      if (!user || !pass) {
        console.warn('⚠️ SMTP credentials not configured (SMTP_EMAIL/SMTP_PASSWORD). Case email notifications disabled.');
        return;
      }

      const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT) || 587;
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_SERVER || process.env.EMAIL_HOST || 'smtp.gmail.com',
        port,
        secure: String(port) === '465',
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });

      console.log('✅ Case notification service (SMTP) initialized');
    } catch (error) {
      console.error('❌ Error initializing case notification service:', error);
    }
  }

  getAppUrl() {
    return process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  _ticketViewUrl(caseId) {
    return `${this.getAppUrl()}/hcms/tickets/${caseId}`;
  }

  _formatTicketId(caseRow) {
    return caseRow.ticket_code || `CM-${new Date().getFullYear()}-${String(caseRow.id).padStart(6, '0')}`;
  }

  _formatDate(date) {
    return date
      ? new Date(date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
  }

  _escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  _buildTicketInfoBlock(caseRow) {
    const ticketId = this._formatTicketId(caseRow);
    return `
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px;margin:18px 0;">
        <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Ticket Information</div>
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;color:#0F172A;table-layout:fixed;">
          <tr>
            <td class="ticket-info-label" width="120" valign="top" style="padding:6px 8px 6px 0;color:#64748B;white-space:nowrap;">Ticket ID</td>
            <td class="ticket-info-value" valign="top" style="padding:6px 0;font-weight:600;word-break:break-word;">${this._escapeHtml(ticketId)}</td>
          </tr>
          <tr>
            <td class="ticket-info-label" width="120" valign="top" style="padding:6px 8px 6px 0;color:#64748B;white-space:nowrap;">Subject</td>
            <td class="ticket-info-value" valign="top" style="padding:6px 0;word-break:break-word;">${this._escapeHtml(caseRow.title || '—')}</td>
          </tr>
          <tr>
            <td class="ticket-info-label" width="120" valign="top" style="padding:6px 8px 6px 0;color:#64748B;white-space:nowrap;">Category</td>
            <td class="ticket-info-value" valign="top" style="padding:6px 0;word-break:break-word;">${this._escapeHtml(caseRow.category || 'General')}</td>
          </tr>
          <tr>
            <td class="ticket-info-label" width="120" valign="top" style="padding:6px 8px 6px 0;color:#64748B;white-space:nowrap;">Priority</td>
            <td class="ticket-info-value" valign="top" style="padding:6px 0;text-transform:capitalize;word-break:break-word;">${this._escapeHtml(caseRow.priority || 'medium')}</td>
          </tr>
          <tr>
            <td class="ticket-info-label" width="120" valign="top" style="padding:6px 8px 6px 0;color:#64748B;white-space:nowrap;">Status</td>
            <td class="ticket-info-value" valign="top" style="padding:6px 0;font-weight:600;text-transform:capitalize;word-break:break-word;">${this._escapeHtml(caseRow.status || 'new')}</td>
          </tr>
          <tr>
            <td class="ticket-info-label" width="120" valign="top" style="padding:6px 8px 6px 0;color:#64748B;white-space:nowrap;">Last Updated</td>
            <td class="ticket-info-value" valign="top" style="padding:6px 0;word-break:break-word;">${this._escapeHtml(this._formatDate(caseRow.updated_at))}</td>
          </tr>
        </table>
      </div>
    `;
  }

  _buildEmail({ title, greeting, message, caseRow, actionLabel = 'View Ticket', isAnonymous = false }) {
    const ticketInfo = this._buildTicketInfoBlock(caseRow);
    const actionUrl = this._ticketViewUrl(caseRow.id);
    const displayTitle = isAnonymous ? `Anonymous ${title}` : title;
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>${this._escapeHtml(title)}</title>
        <style type="text/css">
          @media screen and (max-width: 600px) {
            .email-container { width: 100% !important; max-width: 100% !important; }
            .email-body { padding: 16px !important; }
            .email-header { padding: 16px 18px !important; }
            .ticket-info-label { width: 110px !important; white-space: normal !important; }
            .ticket-info-value { word-break: break-word !important; }
            .action-button { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;-webkit-font-smoothing:antialiased;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F1F5F9;padding:24px 0;">
          <tr>
            <td align="center">
              <table class="email-container" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;max-width:560px;">
                <tr>
                  <td class="email-header" style="background:#0F172A;padding:20px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="color:#FFFFFF;font-size:16px;font-weight:700;">Case Management</td>
                        <td align="right" style="color:#94A3B8;font-size:12px;">${this._escapeHtml(displayTitle)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="email-body" style="padding:24px;">
                    <p style="margin:0 0 12px;font-size:15px;color:#0F172A;"><strong>${this._escapeHtml(greeting)}</strong>,</p>
                    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#475569;">${message}</p>
                    ${ticketInfo}
                    <a class="action-button" href="${actionUrl}" style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;">${this._escapeHtml(actionLabel)}</a>
                    <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;">This is an automated email. Please do not reply directly.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  async _getUser(userId) {
    if (!userId) return null;
    const [rows] = await pool.execute('SELECT id, name, email FROM users WHERE id = ?', [userId]);
    return rows[0] || null;
  }

  async _getCase(caseId) {
    const [rows] = await pool.execute(
      `SELECT c.*,
              u.name AS reporter_name,
              u.email AS reporter_email,
              a.name AS assignee_name,
              a.email AS assignee_email
       FROM cases c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE c.id = ?`,
      [caseId]
    );
    return rows[0] || null;
  }

  async _getManagerEmails() {
    const [rows] = await pool.execute(
      `SELECT email FROM users
       WHERE role IN ('department_head', 'hr_manager', 'hr_executive', 'system_admin')
         AND is_active = 1
         AND email IS NOT NULL`
    );
    return rows.map(r => r.email).filter(Boolean);
  }

  async _send({ to, subject, html, text = '' }) {
    if (!this.transporter) {
      console.warn('Case email not sent: transporter not configured');
      return { sent: false, reason: 'transporter_not_configured' };
    }
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (!recipients.length) return { sent: false, reason: 'no_recipients' };

    const { fromName, fromAddress } = this._getSmtpConfig();
    const result = await this.transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: recipients.join(', '),
      subject,
      html,
      text
    });
    return { sent: true, messageId: result.messageId };
  }

  _isNormalTicket(caseRow) {
    return !caseRow.reporting_mode || caseRow.reporting_mode === 'normal';
  }

  _isAnonymousTicket(caseRow) {
    return caseRow.reporting_mode === 'anonymous';
  }

  _shouldSendEmail(caseRow) {
    return this._isNormalTicket(caseRow) || this._isAnonymousTicket(caseRow);
  }

  async _withCase(caseId, builder) {
    const caseRow = await this._getCase(caseId);
    if (!caseRow || !this._shouldSendEmail(caseRow)) return { sent: false, reason: 'not_supported_ticket_or_missing' };
    const email = await builder(caseRow);
    if (!email) return { sent: false, reason: 'no_email_built' };
    return this._send(email);
  }

  // ─────────────────────────────────────────────────────────────
  // Public event methods
  // ─────────────────────────────────────────────────────────────

  async notifyTicketCreated(caseId) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      if (!creator || !creator.email) return null;
      const ticketId = this._formatTicketId(caseRow);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
      const message = isAnonymous
        ? 'Your Anonymous Case has been created successfully. Your identity has been protected and will not be visible to the assigned case owner or anyone handling the investigation. We will notify you whenever there is an update.'
        : 'Your case has been created successfully. Our support team will review your request and provide updates as the case progresses.';
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';
      return {
        to: [creator.email],
        subject: `${subjectPrefix} Created | Ticket #${ticketId}`,
        html: this._buildEmail({
          title: 'Case Created',
          greeting,
          message,
          caseRow,
          isAnonymous
        }),
        text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} has been created. Ticket #${ticketId}.`
      };
    });
  }

  async notifyTicketAssigned(caseId) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      const assignee = await this._getUser(caseRow.assigned_to);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const ticketId = this._formatTicketId(caseRow);
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';

      // Employee email
      const employeeEmail = creator?.email;
      // Resolver email
      const resolverEmail = assignee?.email;

      if (!employeeEmail && !resolverEmail) return null;

      // Send separate emails to employee and resolver with different content
      const results = [];

      if (employeeEmail) {
        const employeeGreeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
        const employeeMessage = isAnonymous
          ? 'Your Anonymous Case has been assigned to the appropriate team. No action is required from your side.'
          : 'Your case has been assigned to the appropriate support team and is currently under review.';
        results.push(this._send({
          to: [employeeEmail],
          subject: `${subjectPrefix} Assigned | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Assigned',
            greeting: employeeGreeting,
            message: employeeMessage,
            caseRow,
            isAnonymous
          }),
          text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} has been assigned. Ticket #${ticketId}.`
        }));
      }

      if (resolverEmail) {
        const resolverMessage = isAnonymous
          ? 'You have been assigned an Anonymous Case. Reporter information has been intentionally hidden.'
          : 'You have been assigned a new case. Please review the details and take appropriate action.';
        results.push(this._send({
          to: [resolverEmail],
          subject: `${subjectPrefix} Assigned | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Assigned',
            greeting: `Hello ${assignee.name || 'Resolver'}`,
            message: resolverMessage,
            caseRow,
            isAnonymous
          }),
          text: `Case assigned. Ticket #${ticketId}.`
        }));
      }

      return { sent: results.some(r => r.sent) };
    });
  }

  async notifyStatusChanged(caseId, newStatus) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      if (!creator || !creator.email) return null;
      const ticketId = this._formatTicketId(caseRow);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';
      const message = isAnonymous
        ? `The status of your Anonymous Case has been updated.<br><br>Current Status: <strong style="color:#0F172A;text-transform:capitalize;">${this._escapeHtml(newStatus)}</strong>`
        : `The status of your case has been updated.<br><br>Current Status: <strong style="color:#0F172A;text-transform:capitalize;">${this._escapeHtml(newStatus)}</strong>`;
      return {
        to: [creator.email],
        subject: `${subjectPrefix} Updated | Ticket #${ticketId}`,
        html: this._buildEmail({
          title: 'Case Updated',
          greeting,
          message,
          caseRow,
          isAnonymous
        }),
        text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} status has been updated to ${newStatus}. Ticket #${ticketId}.`
      };
    });
  }

  async notifyPublicReply(caseId, isEmployeeReply) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      const assignee = await this._getUser(caseRow.assigned_to);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const ticketId = this._formatTicketId(caseRow);
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';

      const results = [];

      if (isEmployeeReply) {
        // Employee replied - notify resolver
        if (assignee && assignee.email) {
          const greeting = `Hello ${assignee.name || 'Resolver'}`;
          const message = isAnonymous
            ? 'A new response has been added to the Anonymous Case. Please log in to view the latest update.'
            : 'The employee has added a new response to the case. Please log in to view the latest conversation.';
          results.push(this._send({
            to: [assignee.email],
            subject: `New Response | Ticket #${ticketId}`,
            html: this._buildEmail({
              title: 'New Response',
              greeting,
              message,
              caseRow,
              isAnonymous
            }),
            text: `A new response has been added. Ticket #${ticketId}.`
          }));
        }
      } else {
        // Resolver replied - notify employee
        if (creator && creator.email) {
          const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
          const message = 'A new response has been added to your case. Please log in to view the latest conversation.';
          results.push(this._send({
            to: [creator.email],
            subject: `New Response | Ticket #${ticketId}`,
            html: this._buildEmail({
              title: 'New Response',
              greeting,
              message,
              caseRow,
              isAnonymous
            }),
            text: `A new response has been added to your case. Ticket #${ticketId}.`
          }));
        }
      }

      if (!results.length) return null;
      return { sent: results.some(r => r.sent) };
    });
  }

  async notifyReassigned(caseId, previousAssigneeId) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      const newAssignee = await this._getUser(caseRow.assigned_to);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const ticketId = this._formatTicketId(caseRow);
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';

      const results = [];

      // Notify employee
      if (creator && creator.email) {
        const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
        const message = isAnonymous
          ? 'Your Anonymous Case has been reassigned to another authorized case owner.'
          : 'Your case has been reassigned to another support representative to ensure faster resolution.';
        results.push(this._send({
          to: [creator.email],
          subject: `${subjectPrefix} Reassigned | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Reassigned',
            greeting,
            message,
            caseRow,
            isAnonymous
          }),
          text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} has been reassigned. Ticket #${ticketId}.`
        }));
      }

      // Notify new assignee
      if (newAssignee && newAssignee.email) {
        const greeting = `Hello ${newAssignee.name || 'Resolver'}`;
        const message = isAnonymous
          ? 'Anonymous Case assigned. Reporter details remain hidden.'
          : 'You have been assigned a new case. Please review the details and take appropriate action.';
        results.push(this._send({
          to: [newAssignee.email],
          subject: `${subjectPrefix} Assigned | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Assigned',
            greeting,
            message,
            caseRow,
            isAnonymous
          }),
          text: `Case assigned. Ticket #${ticketId}.`
        }));
      }

      if (!results.length) return null;
      return { sent: results.some(r => r.sent) };
    });
  }

  async notifyEscalated(caseId, escalatedToId) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      const escalatedTo = await this._getUser(escalatedToId || caseRow.assigned_to);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const ticketId = this._formatTicketId(caseRow);
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';

      const results = [];

      // Notify employee
      if (creator && creator.email) {
        const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
        const message = isAnonymous
          ? 'Your Anonymous Case has been escalated for further review. No action is required from your side.'
          : 'Your case has been escalated for further review. No action is required from your side.';
        results.push(this._send({
          to: [creator.email],
          subject: `${subjectPrefix} Escalated | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Escalated',
            greeting,
            message,
            caseRow,
            isAnonymous
          }),
          text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} has been escalated. Ticket #${ticketId}.`
        }));
      }

      // Notify escalated resolver
      if (escalatedTo && escalatedTo.email) {
        const greeting = `Hello ${escalatedTo.name || 'Resolver'}`;
        const message = isAnonymous
          ? 'Anonymous Case escalated. Reporter identity is protected.'
          : 'A case has been escalated to you for further review. Please review the details and take appropriate action.';
        results.push(this._send({
          to: [escalatedTo.email],
          subject: `${subjectPrefix} Escalated | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Escalated',
            greeting,
            message,
            caseRow,
            isAnonymous
          }),
          text: `Case escalated. Ticket #${ticketId}.`
        }));
      }

      if (!results.length) return null;
      return { sent: results.some(r => r.sent) };
    });
  }

  async notifyResolved(caseId) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      if (!creator || !creator.email) return null;
      const ticketId = this._formatTicketId(caseRow);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';
      const message = isAnonymous
        ? 'Your Anonymous Case has been resolved. Please review the resolution. If the issue still exists, you may reopen the case within the configured period.'
        : 'Your case has been marked as Resolved. Please review the provided resolution. If the issue persists, you may reopen the case within the configured period.';
      return {
        to: [creator.email],
        subject: `${subjectPrefix} Resolved | Ticket #${ticketId}`,
        html: this._buildEmail({
          title: 'Case Resolved',
          greeting,
          message,
          caseRow,
          isAnonymous
        }),
        text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} has been resolved. Ticket #${ticketId}.`
      };
    });
  }

  async notifyClosed(caseId) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      if (!creator || !creator.email) return null;
      const ticketId = this._formatTicketId(caseRow);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';
      const message = isAnonymous
        ? 'Your Anonymous Case has been closed. Thank you for using Case Management.'
        : 'Your case has been successfully closed. Thank you for using the Case Management system.';
      return {
        to: [creator.email],
        subject: `${subjectPrefix} Closed | Ticket #${ticketId}`,
        html: this._buildEmail({
          title: 'Case Closed',
          greeting,
          message,
          caseRow,
          isAnonymous
        }),
        text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} has been closed. Ticket #${ticketId}.`
      };
    });
  }

  async notifyReopened(caseId) {
    return this._withCase(caseId, async (caseRow) => {
      const creator = await this._getUser(caseRow.created_by);
      const assignee = await this._getUser(caseRow.assigned_to);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const ticketId = this._formatTicketId(caseRow);
      const subjectPrefix = isAnonymous ? 'Anonymous Case' : 'Case';

      const results = [];

      // Notify employee
      if (creator && creator.email) {
        const greeting = isAnonymous ? 'Hello' : `Hello ${creator.name || 'Employee'}`;
        const message = isAnonymous
          ? 'Your Anonymous Case has been reopened successfully.'
          : 'Your case has been reopened and assigned back to the support team for further investigation.';
        results.push(this._send({
          to: [creator.email],
          subject: `${subjectPrefix} Reopened | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Reopened',
            greeting,
            message,
            caseRow,
            isAnonymous
          }),
          text: `${isAnonymous ? 'Your Anonymous Case' : 'Your case'} has been reopened. Ticket #${ticketId}.`
        }));
      }

      // Notify assignee
      if (assignee && assignee.email) {
        const greeting = `Hello ${assignee.name || 'Resolver'}`;
        const message = isAnonymous
          ? 'Anonymous Case reopened. Reporter remains Anonymous.'
          : 'A case has been reopened and assigned to you for further investigation.';
        results.push(this._send({
          to: [assignee.email],
          subject: `${subjectPrefix} Reopened | Ticket #${ticketId}`,
          html: this._buildEmail({
            title: 'Case Reopened',
            greeting,
            message,
            caseRow,
            isAnonymous
          }),
          text: `Case reopened. Ticket #${ticketId}.`
        }));
      }

      if (!results.length) return null;
      return { sent: results.some(r => r.sent) };
    });
  }

  async notifySLAWarning(caseId) {
    return this._withCase(caseId, async (caseRow) => {
      const assignee = await this._getUser(caseRow.assigned_to);
      if (!assignee || !assignee.email) return null;
      const ticketId = this._formatTicketId(caseRow);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const message = isAnonymous
        ? 'This Anonymous Case is approaching its SLA deadline and requires immediate attention.'
        : 'This ticket is approaching its SLA deadline and requires immediate attention.';
      return {
        to: [assignee.email],
        subject: `SLA Warning | Ticket #${ticketId}`,
        html: this._buildEmail({
          title: 'SLA Warning',
          greeting: `Hello ${assignee.name || 'Resolver'}`,
          message,
          caseRow,
          isAnonymous
        }),
        text: `SLA warning for ticket #${ticketId}.`
      };
    });
  }

  async notifySLABreach(caseId) {
    return this._withCase(caseId, async (caseRow) => {
      const assignee = await this._getUser(caseRow.assigned_to);
      const managerEmails = await this._getManagerEmails();
      const recipients = [];
      if (assignee && assignee.email) recipients.push(assignee.email);
      managerEmails.forEach(e => {
        if (!recipients.includes(e)) recipients.push(e);
      });
      if (!recipients.length) return null;

      const ticketId = this._formatTicketId(caseRow);
      const isAnonymous = this._isAnonymousTicket(caseRow);
      const message = isAnonymous
        ? 'This Anonymous Case has exceeded the configured SLA and requires immediate escalation.'
        : 'This ticket has exceeded the configured SLA and requires immediate escalation.';
      return {
        to: recipients,
        subject: `SLA Breached | Ticket #${ticketId}`,
        html: this._buildEmail({
          title: 'SLA Breached',
          greeting: `Hello ${assignee?.name || 'Team'}`,
          message,
          caseRow,
          isAnonymous
        }),
        text: `SLA breached for ticket #${ticketId}.`
      };
    });
  }
}

module.exports = new CaseNotificationService();
