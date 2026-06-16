const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
require('dotenv').config({ path: './config.env' });

async function run() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const host = process.env.IMAP_SERVER || 'imap.gmail.com';
  const port = parseInt(process.env.IMAP_PORT || '993', 10);
  const secure = port === 993;

  console.log(`Connecting to IMAP server: ${host}:${port} as ${user}...`);

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const lock = await client.getMailboxLock('INBOX');
    console.log(`✅ Mailbox locked/opened.`);

    // Search for unseen emails first
    console.log('\n🔍 Searching for UNREAD (seen: false) emails:');
    const unseenUids = await client.search({ seen: false });
    console.log(`Found ${unseenUids.length} unread emails.`);

    if (unseenUids.length > 0) {
      for (const uid of unseenUids.slice(0, 5)) {
        const msg = await client.fetchOne(uid, { envelope: true });
        console.log(`- UID: ${uid} | From: ${msg.envelope.from?.[0]?.address} | Subject: "${msg.envelope.subject}"`);
      }
    }

    lock.release();

  } catch (err) {
    console.error('❌ Connection or query failed:', err);
  } finally {
    await client.logout();
  }
}

run();
