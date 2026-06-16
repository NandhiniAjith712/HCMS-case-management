/**
 * Test incoming email – manually trigger one IMAP poll to process any replies.
 * Run from backend: node test-email-incoming.js
 *
 * Prerequisites:
 * - config.env has SMTP_EMAIL, SMTP_PASSWORD (and optionally IMAP_HOST, IMAP_PORT if not Gmail)
 * - A customer has replied to a ticket notification (e.g. "Re: New Reply on Your Support Ticket #123")
 * - Reply must be in INBOX and unread (or trigger poll before opening the mailbox elsewhere)
 *
 * Debug: set INCOMING_EMAIL_DEBUG=1 to log why emails are skipped.
 * Alternative: trigger poll via API: GET http://localhost:5000/api/incoming-email/poll
 */
require('dotenv').config({ path: './config.env' });
const incomingEmailService = require('./services/incomingEmailService');

async function main() {
  console.log('📧 Running one incoming email poll...');
  await incomingEmailService.processInbox();
  console.log('✅ Poll complete. Check ticket_messages table for channel=email.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
