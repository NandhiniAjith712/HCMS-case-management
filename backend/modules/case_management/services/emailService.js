const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../config.env') });

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Get base URL for public ticket links (SMTP confirmations, etc.)
   * Uses PUBLIC_BASE_URL, or falls back to localhost:3000
   */
  getAppUrl() {
    return process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  buildAuthEntryUrl(baseUrl, targetPath, options = {}) {
    const cleanBase = String(baseUrl || this.getAppUrl()).replace(/\/+$/, '');
    const target = String(targetPath || '/').startsWith('/') ? String(targetPath || '/') : `/${String(targetPath || '/')}`;
    const params = new URLSearchParams();
    params.set('target', target);
    if (options.email) params.set('e', String(options.email).trim());
    if (options.name) params.set('u', String(options.name).trim());
    if (options.roleHint) params.set('roleHint', String(options.roleHint).trim());
    return `${cleanBase}/auth-entry?${params.toString()}`;
  }

  /**
   * Get SMTP auth: prefer SMTP_* vars, fallback to legacy EMAIL_*
   */
  _getSmtpConfig() {
    const user = process.env.SMTP_EMAIL || process.env.EMAIL_USER;
    const rawPass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASS;
    const pass = rawPass ? String(rawPass).replace(/\s+/g, '') : rawPass;
    const fromName = process.env.EMAIL_FROM_NAME || 'ITSM Support Team';
    const fromAddress = process.env.SMTP_EMAIL || process.env.EMAIL_FROM_ADDRESS || user;
    return { user, pass, fromName, fromAddress };
  }

  initializeTransporter() {
    try {
      const { user, pass } = this._getSmtpConfig();
      if (!user || !pass) {
        console.warn('⚠️ SMTP credentials not configured (SMTP_EMAIL/SMTP_PASSWORD or EMAIL_USER/EMAIL_PASS). Email sending disabled.');
        return;
      }

      const rawTransporter = nodemailer.createTransport({
        host: process.env.SMTP_SERVER || process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT) || 587,
        secure: (process.env.SMTP_PORT || process.env.EMAIL_PORT) === '465',
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });

      this.transporter = {
        sendMail: async (mailOptions) => {
          const ticketIdMatch = mailOptions.subject ? mailOptions.subject.match(/#(\d+)/) : null;
          const ticketId = ticketIdMatch ? Number(ticketIdMatch[1]) : null;
          if (ticketId) {
            try {
              const { pool } = require('../../shared/database/database');
              const [tickets] = await pool.execute(
                'SELECT tenant_id, product_id FROM tickets WHERE id = ?',
                [ticketId]
              );
              if (tickets.length > 0) {
                const { tenant_id, product_id } = tickets[0];
                const ccEmails = [];

                // Fetch Tenant-level Org SPOCs (org_spoc role at tenant level)
                const [orgSpocs] = await pool.execute(
                  `SELECT u.email FROM users u
                   WHERE u.tenant_id = ? AND u.role = 'org_spoc' AND u.is_active = TRUE`,
                  [tenant_id]
                );
                orgSpocs.forEach(s => {
                  if (s.email) ccEmails.push(s.email.trim().toLowerCase());
                });

                // Fetch Product SPOCs
                if (product_id) {
                  const [prodSpocs] = await pool.execute(
                    `SELECT u.email FROM users u
                     JOIN product_spoc_mapping psm ON u.id = psm.spoc_user_id
                     WHERE u.tenant_id = ? AND psm.product_id = ? AND u.role = 'product_spoc' AND u.is_active = TRUE`,
                    [tenant_id, product_id]
                  );
                  prodSpocs.forEach(s => {
                    if (s.email) ccEmails.push(s.email.trim().toLowerCase());
                  });
                }

                const uniqueCc = [...new Set(ccEmails)];
                if (uniqueCc.length > 0) {
                    const existingCc = mailOptions.cc 
                      ? (Array.isArray(mailOptions.cc) ? mailOptions.cc.join(', ') : String(mailOptions.cc))
                      : '';
                    const newCcList = [existingCc, ...uniqueCc].filter(Boolean).join(', ');
                    mailOptions.cc = newCcList;
                    console.log(`📎 Auto-CC SPOCs [${uniqueCc.join(', ')}] added to ticket #${ticketId} email`);
                }
              }
            } catch (dbErr) {
              console.warn('⚠️ Auto-CC SPOC lookup failed:', dbErr.message);
            }
          }
          return rawTransporter.sendMail(mailOptions);
        }
      };

      console.log('✅ Email service (SMTP) initialized successfully with dynamic SPOC Auto-CC interceptor');
    } catch (error) {
      console.error('❌ Error initializing email service:', error);
    }
  }

  // Send welcome email to first-time support URL users (with personalized URL to save)
  async sendSupportWelcomeEmail(customerEmail, customerName, productSlug, personalizedUrl) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping support welcome email');
        return { success: false, error: 'Email not configured' };
      }

      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = 'Welcome to ITSM Support – Your personalized support link';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#3b82f6;margin-bottom:10px">🎫 ITSM Support</div>
              <h1>Welcome to Our Support Platform</h1>
            </div>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>Welcome to our support platform! You can use this link anytime you need to raise a ticket or view your support requests.</p>
            <div style="background:#f8fafc;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #3b82f6">
              <p style="margin:0 0 10px 0;font-weight:bold">Your personalized support URL:</p>
              <p style="margin:0;word-break:break-all"><a href="${personalizedUrl}" style="color:#3b82f6">${personalizedUrl}</a></p>
              <p style="margin:10px 0 0 0;font-size:14px;color:#6b7280">Save this link for quick access whenever you need support.</p>
            </div>
            <div style="text-align:center;margin-top:25px">
              <a href="${personalizedUrl}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Open Support</a>
            </div>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${customerName || 'Customer'},\n\nWelcome to our support platform! Save this URL to access support whenever you need:\n\n${personalizedUrl}\n\nDo not reply to this email.`;

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Support welcome email sent to ${customerEmail}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending support welcome email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send staff account setup email with password creation link (time-limited token)
   */
  async sendStaffSetupEmail(staffEmail, staffName, setupLink) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping staff setup email');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = 'Set Up Your ITSM Staff Account';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#3b82f6;margin-bottom:10px">🎫 ITSM Ticketing</div>
              <h1>Set Up Your Account</h1>
            </div>
            <p>Hi <strong>${staffName || 'Staff Member'}</strong>,</p>
            <p>A staff account has been created for you. Click the link below to set your password and activate your account.</p>
            <p style="color:#6b7280;font-size:14px">This link expires in 7 days.</p>
            <div style="text-align:center;margin:25px 0">
              <a href="${setupLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Set My Password</a>
            </div>
            <p style="font-size:14px;color:#6b7280">Or copy this link: <a href="${setupLink}" style="word-break:break-all">${setupLink}</a></p>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${staffName || 'Staff Member'},\n\nA staff account has been created for you. Set your password (link expires in 7 days):\n\n${setupLink}\n\nDo not reply to this email.`;

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: staffEmail,
        subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Staff setup email sent to ${staffEmail}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending staff setup email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendEmailVerificationEmail(userEmail, userName, verificationLink, expiresAt) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping verification email');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = 'Verify your email to activate your account';
      const expiresText = expiresAt ? new Date(expiresAt).toUTCString() : 'soon';
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Activate your account</h2>
            <p>Hi <strong>${userName || 'User'}</strong>,</p>
            <p>Your account has been created and is currently pending email verification.</p>
            <p>Please verify your email to activate access.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${verificationLink}" style="display:inline-block;background:#2563eb;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Verify Email</a>
            </div>
            <p style="font-size:14px;color:#4b5563">This link expires at <strong>${expiresText}</strong>.</p>
            <p style="font-size:14px;color:#4b5563">If you cannot click the button, copy this URL into your browser:</p>
            <p style="word-break:break-all;font-size:14px"><a href="${verificationLink}">${verificationLink}</a></p>
            <p style="font-size:13px;color:#6b7280;margin-top:24px">If you did not request this account, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${userName || 'User'},\n\nYour account is pending email verification.\nVerify using this link: ${verificationLink}\n\nThis link expires at ${expiresText}.\nIf you did not request this account, ignore this email.`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: userEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendCustomerAccessLinkEmail(userEmail, userName, accessLink) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping customer access-link email');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = 'Your support access link';
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Your account is verified</h2>
            <p>Hi <strong>${userName || 'User'}</strong>,</p>
            <p>Your email has been verified successfully.</p>
            <p>Use the link below to access your support area and sign in:</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${accessLink}" style="display:inline-block;background:#2563eb;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Open Support Access</a>
            </div>
            <p style="font-size:14px;color:#4b5563">Direct link: <a href="${accessLink}" style="word-break:break-all">${accessLink}</a></p>
            <p style="font-size:13px;color:#6b7280;margin-top:24px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${userName || 'User'},\n\nYour email has been verified successfully.\nUse this support access link to sign in:\n\n${accessLink}\n\nDo not reply to this email.`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: userEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending customer access-link email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email (time-limited token)
   */
  async sendStaffResetEmail(staffEmail, staffName, resetLink) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping password reset email');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = 'Reset Your ITSM Staff Password';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#3b82f6;margin-bottom:10px">🎫 ITSM Ticketing</div>
              <h1>Reset Your Password</h1>
            </div>
            <p>Hi <strong>${staffName || 'Staff Member'}</strong>,</p>
            <p>You requested a password reset. Click the link below to create a new password.</p>
            <p style="color:#6b7280;font-size:14px">This link expires in 1 hour.</p>
            <div style="text-align:center;margin:25px 0">
              <a href="${resetLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Reset Password</a>
            </div>
            <p style="font-size:14px;color:#6b7280">If you did not request this, you can ignore this email.</p>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${staffName || 'Staff Member'},\n\nYou requested a password reset. Use this link (expires in 1 hour):\n\n${resetLink}\n\nIf you did not request this, ignore this email.`;

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: staffEmail,
        subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${staffEmail}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Format SLA response time in minutes to human-readable string (e.g. 120 -> "2 hours")
   */
  _formatResponseTime(minutes) {
    if (!minutes || minutes <= 0) return null;
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
    return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minute${mins === 1 ? '' : 's'}`;
  }

  // Send ticket creation confirmation (includeLink: only for new users who haven't received personalized URL yet)
  // options.firstResponseExpectationMinutes: SLA first response time to include (e.g. 120 for "within 2 hours")
  async sendTicketConfirmation(customerEmail, customerName, ticketId, ticketTitle, appUrl, options = {}) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping ticket confirmation');
        return { success: false, error: 'Email not configured' };
      }

      const { includeLink = true, firstResponseExpectationMinutes, returnToSupportUrl = '' } = options;
      const url = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();

      const returnTo = returnToSupportUrl || `/grc?m=&u=${encodeURIComponent(customerName || '')}&e=${encodeURIComponent(customerEmail)}`;
      const ticketLink = `${url}/customer-access?e=${encodeURIComponent(customerEmail)}&returnTo=${encodeURIComponent(returnTo)}`;

      const firstResponseText = firstResponseExpectationMinutes
        ? this._formatResponseTime(firstResponseExpectationMinutes)
        : null;
      const slaNotice = firstResponseText
        ? `<p style="background:#ecfdf5;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #10b981"><strong>⏱️ Our support team will respond within ${firstResponseText}.</strong></p>`
        : '';

      const subject = `Support Ticket #${ticketId} Created`;
      const linkSection = includeLink
        ? `<div style="text-align:center">
              <a href="${ticketLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">📱 View Ticket</a>
            </div>`
        : '';
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#3b82f6;margin-bottom:10px">🎫 ITSM Support</div>
              <h1>Ticket Confirmed</h1>
            </div>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>Your support ticket has been created successfully.</p>
            ${slaNotice}
            <div style="background:#f8fafc;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #3b82f6">
              <p><strong>Ticket ID:</strong> #${ticketId}</p>
              <p><strong>Subject:</strong> ${ticketTitle || 'No subject'}</p>
            </div>
            ${linkSection}
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;
      const textSla = firstResponseText ? `\nOur support team will respond within ${firstResponseText}.\n` : '';
      const textLink = includeLink ? `\n\nView your ticket: ${ticketLink}\n` : '';
      const textContent = `Hi ${customerName || 'Customer'},\n\nYour support ticket #${ticketId} has been created.${textSla}\nSubject: ${ticketTitle || 'No subject'}${textLink}\nDo not reply to this email.`;

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Ticket confirmation sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending ticket confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  // Send email notification to customer when agent replies (includeLink: only for new users)
  async sendAgentReplyNotification(customerEmail, customerName, ticketId, ticketTitle, agentName, agentMessage, appUrl, options = {}) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const { includeLink = true, returnToSupportUrl = '' } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const returnTo = returnToSupportUrl || `/grc?m=&u=${encodeURIComponent(customerName || '')}&e=${encodeURIComponent(customerEmail)}`;
      const ticketLink = `${baseUrl}/customer-access?e=${encodeURIComponent(customerEmail)}&returnTo=${encodeURIComponent(returnTo)}`;
      const subject = `New Reply on Your Support Ticket #${ticketId}`;

      const linkSection = includeLink
        ? `<div style="text-align: center;">
              <a href="${ticketLink}" class="cta-button">
                📱 View & Reply in App
              </a>
            </div>
            <div class="warning">
              <p><strong>⚡ Quick Response Needed!</strong></p>
              <p>To ensure faster resolution, please respond via our app rather than replying to this email.</p>
            </div>`
        : '';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Reply from Support</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .email-container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              padding-bottom: 20px;
              border-bottom: 2px solid #e2e8f0;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #3b82f6;
              margin-bottom: 10px;
            }
            .ticket-info {
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #3b82f6;
            }
            .agent-reply {
              background: #ecfdf5;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #10b981;
            }
            .cta-button {
              display: inline-block;
              background: #3b82f6;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              color: #6b7280;
              font-size: 14px;
            }
            .warning {
              background: #fef3c7;
              padding: 15px;
              border-radius: 6px;
              margin: 20px 0;
              border-left: 4px solid #f59e0b;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">🎫 ITSM Support</div>
              <h1>You've Got a Reply!</h1>
            </div>

            <p>Hi <strong>${customerName}</strong>,</p>
            
            <p>Great news! Our support agent <strong>${agentName}</strong> has replied to your support ticket.</p>

            <div class="ticket-info">
              <h3>📋 Ticket Details</h3>
              <p><strong>Ticket ID:</strong> #${ticketId}</p>
              <p><strong>Subject:</strong> ${ticketTitle}</p>
              <p><strong>Agent:</strong> ${agentName}</p>
            </div>

            <div class="agent-reply">
              <h3>💬 Agent's Reply</h3>
              <p>${agentMessage.length > 200 ? agentMessage.substring(0, 200) + '...' : agentMessage}</p>
            </div>

            ${linkSection}

            <p>Thank you for using our support system. We're here to help!</p>

            <div class="footer">
              <p>🔒 This email was sent from an automated system. Please do not reply to this email.</p>
              <p>© 2024 ITSM Support Team. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const visitLine = includeLink
        ? `To view the full conversation and respond, please visit: ${ticketLink}\n\nPlease respond via our app for faster resolution.\n\n`
        : '';
      const textContent = `
Hi ${customerName},

You've received a new reply from our support agent ${agentName} on your ticket #${ticketId}.

Ticket: ${ticketTitle}
Agent: ${agentName}

Reply: ${agentMessage}

${visitLine}Thank you!
ITSM Support Team

Note: This is an automated email. Please do not reply to this email.
      `;

      const { fromName, fromAddress } = this._getSmtpConfig();

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${customerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };

    } catch (error) {
      console.error('❌ Error sending email notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Send welcome email to new customers
  async sendWelcomeEmail(customerEmail, customerName) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const subject = 'Welcome to ITSM Support!';
      
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to ITSM Support</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .email-container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              padding-bottom: 20px;
              border-bottom: 2px solid #e2e8f0;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #3b82f6;
              margin-bottom: 10px;
            }
            .feature-list {
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              color: #6b7280;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">🎫 ITSM Support</div>
              <h1>Welcome Aboard!</h1>
            </div>

            <p>Hi <strong>${customerName}</strong>,</p>
            
            <p>Welcome to our ITSM Support system! We're excited to help you with all your support needs.</p>

            <div class="feature-list">
              <h3>🚀 What you can do:</h3>
              <ul>
                <li>📝 Create support tickets easily</li>
                <li>💬 Chat with our support agents</li>
                <li>📊 Track your ticket status</li>
                <li>📧 Get email notifications for replies</li>
                <li>📱 Access from any device</li>
              </ul>
            </div>

            <p>If you have any questions or need assistance, don't hesitate to create a support ticket.</p>

            <p>Thank you for choosing our support system!</p>

            <div class="footer">
              <p>© 2024 ITSM Support Team. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const { fromName, fromAddress } = this._getSmtpConfig();
      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject: subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Welcome email sent to ${customerEmail}`);
      return { success: true, messageId: result.messageId };

    } catch (error) {
      console.error('❌ Error sending welcome email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send email notification to agent when assigned a new ticket
  async sendAgentAssignmentNotification(agentEmail, agentName, ticketId, customerName, ticketTitle, appUrl) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `New Ticket Assignment - Ticket #${ticketId}`;
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Ticket Assignment</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .email-container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              padding-bottom: 20px;
              border-bottom: 2px solid #e2e8f0;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #3b82f6;
              margin-bottom: 10px;
            }
            .ticket-info {
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #3b82f6;
            }
            .assignment-notice {
              background: #ecfdf5;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #10b981;
            }
            .cta-button {
              display: inline-block;
              background: #3b82f6;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              color: #6b7280;
              font-size: 14px;
            }
            .priority {
              background: #fef3c7;
              padding: 15px;
              border-radius: 6px;
              margin: 20px 0;
              border-left: 4px solid #f59e0b;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <div class="logo">🎫 ITSM Support</div>
              <h1>New Ticket Assignment</h1>
            </div>

            <p>Hi <strong>${agentName}</strong>,</p>
            
            <p>You have been assigned a new support ticket. Please review and respond as soon as possible.</p>

            <div class="assignment-notice">
              <h3>🎯 New Assignment</h3>
              <p><strong>You have a newly assigned ticket</strong></p>
            </div>

            <div class="ticket-info">
              <h3>📋 Ticket Details</h3>
              <p><strong>Ticket ID:</strong> #${ticketId}</p>
              <p><strong>Customer:</strong> ${customerName}</p>
              <p><strong>Subject:</strong> ${ticketTitle}</p>
              <p><strong>Assigned to:</strong> ${agentName}</p>
            </div>

            <div class="priority">
              <p><strong>⚡ Action Required!</strong></p>
              <p>Please log into your dashboard to view the full ticket details and respond to the customer.</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardLink}" class="cta-button">
                📱 View Ticket in Dashboard
              </a>
            </div>

            <p>Thank you for your prompt attention to this ticket.</p>

            <div class="footer">
              <p>🔒 This email was sent from an automated system. Please do not reply to this email.</p>
              <p>© 2024 ITSM Support Team. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
Hi ${agentName},

You have a newly assigned ticket.

Ticket Details:
- Ticket ID: #${ticketId}
- Customer: ${customerName}
- Subject: ${ticketTitle}
- Assigned to: ${agentName}

Please log into your dashboard to view the full ticket details and respond to the customer.

Dashboard: ${dashboardLink}

Thank you for your prompt attention to this ticket.

ITSM Support Team

Note: This is an automated email. Please do not reply to this email.
      `;

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Agent assignment email sent successfully to ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };

    } catch (error) {
      console.error('❌ Error sending agent assignment email:', error);
      return { success: false, error: error.message };
    }
  }

  // Notify previous agent when ticket is reassigned away from them
  async sendAgentReassignmentNoticeNotification(agentEmail, agentName, ticketId, newAgentName, ticketTitle, appUrl) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Ticket #${ticketId} reassigned`;
      const ticketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Ticket Reassignment Notice</h2>
            <p>Hi <strong>${agentName || 'Agent'}</strong>,</p>
            <p>Ticket <strong>#${ticketId}</strong> has been reassigned to <strong>${newAgentName || 'another agent'}</strong>.</p>
            <div style="background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid #3b82f6">
              <p style="margin:0"><strong>Subject:</strong> ${ticketTitle || 'Support Request'}</p>
            </div>
            <p style="margin-top:16px"><a href="${ticketLink}" style="color:#2563eb;text-decoration:none">View ticket details</a></p>
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${agentName || 'Agent'},\n\nTicket #${ticketId} has been reassigned to ${newAgentName || 'another agent'}.\nSubject: ${ticketTitle || 'Support Request'}\nView: ${ticketLink}\n`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Reassignment notice email sent to previous agent ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending agent reassignment notice email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify an agent that a manager has removed their slot from a group ticket.
   * Sent in addition to the in-app notification so the agent has a written record
   * of the removal, who removed them, and the reason.
   */
  async sendAgentGroupRemovalNotification(
    agentEmail,
    agentName,
    ticketId,
    ticketTitle,
    groupTitle,
    managerName,
    reason
  ) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }
      const baseUrl = this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Removed from Group Ticket #${ticketId}`;
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      const safeReason = String(reason || 'No reason provided').trim() || 'No reason provided';
      const safeGroup = groupTitle ? String(groupTitle).trim() : '';
      const safeTitle = ticketTitle ? String(ticketTitle).trim() : 'Support Request';
      const safeManager = managerName ? String(managerName).trim() : 'A manager';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:16px;border-bottom:2px solid #e2e8f0;margin-bottom:24px">
              <div style="font-size:22px;font-weight:bold;color:#b91c1c">Removed from Group Ticket Assignment</div>
            </div>
            <p>Hi <strong>${agentName || 'Agent'}</strong>,</p>
            <p>${safeManager} has removed you from a grouped ticket. You no longer need to work on this ticket.</p>
            <div style="background:#fef2f2;padding:16px;border-radius:8px;border-left:4px solid #dc2626;margin:16px 0">
              <p style="margin:0 0 6px"><strong>Ticket:</strong> #${ticketId} — ${safeTitle}</p>
              ${safeGroup ? `<p style="margin:0 0 6px"><strong>Group:</strong> ${safeGroup}</p>` : ''}
              <p style="margin:0 0 6px"><strong>Removed by:</strong> ${safeManager}</p>
              <p style="margin:0"><strong>Reason:</strong> ${safeReason}</p>
            </div>
            <p>Any work you had already completed on this ticket has been preserved as part of the ticket history. If you believe this was done in error, please contact your manager.</p>
            <p style="margin-top:16px"><a href="${dashboardLink}" style="color:#2563eb;text-decoration:none">Open your dashboard</a></p>
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;
      const textContent =
        `Hi ${agentName || 'Agent'},\n\n` +
        `${safeManager} has removed you from group ticket #${ticketId}` +
        `${safeGroup ? ` (${safeGroup})` : ''}.\n` +
        `Ticket: ${safeTitle}\n` +
        `Reason: ${safeReason}\n\n` +
        `Any work you had already completed has been preserved as part of the ticket history.\n` +
        `Dashboard: ${dashboardLink}\n`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Group-removal email sent to ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending group-removal email:', error);
      return { success: false, error: error.message };
    }
  }

  // Notify agent when tickets are combined under a parent ticket
  async sendAgentTicketsCombinedNotification(
    agentEmail,
    agentName,
    parentTicketId,
    childTicketIds = [],
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const {
        actorName = 'Manager',
        perspective = 'participant',
        affectedChildIds = []
      } = options;
      const safeAgentName = agentName || 'Agent';
      const safeParentId = Number(parentTicketId);
      const allChildIds = Array.isArray(childTicketIds)
        ? childTicketIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [];
      const myChildIds = Array.isArray(affectedChildIds)
        ? affectedChildIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [];

      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const ticketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${safeParentId}`, {
        email: agentEmail,
        name: safeAgentName,
        roleHint: 'staff'
      });
      const subject = `Tickets combined under parent #${safeParentId}`;
      const impactedList = myChildIds.length ? myChildIds.join(', ') : 'N/A';
      const allChildrenList = allChildIds.length ? allChildIds.join(', ') : 'N/A';
      const roleLine = perspective === 'parent_owner'
        ? 'You are the assigned owner of the parent ticket.'
        : 'One or more tickets assigned to you were combined under this parent ticket.';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Ticket Combine Update</h2>
            <p>Hi <strong>${safeAgentName}</strong>,</p>
            <p>${actorName || 'Manager'} combined similar tickets under parent ticket <strong>#${safeParentId}</strong>.</p>
            <p>${roleLine}</p>
            <div style="background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid #3b82f6">
              <p style="margin:0 0 8px 0"><strong>Parent Ticket:</strong> #${safeParentId}</p>
              <p style="margin:0 0 8px 0"><strong>Combined Child Tickets:</strong> ${allChildrenList}</p>
              <p style="margin:0"><strong>Your impacted child tickets:</strong> ${impactedList}</p>
            </div>
            <p style="margin-top:16px">Resolution details on the parent ticket are the source of truth and are read-only on child tickets.</p>
            <p style="margin-top:16px"><a href="${ticketLink}" style="color:#2563eb;text-decoration:none">Open parent ticket</a></p>
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email.</p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${safeAgentName},

${actorName || 'Manager'} combined similar tickets under parent ticket #${safeParentId}.
${roleLine}

Parent Ticket: #${safeParentId}
Combined Child Tickets: ${allChildrenList}
Your impacted child tickets: ${impactedList}

Resolution details on the parent ticket are the source of truth and are read-only on child tickets.

Open parent ticket: ${ticketLink}
`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Combined-ticket update email sent to ${agentEmail} for parent #${safeParentId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending combined-ticket update email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Assigned agent: ticket status is now escalated (manual or SLA auto).
   */
  async sendAgentTicketEscalatedNotification(agentEmail, agentName, ticketId, ticketTitle, appUrl, options = {}) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping agent escalation notification');
        return { success: false, error: 'Email not configured' };
      }

      const { customerName = 'Customer', escalatedBy = null, reason = null } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Your ticket has been escalated — Ticket #${ticketId}`;

      const esc = (v) =>
        String(v ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const title = ticketTitle || 'Support Request';
      const byLine = escalatedBy
        ? `<p style="margin:8px 0 0 0"><strong>Escalated by:</strong> ${esc(escalatedBy)}</p>`
        : '';
      const reasonLine = reason
        ? `<p style="margin:8px 0 0 0"><strong>Reason:</strong> ${esc(reason)}</p>`
        : '';
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#dc2626">Your ticket has been escalated</h2>
            <p>Hi <strong>${esc(agentName || 'Agent')}</strong>,</p>
            <p><strong>Your ticket has been escalated.</strong> Please review it in the dashboard — management may also be involved.</p>
            <div style="background:#fef2f2;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #dc2626">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${esc(title)}</p>
              <p style="margin:8px 0 0 0"><strong>Customer:</strong> ${esc(customerName)}</p>
              ${byLine}
              ${reasonLine}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Dashboard</a></p>
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email.</p>
          </div>
        </body>
        </html>
      `;

      const textExtra = [escalatedBy ? `Escalated by: ${escalatedBy}` : '', reason ? `Reason: ${reason}` : '']
        .filter(Boolean)
        .join('\n');

      const textContent = `Hi ${agentName || 'Agent'},

Your ticket has been escalated. Please review it in the dashboard.

Ticket ID: #${ticketId}
Subject: ${title}
Customer: ${customerName}
${textExtra ? `${textExtra}\n` : ''}
Open ticket: ${openTicketLink}
Dashboard: ${dashboardLink}

ITSM Support`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Agent escalation email sent to ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending agent escalation email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Grouped ticket was reopened (customer or manager): notify each agent with a task on this ticket.
   */
  async sendAgentGroupedTicketReopenedNotification(
    agentEmail,
    agentName,
    ticketId,
    ticketTitle,
    taskSummary,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping grouped ticket reopen agent notification');
        return { success: false, error: 'Email not configured' };
      }

      const { reopenedBy = null, previousStatus = 'closed' } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Grouped ticket reopened — please review Ticket #${ticketId}`;

      const esc = (v) =>
        String(v ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const title = ticketTitle || 'Support Request';
      const byLine = reopenedBy
        ? `<p style="margin:8px 0 0 0"><strong>Reopened by:</strong> ${esc(reopenedBy)}</p>`
        : '';
      const prevLabel = String(previousStatus || 'closed').replace(/_/g, ' ');
      const tasksLine = taskSummary
        ? `<p style="margin:8px 0 0 0"><strong>Your assignment(s):</strong> ${esc(taskSummary)}</p>`
        : '';
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Grouped ticket reopened</h2>
            <p>Hi <strong>${esc(agentName || 'Agent')}</strong>,</p>
            <p><strong>A grouped ticket you are assigned to has been reopened</strong> (it was previously <strong>${esc(prevLabel)}</strong>).
              The ticket is <strong>in progress</strong> again; your task status has been reset so you can continue the work.</p>
            <div style="background:#eff6ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2563eb">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${esc(title)}</p>
              ${tasksLine}
              ${byLine}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Dashboard</a></p>
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email.</p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${agentName || 'Agent'},

A grouped ticket you are assigned to has been reopened (previously ${prevLabel}). It is in progress again; your task was reset.

Ticket ID: #${ticketId}
Subject: ${title}
${taskSummary ? `Your assignment(s): ${taskSummary}\n` : ''}${reopenedBy ? `Reopened by: ${reopenedBy}\n` : ''}
Open ticket: ${openTicketLink}
Dashboard: ${dashboardLink}

ITSM Support`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Grouped ticket reopen email sent to ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending grouped ticket reopen agent email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Single-assignee ticket reopened by customer after "not solved" confirmation.
   */
  async sendAssignedAgentCustomerRejectionReopenNotification(
    agentEmail,
    agentName,
    ticketId,
    ticketTitle,
    customerName,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping customer rejection reopen agent notification');
        return { success: false, error: 'Email not configured' };
      }

      const { reopenedBy = 'Customer', reason = null } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Ticket reopened by customer — Ticket #${ticketId}`;

      const esc = (v) =>
        String(v ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const title = ticketTitle || 'Support Request';
      const byLine = reopenedBy ? `<p style="margin:8px 0 0 0"><strong>Reopened by:</strong> ${esc(reopenedBy)}</p>` : '';
      const reasonLine = reason
        ? `<p style="margin:8px 0 0 0"><strong>Customer says:</strong> ${esc(reason)}</p>`
        : '';

      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Ticket reopened by customer</h2>
            <p>Hi <strong>${esc(agentName || 'Agent')}</strong>,</p>
            <p><strong>The customer has rejected the resolution and reopened this ticket.</strong> It is now <strong>in progress</strong>.</p>
            <div style="background:#eff6ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2563eb">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${esc(title)}</p>
              <p style="margin:8px 0 0 0"><strong>Customer:</strong> ${esc(customerName || 'Customer')}</p>
              ${byLine}
              ${reasonLine}
            </div>
            <p style="margin-top:16px">
              <a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Dashboard</a>
            </p>
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email.</p>
          </div>
        </body>
        </html>
      `;

      const textExtra = [reopenedBy ? `Reopened by: ${reopenedBy}` : '', reason ? `Customer says: ${reason}` : '']
        .filter(Boolean)
        .join('\n');

      const textContent = `Hi ${agentName || 'Agent'},

The customer rejected the resolution and reopened this ticket. It is now in progress.

Ticket ID: #${ticketId}
Subject: ${title}
Customer: ${customerName || 'Customer'}
${textExtra ? `${textExtra}\n` : ''}
Open ticket: ${openTicketLink}
Dashboard: ${dashboardLink}

ITSM Support`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Agent customer-rejection reopen email sent to ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending agent customer-rejection reopen email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify manager: grouped ticket tasks are all complete and waiting for manager resolution.
   */
  async sendManagerGroupedTicketReadyForResolutionNotification(
    managerEmail,
    managerName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping manager grouped-complete notification');
        return { success: false, error: 'Email not configured' };
      }
      const { completedBy = null } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Manager action required: Ticket #${ticketId} is ready to resolve`;
      const title = ticketTitle || 'Support Request';
      const byLine = completedBy ? `\nCompleted update by: ${completedBy}` : '';
      const actorLineHtml = completedBy
        ? `<p style="margin:8px 0 0 0"><strong>Completed update by:</strong> ${completedBy}</p>`
        : '';
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/manager', {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#0f766e">Grouped tasks completed</h2>
            <p>Hi <strong>${managerName || 'Manager'}</strong>,</p>
            <p>All assigned agents have completed their tasks for this grouped ticket.</p>
            <p><strong>Please mark this ticket as resolved from your end.</strong></p>
            <div style="background:#ecfeff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #0f766e">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${ticketTitle || 'Support Request'}</p>
              ${actorLineHtml}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Manager dashboard</a></p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${managerName || 'Manager'},

All assigned agents have completed their grouped tasks for this ticket.
Please mark it as resolved from your end.

Ticket ID: #${ticketId}
Subject: ${title}${byLine}

Open ticket: ${openTicketLink}
Manager dashboard: ${dashboardLink}

ITSM Support`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: managerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Manager grouped-complete email sent to ${managerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending manager grouped-complete email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify manager: ticket under their team got escalated.
   */
  async sendManagerTicketEscalatedNotification(
    managerEmail,
    managerName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping manager escalation notification');
        return { success: false, error: 'Email not configured' };
      }
      const { escalatedBy = null, reason = null } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Escalation alert: Ticket #${ticketId}`;
      const title = ticketTitle || 'Support Request';
      const actorLine = escalatedBy ? `Escalated by: ${escalatedBy}\n` : '';
      const reasonLine = reason ? `Reason: ${reason}\n` : '';
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/manager', {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#dc2626">Ticket escalated</h2>
            <p>Hi <strong>${managerName || 'Manager'}</strong>,</p>
            <p>A ticket under your team has been escalated and may require your intervention.</p>
            <div style="background:#fef2f2;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #dc2626">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${title}</p>
              ${escalatedBy ? `<p style="margin:8px 0 0 0"><strong>Escalated by:</strong> ${escalatedBy}</p>` : ''}
              ${reason ? `<p style="margin:8px 0 0 0"><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Manager dashboard</a></p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${managerName || 'Manager'},

A ticket under your team has been escalated and may require your intervention.

Ticket ID: #${ticketId}
Subject: ${title}
${actorLine}${reasonLine}
Open ticket: ${openTicketLink}
Manager dashboard: ${dashboardLink}

ITSM Support`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: managerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Manager escalation email sent to ${managerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending manager escalation email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify manager: customer reopened a ticket under their team.
   */
  async sendManagerTicketReopenedNotification(
    managerEmail,
    managerName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping manager reopen notification');
        return { success: false, error: 'Email not configured' };
      }
      const { reopenedBy = null } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Ticket reopened by customer: #${ticketId}`;
      const title = ticketTitle || 'Support Request';
      const byLine = reopenedBy ? `\nReopened by: ${reopenedBy}` : '';
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/manager', {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Customer reopened ticket</h2>
            <p>Hi <strong>${managerName || 'Manager'}</strong>,</p>
            <p>A customer reopened a ticket under your team. The ticket is now in progress again.</p>
            <div style="background:#eff6ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2563eb">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${title}</p>
              ${reopenedBy ? `<p style="margin:8px 0 0 0"><strong>Reopened by:</strong> ${reopenedBy}</p>` : ''}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Manager dashboard</a></p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${managerName || 'Manager'},

A customer reopened a ticket under your team. The ticket is now in progress again.

Ticket ID: #${ticketId}
Subject: ${title}${byLine}

Open ticket: ${openTicketLink}
Manager dashboard: ${dashboardLink}

ITSM Support`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: managerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Manager reopen email sent to ${managerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending manager reopen email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendCustomerEtaUpdatedNotification(
    customerEmail,
    customerName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping customer ETA notification');
        return { success: false, error: 'Email not configured' };
      }
      const {
        oldEta = null,
        newEta = null,
        reason = '',
        updatedBy = null,
        includeLink = true
      } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const esc = (value) =>
        String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      const title = ticketTitle || 'Support Request';
      const fmtEta = (value) => {
        const d = value ? new Date(value) : null;
        return d && Number.isFinite(d.getTime())
          ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
          : 'Not set';
      };
      const oldEtaText = fmtEta(oldEta);
      const newEtaText = fmtEta(newEta);
      const safeReason = String(reason || '').trim();
      const safeEmail = encodeURIComponent(customerEmail || '');
      const safeName = encodeURIComponent(customerName || '');
      const ticketPath = `/chat/${ticketId}?m=&u=${safeName}&e=${safeEmail}`;
      const ticketLink = this.buildAuthEntryUrl(baseUrl, ticketPath, {
        email: customerEmail,
        name: customerName,
        roleHint: 'customer'
      });
      const subject = `ETA updated for Ticket #${ticketId}`;
      const linkSection = includeLink
        ? `<p style="margin-top:16px"><a href="${ticketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">View ticket</a></p>`
        : '';
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#2563eb">Expected resolution time updated</h2>
            <p>Hi <strong>${esc(customerName || 'Customer')}</strong>,</p>
            <p>We have updated the expected resolution time for your ticket.</p>
            <div style="background:#eff6ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2563eb">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${esc(title)}</p>
              <p style="margin:8px 0 0 0"><strong>Previous ETA:</strong> ${esc(oldEtaText)}</p>
              <p style="margin:8px 0 0 0"><strong>Updated ETA:</strong> ${esc(newEtaText)}</p>
              ${updatedBy ? `<p style="margin:8px 0 0 0"><strong>Updated by:</strong> ${esc(updatedBy)}</p>` : ''}
              ${safeReason ? `<p style="margin:8px 0 0 0"><strong>Reason:</strong> ${esc(safeReason)}</p>` : ''}
            </div>
            ${linkSection}
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${customerName || 'Customer'},

The expected resolution time for your ticket has been updated.

Ticket ID: #${ticketId}
Subject: ${title}
Previous ETA: ${oldEtaText}
Updated ETA: ${newEtaText}
${updatedBy ? `Updated by: ${updatedBy}\n` : ''}${safeReason ? `Reason: ${safeReason}\n` : ''}
${includeLink ? `View ticket: ${ticketLink}\n` : ''}
ITSM Support`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Customer ETA update email sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending customer ETA update email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendManagerTicketEtaUpdatedNotification(
    managerEmail,
    managerName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping manager ETA notification');
        return { success: false, error: 'Email not configured' };
      }
      const { oldEta = null, newEta = null, reason = '', updatedBy = null } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const title = ticketTitle || 'Support Request';
      const fmtEta = (value) => {
        const d = value ? new Date(value) : null;
        return d && Number.isFinite(d.getTime())
          ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
          : 'Not set';
      };
      const oldEtaText = fmtEta(oldEta);
      const newEtaText = fmtEta(newEta);
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/manager', {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const subject = `ETA update alert: Ticket #${ticketId}`;
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#0f766e">Ticket ETA changed</h2>
            <p>Hi <strong>${managerName || 'Manager'}</strong>,</p>
            <p>The expected resolution time for a team ticket was updated.</p>
            <div style="background:#ecfeff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #0f766e">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${title}</p>
              <p style="margin:8px 0 0 0"><strong>Previous ETA:</strong> ${oldEtaText}</p>
              <p style="margin:8px 0 0 0"><strong>Updated ETA:</strong> ${newEtaText}</p>
              ${updatedBy ? `<p style="margin:8px 0 0 0"><strong>Updated by:</strong> ${updatedBy}</p>` : ''}
              ${reason ? `<p style="margin:8px 0 0 0"><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Manager dashboard</a></p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${managerName || 'Manager'},

The expected resolution time for a team ticket was updated.

Ticket ID: #${ticketId}
Subject: ${title}
Previous ETA: ${oldEtaText}
Updated ETA: ${newEtaText}
${updatedBy ? `Updated by: ${updatedBy}\n` : ''}${reason ? `Reason: ${reason}\n` : ''}
Open ticket: ${openTicketLink}
Manager dashboard: ${dashboardLink}

ITSM Support`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: managerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Manager ETA update email sent to ${managerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending manager ETA update email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Grouped ticket: agent updated their task ETA — managers only (no customer email).
   */
  async sendManagerGroupedTaskEtaNotification(
    managerEmail,
    managerName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping grouped task ETA notification');
        return { success: false, error: 'Email not configured' };
      }
      const {
        taskLabel = 'Task',
        agentName = 'Agent',
        oldTaskEta = null,
        newTaskEta = null,
        reason = ''
      } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const title = ticketTitle || 'Support Request';
      const fmtEta = (value) => {
        const d = value ? new Date(value) : null;
        return d && Number.isFinite(d.getTime())
          ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
          : 'Not set';
      };
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/manager', {
        email: managerEmail,
        name: managerName,
        roleHint: 'staff'
      });
      const subject = `Task ETA updated (grouped ticket #${ticketId})`;
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#0f766e">Grouped task ETA changed</h2>
            <p>Hi <strong>${managerName || 'Manager'}</strong>,</p>
            <p>An agent updated the ETA for their assignment on a grouped ticket.</p>
            <div style="background:#ecfeff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #0f766e">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${title}</p>
              <p style="margin:8px 0 0 0"><strong>Task:</strong> ${taskLabel}</p>
              <p style="margin:8px 0 0 0"><strong>Agent:</strong> ${agentName}</p>
              <p style="margin:8px 0 0 0"><strong>Previous task ETA:</strong> ${fmtEta(oldTaskEta)}</p>
              <p style="margin:8px 0 0 0"><strong>New task ETA:</strong> ${fmtEta(newTaskEta)}</p>
              ${reason ? `<p style="margin:8px 0 0 0"><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Manager dashboard</a></p>
            <p style="margin-top:12px;color:#64748b;font-size:14px">Customer-facing overall ETA is updated separately when the latest open task ETA changes the ticket commitment.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${managerName || 'Manager'},

An agent updated their task ETA on grouped ticket #${ticketId}.

Subject: ${title}
Task: ${taskLabel}
Agent: ${agentName}
Previous task ETA: ${fmtEta(oldTaskEta)}
New task ETA: ${fmtEta(newTaskEta)}
${reason ? `Reason: ${reason}\n` : ''}
Open ticket: ${openTicketLink}
Manager dashboard: ${dashboardLink}

ITSM Support`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: managerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Manager grouped-task ETA email sent to ${managerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending manager grouped-task ETA email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Grouped ticket: assigned agent updated their task ETA — confirmation to that agent.
   */
  async sendAgentGroupedTaskEtaConfirmation(
    agentEmail,
    agentName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping agent grouped-task ETA confirmation');
        return { success: false, error: 'Email not configured' };
      }
      const {
        taskLabel = 'Task',
        oldTaskEta = null,
        newTaskEta = null,
        reason = ''
      } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const title = ticketTitle || 'Support Request';
      const fmtEta = (value) => {
        const d = value ? new Date(value) : null;
        return d && Number.isFinite(d.getTime())
          ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
          : 'Not set';
      };
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/agent/ticket/${ticketId}`, {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });
      const subject = `Your task ETA was saved (ticket #${ticketId})`;
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#1e40af">Task ETA update recorded</h2>
            <p>Hi <strong>${agentName || 'there'}</strong>,</p>
            <p>This confirms your assignment ETA was saved on a grouped ticket.</p>
            <div style="background:#eff6ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2563eb">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${title}</p>
              <p style="margin:8px 0 0 0"><strong>Your task:</strong> ${taskLabel}</p>
              <p style="margin:8px 0 0 0"><strong>Previous task ETA:</strong> ${fmtEta(oldTaskEta)}</p>
              <p style="margin:8px 0 0 0"><strong>New task ETA:</strong> ${fmtEta(newTaskEta)}</p>
              ${reason ? `<p style="margin:8px 0 0 0"><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Agent dashboard</a></p>
            <p style="margin-top:12px;color:#64748b;font-size:14px">Managers were also notified. The customer-facing ticket ETA may update if this changes the latest open assignment deadline.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${agentName || 'there'},

Your task ETA was saved on grouped ticket #${ticketId}.

Subject: ${title}
Task: ${taskLabel}
Previous task ETA: ${fmtEta(oldTaskEta)}
New task ETA: ${fmtEta(newTaskEta)}
${reason ? `Reason: ${reason}\n` : ''}
Open ticket: ${openTicketLink}
Agent dashboard: ${dashboardLink}

ITSM Support`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ Agent grouped-task ETA confirmation sent to ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending agent grouped-task ETA confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify CEO for critical ticket escalation (urgent/high).
   */
  async sendCeoCriticalTicketEscalatedNotification(
    ceoEmail,
    ceoName,
    ticketId,
    ticketTitle,
    appUrl,
    options = {}
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping CEO critical escalation notification');
        return { success: false, error: 'Email not configured' };
      }
      const { priority = null, reason = null, escalatedBy = null } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `CRITICAL escalation: Ticket #${ticketId}${priority ? ` (${String(priority).toUpperCase()})` : ''}`;
      const title = ticketTitle || 'Support Request';
      const openTicketLink = this.buildAuthEntryUrl(baseUrl, `/ticket/${ticketId}`, {
        email: ceoEmail,
        name: ceoName,
        roleHint: 'staff'
      });
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/ceo', {
        email: ceoEmail,
        name: ceoName,
        roleHint: 'staff'
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#b91c1c">Critical ticket escalated</h2>
            <p>Hi <strong>${ceoName || 'CEO'}</strong>,</p>
            <p>An urgent/high-priority ticket has been escalated and needs executive visibility.</p>
            <div style="background:#fef2f2;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #dc2626">
              <p style="margin:0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:8px 0 0 0"><strong>Subject:</strong> ${ticketTitle || 'Support Request'}</p>
              ${priority ? `<p style="margin:8px 0 0 0"><strong>Priority:</strong> ${String(priority).toUpperCase()}</p>` : ''}
              ${escalatedBy ? `<p style="margin:8px 0 0 0"><strong>Escalated by:</strong> ${escalatedBy}</p>` : ''}
              ${reason ? `<p style="margin:8px 0 0 0"><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            <p style="margin-top:16px"><a href="${openTicketLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open ticket</a>
              &nbsp;·&nbsp;
              <a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">CEO dashboard</a></p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${ceoName || 'CEO'},

An urgent/high-priority ticket has been escalated and needs executive visibility.

Ticket ID: #${ticketId}
Subject: ${title}
${priority ? `Priority: ${String(priority).toUpperCase()}\n` : ''}${escalatedBy ? `Escalated by: ${escalatedBy}\n` : ''}${reason ? `Reason: ${reason}\n` : ''}
Open ticket: ${openTicketLink}
CEO dashboard: ${dashboardLink}

ITSM Support`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: ceoEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ CEO critical escalation email sent to ${ceoEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending CEO critical escalation email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Weekly summary email for CEO (overall ticket metrics).
   */
  async sendCeoWeeklyTicketSummaryNotification(
    ceoEmail,
    ceoName,
    summary,
    appUrl
  ) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping CEO weekly summary');
        return { success: false, error: 'Email not configured' };
      }
      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const {
        tenantName = 'Tenant',
        weekLabel = 'This Week',
        totals = {},
        weekly = {}
      } = summary || {};
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/ceo', {
        email: ceoEmail,
        name: ceoName,
        roleHint: 'staff'
      });
      const subject = `Weekly ticket summary - ${tenantName}`;

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:680px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:28px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="margin-top:0;color:#1d4ed8">Weekly ticket summary</h2>
            <p>Hi <strong>${ceoName || 'CEO'}</strong>,</p>
            <p>Here is your weekly operational summary for <strong>${tenantName}</strong> (${weekLabel}).</p>
            <div style="background:#eff6ff;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #2563eb">
              <p style="margin:0"><strong>Current totals</strong></p>
              <p style="margin:8px 0 0 0">Total: ${Number(totals.total || 0)} | New: ${Number(totals.new_count || 0)} | In progress: ${Number(totals.in_progress_count || 0)} | Escalated: ${Number(totals.escalated_count || 0)} | Closed: ${Number(totals.closed_count || 0)} | Resolved: ${Number(totals.resolved_count || 0)}</p>
            </div>
            <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #64748b">
              <p style="margin:0"><strong>Last 7 days</strong></p>
              <p style="margin:8px 0 0 0">Created: ${Number(weekly.created_last_7d || 0)} | Closed updates: ${Number(weekly.closed_updated_last_7d || 0)} | Escalated updates: ${Number(weekly.escalated_updated_last_7d || 0)} | High/Urgent active: ${Number(weekly.critical_open_now || 0)}</p>
            </div>
            <p style="margin-top:16px"><a href="${dashboardLink}" style="color:#2563eb;text-decoration:none;font-weight:bold">Open CEO dashboard</a></p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${ceoName || 'CEO'},

Weekly ticket summary for ${tenantName} (${weekLabel})

Current totals:
- Total: ${Number(totals.total || 0)}
- New: ${Number(totals.new_count || 0)}
- In progress: ${Number(totals.in_progress_count || 0)}
- Escalated: ${Number(totals.escalated_count || 0)}
- Closed: ${Number(totals.closed_count || 0)}
- Resolved: ${Number(totals.resolved_count || 0)}

Last 7 days:
- Created: ${Number(weekly.created_last_7d || 0)}
- Closed updates: ${Number(weekly.closed_updated_last_7d || 0)}
- Escalated updates: ${Number(weekly.escalated_updated_last_7d || 0)}
- High/Urgent active: ${Number(weekly.critical_open_now || 0)}

Open CEO dashboard: ${dashboardLink}

ITSM Support`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: ceoEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ CEO weekly summary sent to ${ceoEmail}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending CEO weekly summary email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send priority change notification to assigned agent
  async sendAgentPriorityChangeNotification(agentEmail, agentName, ticketId, ticketTitle, oldPriority, newPriority, appUrl) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping priority change notification');
        return { success: false, error: 'Email not configured' };
      }

      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Priority Changed: Ticket #${ticketId} - ${newPriority}`;
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });

      const formatP = (p) => (p || 'medium').charAt(0).toUpperCase() + (p || 'medium').slice(1);

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#3b82f6;margin-bottom:10px">🎫 ITSM Support</div>
              <h1>Ticket Priority Changed</h1>
            </div>
            <p>Hi <strong>${agentName || 'Agent'}</strong>,</p>
            <p>The priority of ticket <strong>#${ticketId}</strong> (${ticketTitle || 'Support Request'}) assigned to you has been updated.</p>
            <div style="background:#fef3c7;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #f59e0b">
              <p style="margin:0"><strong>Previous:</strong> ${formatP(oldPriority)}</p>
              <p style="margin:8px 0 0 0"><strong>New:</strong> ${formatP(newPriority)}</p>
            </div>
            <p>SLA deadlines may have been recalculated based on the new priority. Please review the ticket and adjust your response accordingly.</p>
            <div style="text-align:center;margin:25px 0">
              <a href="${dashboardLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">View Ticket</a>
            </div>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated notification. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Priority change notification sent to ${agentEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending priority change email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send SLA reminder to assigned agent when deadline is approaching
  async sendAgentSLAReminderNotification(agentEmail, agentName, ticketId, ticketTitle, minutesRemaining, isUrgent = false, appUrl) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping SLA reminder');
        return { success: false, error: 'Email not configured' };
      }

      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = isUrgent
        ? `⚠️ URGENT: Ticket #${ticketId} requires immediate response (SLA in ${minutesRemaining} min)`
        : `⏰ SLA Reminder: Ticket #${ticketId} - Response needed within ${minutesRemaining} minutes`;
      const dashboardLink = this.buildAuthEntryUrl(baseUrl, '/agentdashboard', {
        email: agentEmail,
        name: agentName,
        roleHint: 'staff'
      });

      const urgencyHtml = isUrgent
        ? '<div style="background:#fef2f2;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #ef4444"><strong>🚨 This ticket requires immediate response to meet SLA.</strong></div>'
        : '<div style="background:#fffbeb;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #f59e0b"><strong>⚠️ The SLA deadline is approaching. Please respond as soon as possible.</strong></div>';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#3b82f6;margin-bottom:10px">🎫 ITSM Support</div>
              <h1>${isUrgent ? 'SLA Urgent Reminder' : 'SLA Reminder'}</h1>
            </div>
            <p>Hi <strong>${agentName || 'Agent'}</strong>,</p>
            <p>Ticket <strong>#${ticketId}</strong> (${ticketTitle || 'Support Request'}) is assigned to you and has not received a first response yet.</p>
            ${urgencyHtml}
            <p><strong>Time remaining before SLA breach:</strong> ${minutesRemaining} minutes</p>
            <div style="text-align:center;margin:25px 0">
              <a href="${dashboardLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">View Ticket in Dashboard</a>
            </div>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated reminder. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to: agentEmail,
        subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ SLA reminder email sent to ${agentEmail} for ticket #${ticketId} (${minutesRemaining} min remaining)`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending SLA reminder email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send customer inactivity reminder (agent responded, customer hasn't)
  async sendInactivityReminder(customerEmail, customerName, ticketId, ticketTitle, reminderLevel, appUrl) {
    try {
      if (!this.transporter) return { success: false, error: 'Email not configured' };

      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();
      const ticketPath = `/chat/${ticketId}?m=&u=${encodeURIComponent(customerName || '')}&e=${encodeURIComponent(customerEmail)}`;
      const ticketLink = this.buildAuthEntryUrl(baseUrl, ticketPath, {
        email: customerEmail,
        name: customerName,
        roleHint: 'customer'
      });

      const messages = {
        1: { subject: `Reminder: Please respond to your support ticket #${ticketId}`, notice: 'Our support team has responded to your ticket and is waiting for your reply.' },
        2: { subject: `Important: Ticket #${ticketId} may be closed soon`, notice: 'We have not received a response. Your ticket may be automatically closed if we do not hear back from you.' },
        3: { subject: `Final reminder: Ticket #${ticketId}`, notice: 'This is our final reminder. If we do not receive a response soon, your ticket will be automatically closed.' }
      };
      const m = messages[reminderLevel] || messages[1];

      const htmlContent = `
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="color:#3b82f6">Ticket Reminder</h2>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>${m.notice}</p>
            <p><strong>Ticket ID:</strong> #${ticketId}</p>
            <p><strong>Subject:</strong> ${ticketTitle || 'Support Request'}</p>
            <div style="text-align:center;margin:25px 0">
              <a href="${ticketLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Reply to Ticket</a>
            </div>
            <p style="color:#6b7280;font-size:14px">This is an automated reminder.</p>
          </div>
        </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject: m.subject,
        html: htmlContent
      });
      console.log(`✅ Inactivity reminder (level ${reminderLevel}) sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error sending inactivity reminder:', error);
      return { success: false, error: error.message };
    }
  }

  // Send closure notification when ticket closed due to customer inactivity
  async sendInactivityClosureNotification(customerEmail, customerName, ticketId, appUrl) {
    try {
      if (!this.transporter) return { success: false, error: 'Email not configured' };

      const baseUrl = appUrl || this.getAppUrl();
      const { fromName, fromAddress } = this._getSmtpConfig();

      const htmlContent = `
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <h2 style="color:#6b7280">Ticket Closed Due to Inactivity</h2>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>Your support ticket <strong>#${ticketId}</strong> has been automatically closed because we did not receive a response from you after multiple reminders.</p>
            <p>If your issue persists, please create a new ticket and we will be happy to assist you.</p>
            <div style="text-align:center;margin:25px 0">
              <a href="${baseUrl}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Create New Ticket</a>
            </div>
            <p style="color:#6b7280;font-size:14px">This is an automated message.</p>
          </div>
        </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject: `Ticket #${ticketId} closed - Create a new ticket if needed`,
        html: htmlContent
      });
      console.log(`✅ Inactivity closure notification sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error sending inactivity closure notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Notify customer when ticket is resolved so they can review and close
  async sendTicketResolvedNotification(customerEmail, customerName, ticketId, ticketTitle, resolverName, appUrl, options = {}) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping resolved notification');
        return { success: false, error: 'Email not configured' };
      }

      const { includeLink = true, resolutionSummary = '' } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const ticketPath = `/chat/${ticketId}?m=&u=${encodeURIComponent(customerName || '')}&e=${encodeURIComponent(customerEmail)}`;
      const ticketLink = this.buildAuthEntryUrl(baseUrl, ticketPath, {
        email: customerEmail,
        name: customerName,
        roleHint: 'customer'
      });
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Ticket #${ticketId} Resolved - Please Confirm Closure`;

      const resolverLine = resolverName
        ? `<p><strong>Resolved by:</strong> ${resolverName}</p>`
        : '';
      const resolutionSummaryLine = String(resolutionSummary || '').trim()
        ? `<p><strong>Resolution summary:</strong> ${String(resolutionSummary || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')}</p>`
        : '';
      const linkSection = includeLink
        ? `<div style="text-align:center;margin:25px 0">
             <a href="${ticketLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">Review & Close Ticket</a>
           </div>`
        : '';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#10b981;margin-bottom:10px">✅ ITSM Support</div>
              <h1>Your Ticket Is Resolved</h1>
            </div>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>Your support ticket has been marked as resolved by our support team.</p>
            <div style="background:#ecfdf5;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #10b981">
              <p><strong>Ticket ID:</strong> #${ticketId}</p>
              <p><strong>Subject:</strong> ${ticketTitle || 'Support Request'}</p>
              ${resolverLine}
              ${resolutionSummaryLine}
            </div>
            <p>Please review the resolution. If your issue is fixed, close the ticket from your side.</p>
            ${linkSection}
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const textLink = includeLink ? `\nReview and close your ticket here: ${ticketLink}\n` : '';
      const textContent = `Hi ${customerName || 'Customer'},\n\nYour support ticket #${ticketId} has been marked as resolved.\nSubject: ${ticketTitle || 'Support Request'}\n${resolverName ? `Resolved by: ${resolverName}\n` : ''}${String(resolutionSummary || '').trim() ? `Resolution summary: ${String(resolutionSummary || '').trim()}\n` : ''}\nPlease review the resolution and close the ticket if the issue is fixed.${textLink}\nITSM Support Team`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      console.log(`✅ Ticket resolved email sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending ticket resolved email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Customer reopened a closed ticket: ticket summary + clear "reopened / in progress" wording (not "new").
   * @param {object} ticketPayload - id, issue_title, description?, product?, module?, issue_type?, priority?
   */
  async sendTicketReopenedNotification(customerEmail, customerName, ticketPayload, reopenedByName, appUrl, options = {}) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping reopen notification');
        return { success: false, error: 'Email not configured' };
      }

      const { includeLink = true } = options;
      const ticketId = ticketPayload.id;
      const baseUrl = appUrl || this.getAppUrl();
      const safeEmail = encodeURIComponent(customerEmail || '');
      const safeName = encodeURIComponent(customerName || '');
      const ticketPath = `/chat/${ticketId}?m=&u=${safeName}&e=${safeEmail}`;
      const ticketLink = this.buildAuthEntryUrl(baseUrl, ticketPath, {
        email: customerEmail,
        name: customerName,
        roleHint: 'customer'
      });
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Ticket #${ticketId} reopened — now in progress`;

      const esc = (v) =>
        String(v ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const title = ticketPayload.issue_title || ticketPayload.description?.substring(0, 120) || 'Support Request';
      const descRaw = String(ticketPayload.description || '').trim();
      const descShort = descRaw.length > 800 ? `${descRaw.slice(0, 800)}…` : descRaw;
      const descHtml = descShort ? `<p style="margin:12px 0 0 0;white-space:pre-wrap">${esc(descShort)}</p>` : '';

      const optionalRow = (label, val) => {
        const s = String(val || '').trim();
        if (!s) return '';
        return `<p style="margin:6px 0"><strong>${esc(label)}:</strong> ${esc(s)}</p>`;
      };

      const reopenedLine = reopenedByName
        ? `<p><strong>Reopened by:</strong> ${esc(reopenedByName)}</p>`
        : '';

      const linkSection = includeLink
        ? `<div style="text-align:center;margin:25px 0">
             <a href="${ticketLink}" style="display:inline-block;background:#2563eb;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">View ticket</a>
           </div>`
        : '';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:24px">
              <div style="font-size:22px;font-weight:bold;color:#2563eb;margin-bottom:8px">ITSM Support</div>
              <h1 style="margin:0;font-size:22px">Your ticket has been reopened</h1>
            </div>
            <p>Hi <strong>${esc(customerName || 'Customer')}</strong>,</p>
            <p><strong>Your ticket has been reopened.</strong> It is now <strong>in progress</strong> and our team will continue working on it.</p>
            <div style="background:#eff6ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2563eb">
              <p style="margin:0 0 8px 0"><strong>Ticket details</strong></p>
              <p style="margin:6px 0"><strong>Ticket ID:</strong> #${ticketId}</p>
              <p style="margin:6px 0"><strong>Subject:</strong> ${esc(title)}</p>
              <p style="margin:6px 0"><strong>Current status:</strong> In progress</p>
              ${optionalRow('Product', ticketPayload.product)}
              ${optionalRow('Module', ticketPayload.module)}
              ${optionalRow('Issue type', ticketPayload.issue_type)}
              ${optionalRow('Priority', ticketPayload.priority)}
              ${descHtml}
              ${reopenedLine}
            </div>
            ${linkSection}
            <p style="margin-top:24px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const textExtra = [
        ticketPayload.product ? `Product: ${ticketPayload.product}` : '',
        ticketPayload.module ? `Module: ${ticketPayload.module}` : '',
        ticketPayload.issue_type ? `Issue type: ${ticketPayload.issue_type}` : '',
        ticketPayload.priority ? `Priority: ${ticketPayload.priority}` : '',
        descShort ? `Description:\n${descShort}` : ''
      ]
        .filter(Boolean)
        .join('\n');

      const textContent = `Hi ${customerName || 'Customer'},

Your ticket has been reopened. It is now in progress and our team will continue working on it.

Ticket details
--------------
Ticket ID: #${ticketId}
Subject: ${title}
Current status: In progress
${textExtra ? `${textExtra}\n` : ''}${reopenedByName ? `Reopened by: ${reopenedByName}\n` : ''}
${includeLink ? `View ticket: ${ticketLink}\n` : ''}
ITSM Support`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      console.log(`✅ Ticket reopen email sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending ticket reopen email:', error);
      return { success: false, error: error.message };
    }
  }

  // Notify customer on non-final status updates (e.g. in_progress/escalated).
  async sendTicketStatusUpdateNotification(customerEmail, customerName, ticketId, ticketTitle, previousStatus, newStatus, actorName, appUrl, options = {}) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping status update notification');
        return { success: false, error: 'Email not configured' };
      }

      const { includeLink = true } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const safeEmail = encodeURIComponent(customerEmail || '');
      const safeName = encodeURIComponent(customerName || '');
      const ticketPath = `/chat/${ticketId}?m=&u=${safeName}&e=${safeEmail}`;
      const ticketLink = this.buildAuthEntryUrl(baseUrl, ticketPath, {
        email: customerEmail,
        name: customerName,
        roleHint: 'customer'
      });
      const { fromName, fromAddress } = this._getSmtpConfig();
      const statusTitle = String(newStatus || '').replace(/_/g, ' ');
      const fromTitle = String(previousStatus || '').replace(/_/g, ' ');
      const subject = `Ticket #${ticketId} Status Updated: ${statusTitle}`;

      const linkSection = includeLink
        ? `<div style="text-align:center;margin:25px 0">
             <a href="${ticketLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold">View Ticket</a>
           </div>`
        : '';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#2563eb;margin-bottom:10px">📣 ITSM Support</div>
              <h1>Your Ticket Status Was Updated</h1>
            </div>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>Your support ticket status has changed.</p>
            <div style="background:#eff6ff;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2563eb">
              <p><strong>Ticket ID:</strong> #${ticketId}</p>
              <p><strong>Subject:</strong> ${ticketTitle || 'Support Request'}</p>
              <p><strong>Status:</strong> ${fromTitle} → ${statusTitle}</p>
              ${actorName ? `<p><strong>Updated by:</strong> ${actorName}</p>` : ''}
            </div>
            ${linkSection}
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${customerName || 'Customer'},

Your support ticket status has changed.
Ticket ID: #${ticketId}
Subject: ${ticketTitle || 'Support Request'}
Status: ${fromTitle} -> ${statusTitle}
${actorName ? `Updated by: ${actorName}\n` : ''}
${includeLink ? `View your ticket: ${ticketLink}\n` : ''}
ITSM Support Team`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      console.log(`✅ Ticket status update email sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending ticket status update email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send closure confirmation email with embedded feedback request section/link.
  async sendTicketClosedNotification(customerEmail, customerName, ticketId, ticketTitle, feedbackUrl, appUrl, options = {}) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping closed notification');
        return { success: false, error: 'Email not configured' };
      }

      const { includeTicketLink = true } = options;
      const baseUrl = appUrl || this.getAppUrl();
      const safeEmail = encodeURIComponent(customerEmail || '');
      const safeName = encodeURIComponent(customerName || '');
      const ticketPath = `/chat/${ticketId}?m=&u=${safeName}&e=${safeEmail}`;
      const ticketLink = this.buildAuthEntryUrl(baseUrl, ticketPath, {
        email: customerEmail,
        name: customerName,
        roleHint: 'customer'
      });
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `Ticket #${ticketId} Closed - Thank you for your feedback`;

      const ticketLinkSection = includeTicketLink
        ? `<p style="margin:0 0 12px 0"><a href="${ticketLink}" style="color:#2563eb;text-decoration:none">View your ticket history</a></p>`
        : '';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#10b981;margin-bottom:10px">✅ ITSM Support</div>
              <h1>Your Ticket Has Been Closed</h1>
            </div>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>Your ticket has been successfully closed.</p>
            <div style="background:#ecfdf5;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #10b981">
              <p><strong>Ticket ID:</strong> #${ticketId}</p>
              <p><strong>Subject:</strong> ${ticketTitle || 'Support Request'}</p>
            </div>
            <p>Thank you for working with our support team.</p>
            <div style="background:#f8fafc;padding:18px;border-radius:8px;margin:20px 0;border-left:4px solid #3b82f6">
              <p style="margin:0 0 10px 0"><strong>We would love your feedback</strong></p>
              <p style="margin:0 0 12px 0">Please share a quick rating and comment about your support experience.</p>
              <a href="${feedbackUrl}" style="display:inline-block;background:#2563eb;color:white;padding:11px 22px;text-decoration:none;border-radius:6px;font-weight:bold">Share Feedback</a>
            </div>
            ${ticketLinkSection}
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;

      const textContent = `Hi ${customerName || 'Customer'},

Your ticket #${ticketId} has been closed.
Subject: ${ticketTitle || 'Support Request'}

Thank you for contacting support. We would love your feedback:
${feedbackUrl}

${includeTicketLink ? `View ticket history: ${ticketLink}\n\n` : ''}ITSM Support Team`;

      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });

      console.log(`✅ Ticket closed email sent to ${customerEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending ticket closed email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send notification to manager about unregistered domain email held in review queue
  async sendUnregisteredDomainNotification(managerEmail, managerName, senderEmail, subjectText, bodyText) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping unregistered domain notification');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `⚠️ Review Required: Support Email from Unregistered Domain`;
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#f59e0b;margin-bottom:10px">⚠️ ITSM Manager Review</div>
              <h1>Unregistered Domain Alert</h1>
            </div>
            <p>Hi <strong>${managerName || 'Manager'}</strong>,</p>
            <p>An email was received from an unregistered custom domain and has been held in the <strong>Manager Review Queue</strong>.</p>
            <div style="background:#fef3c7;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #f59e0b">
              <p><strong>Sender:</strong> ${senderEmail}</p>
              <p><strong>Subject:</strong> ${subjectText || 'No subject'}</p>
              <p><strong>Message Content:</strong></p>
              <p style="white-space:pre-wrap;background:#fff;padding:15px;border-radius:4px;border:1px solid #e2e8f0;font-size:14px;color:#4b5563">${bodyText || ''}</p>
            </div>
            <p>Please log into your ITSM Manager Dashboard to approve this sender, convert it to a ticket, or reject it.</p>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated system alert.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${managerName || 'Manager'},\n\nAn email was received from an unregistered domain (${senderEmail}) and is held in the review queue.\n\nSubject: ${subjectText}\nContent:\n${bodyText}\n\nPlease review it in the manager portal.`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: managerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending unregistered domain notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Send SLA warning notification
  async sendSLAWarningNotification(recipientEmail, recipientName, { ticketId, ticketTitle, timerType, elapsedMinutes, departmentName }, appUrl) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping SLA warning notification');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `⚠️ SLA Warning: ${ticketTitle || 'Support Request'} #${ticketId}`;
      const ticketLink = `${appUrl}/tickets/${ticketId}`;
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#f59e0b;margin-bottom:10px">⚠️ SLA Warning</div>
              <h1>Service Level Alert</h1>
            </div>
            <p>Hi <strong>${recipientName || 'Team Member'}</strong>,</p>
            <p>The SLA timer for <strong>${timerType}</strong> on ticket <strong>#${ticketId}</strong> is approaching the warning threshold.</p>
            <div style="background:#fef3c7;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #f59e0b">
              <p><strong>Ticket:</strong> ${ticketTitle || 'Support Request'}</p>
              <p><strong>Department:</strong> ${departmentName || 'N/A'}</p>
              <p><strong>Timer Type:</strong> ${timerType}</p>
              <p><strong>Elapsed Time:</strong> ${elapsedMinutes} minutes</p>
            </div>
            <p>Please respond to this ticket soon to avoid SLA breach.</p>
            <p style="margin-top:30px">
              <a href="${ticketLink}" style="display:inline-block;padding:12px 24px;background:#0F172A;color:white;text-decoration:none;border-radius:6px;font-weight:600">View Ticket</a>
            </p>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated SLA warning notification.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${recipientName || 'Team Member'},\n\nSLA Warning: The ${timerType} timer for ticket #${ticketId} (${ticketTitle}) has reached ${elapsedMinutes} minutes.\n\nDepartment: ${departmentName || 'N/A'}\n\nPlease respond soon to avoid SLA breach.\n\nView ticket: ${ticketLink}\n\nITSM Support Team`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: recipientEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ SLA warning email sent to ${recipientEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending SLA warning email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send SLA breach escalation notification
  async sendSLABreachEscalationNotification(recipientEmail, recipientName, { ticketId, ticketTitle, timerType, departmentName }, appUrl) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping SLA breach notification');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `🚨 SLA Breach Escalation: ${ticketTitle || 'Support Request'} #${ticketId}`;
      const ticketLink = `${appUrl}/tickets/${ticketId}`;
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#ef4444;margin-bottom:10px">🚨 SLA Breach</div>
              <h1>Escalation Required</h1>
            </div>
            <p>Hi <strong>${recipientName || 'Department Head'}</strong>,</p>
            <p>The SLA timer for <strong>${timerType}</strong> on ticket <strong>#${ticketId}</strong> has exceeded the breach threshold. The ticket has been escalated to you.</p>
            <div style="background:#fef2f2;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #ef4444">
              <p><strong>Ticket:</strong> ${ticketTitle || 'Support Request'}</p>
              <p><strong>Department:</strong> ${departmentName || 'N/A'}</p>
              <p><strong>Timer Type:</strong> ${timerType}</p>
              <p><strong>Status:</strong> Escalated to Department Head</p>
            </div>
            <p>Please review and take appropriate action on this ticket.</p>
            <p style="margin-top:30px">
              <a href="${ticketLink}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;font-weight:600">View Escalated Ticket</a>
            </p>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated SLA breach escalation notification.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${recipientName || 'Department Head'},\n\nSLA Breach Escalation: The ${timerType} timer for ticket #${ticketId} (${ticketTitle}) has exceeded the breach threshold.\n\nDepartment: ${departmentName || 'N/A'}\nStatus: Escalated to Department Head\n\nPlease review and take action.\n\nView ticket: ${ticketLink}\n\nITSM Support Team`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: recipientEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`✅ SLA breach escalation email sent to ${recipientEmail} for ticket #${ticketId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending SLA breach email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send polite rejection email to customer when sending from personal email domain
  async sendPersonalDomainRejection(customerEmail, customerName) {
    try {
      if (!this.transporter) {
        console.warn('⚠️ Email transporter not initialized, skipping personal domain rejection');
        return { success: false, error: 'Email not configured' };
      }
      const { fromName, fromAddress } = this._getSmtpConfig();
      const subject = `⚠️ Support Request Rejected: Official Email Required`;
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4">
          <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)">
            <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #e2e8f0;margin-bottom:30px">
              <div style="font-size:24px;font-weight:bold;color:#ef4444;margin-bottom:10px">🎫 ITSM Support Team</div>
              <h1>Official Email Required</h1>
            </div>
            <p>Hi <strong>${customerName || 'Customer'}</strong>,</p>
            <p>We received your support request, but we noticed it was sent from a personal email domain (such as Gmail, Outlook, Yahoo, or iCloud).</p>
            <p>To ensure proper data security, service level tracking (SLA), and tenant mapping, support tickets can only be created using your <strong>official company or organization email address</strong>.</p>
            <div style="background:#fef2f2;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #ef4444">
              <p style="margin:0;font-weight:bold;color:#991b1b">What should I do next?</p>
              <p style="margin:10px 0 0 0;color:#991b1b;font-size:15px">Please resubmit your support request using your official corporate/organization email address. If your domain is new or has not been registered in our system, please contact your account manager to complete the registration.</p>
            </div>
            <p>Thank you for your cooperation and understanding.</p>
            <p style="margin-top:30px;color:#6b7280;font-size:14px">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `;
      const textContent = `Hi ${customerName || 'Customer'},\n\nWe received your support request, but we noticed it was sent from a personal email domain (Gmail, Outlook, Yahoo, iCloud).\n\nTo ensure proper security and routing, support tickets can only be created using your official company or organization email address.\n\nPlease resubmit your request using your official email address.\n\nThank you!\nITSM Support Team`;
      const result = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: customerEmail,
        subject,
        text: textContent,
        html: htmlContent
      });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending personal domain rejection email:', error);
      return { success: false, error: error.message };
    }
  }

  // Test email configuration
  async testEmailConfig() {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      await this.transporter.verify();
      console.log('✅ Email configuration is valid');
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      console.error('❌ Email configuration test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
