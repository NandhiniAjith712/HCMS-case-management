/**
 * Migration: Create ticket_messages table, migrate ALL conversation data, drop legacy tables
 * - replies -> ticket_messages (channel: platform_chat)
 * - chat_messages -> ticket_messages (channel: platform_chat)
 * - whatsapp_messages -> ticket_messages (channel: whatsapp, match phone to ticket)
 * Then DROP: replies, chat_messages, whatsapp_messages, whatsapp_conversations
 * Run: node backend/migrations/add-ticket-messages.js
 */
const { pool } = require('../../shared/database/database');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    const dbName = process.env.DB_NAME || 'tick_system';
    const dbHost = process.env.DB_HOST || 'localhost';
    console.log(`🚀 Starting unified ticket_messages migration...`);
    console.log(`   Database: ${dbName} @ ${dbHost}\n`);

    const [tables] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('replies','chat_messages')",
      [dbName]
    );
    console.log(`   Found legacy tables: ${tables.map(t => t.TABLE_NAME).join(', ') || '(none)'}\n`);

    await connection.beginTransaction();

    // 1. Create ticket_messages table if not exists (with is_read for mark-as-read)
    console.log('📋 Step 1: Creating ticket_messages table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        ticket_id INT NOT NULL,
        sender_type ENUM('user', 'agent', 'system') NOT NULL,
        sender_id INT NULL,
        sender_name VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        channel ENUM('email', 'whatsapp', 'platform_chat') NOT NULL,
        external_id VARCHAR(255) NULL,
        is_read BOOLEAN DEFAULT FALSE,
        read_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ticket_id (ticket_id),
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_created_at (created_at),
        INDEX idx_channel (channel),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `);
    // Add is_read columns if table already existed
    try {
      await connection.execute('ALTER TABLE ticket_messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE');
      await connection.execute('ALTER TABLE ticket_messages ADD COLUMN read_at DATETIME NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.warn('Note:', e.message);
    }
    console.log('✅ ticket_messages table ready\n');

    // 2. Migrate from replies (channel: platform_chat)
    console.log('📋 Step 2: Migrating from replies...');
    let repliesMigrated = 0;
    try {
      let replies = [];
      try {
        [replies] = await connection.execute(`
          SELECT id, tenant_id, ticket_id, agent_name, customer_name, message, is_customer_reply, sent_at, created_at
          FROM replies
          ORDER BY ticket_id, COALESCE(sent_at, created_at) ASC
        `);
      } catch (colErr) {
        if (colErr.code === 'ER_BAD_FIELD_ERROR') {
          [replies] = await connection.execute(`
            SELECT id, ticket_id, message, created_at FROM replies ORDER BY ticket_id, created_at ASC
          `);
          replies = replies.map(r => ({
            ...r,
            tenant_id: 1,
            agent_name: 'Agent',
            customer_name: 'Customer',
            is_customer_reply: false,
            sent_at: r.created_at
          }));
        } else throw colErr;
      }
      const seenKeys = new Set();
      for (const r of replies) {
        const tenantId = r.tenant_id || 1;
        const senderType = r.is_customer_reply ? 'user' : 'agent';
        const senderName = r.is_customer_reply
          ? (r.customer_name || 'Customer')
          : (r.agent_name || 'Agent');
        const createdAt = r.sent_at || r.created_at || new Date();
        const key = `r_${r.ticket_id}_${createdAt}_${senderType}_${(r.message || '').slice(0, 50)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        // Skip if already in ticket_messages (e.g. re-run after partial migration)
        const [existing] = await connection.execute(
          `SELECT id FROM ticket_messages WHERE ticket_id = ? AND tenant_id = ? AND sender_type = ?
           AND created_at BETWEEN DATE_SUB(?, INTERVAL 5 SECOND) AND DATE_ADD(?, INTERVAL 5 SECOND)
           AND LEFT(message, 100) = LEFT(?, 100) LIMIT 1`,
          [r.ticket_id, tenantId, senderType, createdAt, createdAt, r.message || '']
        );
        if (existing.length > 0) continue;

        await connection.execute(
          `INSERT INTO ticket_messages (tenant_id, ticket_id, sender_type, sender_name, message, channel, created_at)
           VALUES (?, ?, ?, ?, ?, 'platform_chat', ?)`,
          [tenantId, r.ticket_id, senderType, senderName, r.message || '', createdAt]
        );
        repliesMigrated++;
      }
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        console.log('   (replies table does not exist, skipping)');
      } else {
        console.error('   Error migrating replies:', e.message);
        throw e;
      }
    }
    console.log(`✅ Migrated ${repliesMigrated} replies\n`);

    // 3. Migrate from chat_messages (channel: platform_chat)
    console.log('📋 Step 3: Migrating from chat_messages...');
    let chatMigrated = 0;
    try {
      let chatMessages = [];
      try {
        [chatMessages] = await connection.execute(`
          SELECT cm.id, cm.tenant_id, cm.ticket_id, cm.sender_type, cm.sender_id, cm.sender_name, cm.message, cm.created_at
          FROM chat_messages cm
          ORDER BY cm.ticket_id, cm.created_at ASC
        `);
      } catch (colErr) {
        if (colErr.code === 'ER_BAD_FIELD_ERROR') {
          [chatMessages] = await connection.execute(`
            SELECT cm.id, cm.ticket_id, cm.sender_type, cm.sender_id, cm.sender_name, cm.message, cm.created_at
            FROM chat_messages cm
            ORDER BY cm.ticket_id, cm.created_at ASC
          `);
          chatMessages = chatMessages.map(r => ({ ...r, tenant_id: 1 }));
        } else throw colErr;
      }

      for (const cm of chatMessages) {
        const tenantId = cm.tenant_id || 1;
        const senderType = cm.sender_type === 'customer' ? 'user' : (cm.sender_type || 'agent');
        const senderName = cm.sender_name || (senderType === 'user' ? 'Customer' : 'Agent');

        const [existing] = await connection.execute(
          `SELECT id FROM ticket_messages
           WHERE ticket_id = ? AND tenant_id = ? AND sender_type = ?
           AND created_at BETWEEN DATE_SUB(?, INTERVAL 5 SECOND) AND DATE_ADD(?, INTERVAL 5 SECOND)
           LIMIT 1`,
          [cm.ticket_id, tenantId, senderType, cm.created_at, cm.created_at]
        );
        if (existing.length > 0) continue;

        await connection.execute(
          `INSERT INTO ticket_messages (tenant_id, ticket_id, sender_type, sender_id, sender_name, message, channel, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'platform_chat', ?)`,
          [tenantId, cm.ticket_id, senderType, cm.sender_id, senderName, cm.message || '', cm.created_at]
        );
        chatMigrated++;
      }
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') console.log('   (chat_messages table does not exist, skipping)');
      else throw e;
    }
    console.log(`✅ Migrated ${chatMigrated} chat_messages\n`);

    // 4. Migrate from whatsapp_messages (channel: whatsapp) - match phone_number to tickets.mobile
    console.log('📋 Step 4: Migrating from whatsapp_messages...');
    let whatsappMigrated = 0;
    try {
      const [waMsgs] = await connection.execute(`
        SELECT id, phone_number, message_text, message_id, created_at
        FROM whatsapp_messages
        ORDER BY created_at ASC
      `);
      for (const w of waMsgs) {
        const phone = (w.phone_number || '').trim().replace(/^\+/, '');
        if (!phone || !w.message_text) continue;

        const [tickets] = await connection.execute(
          `SELECT id, tenant_id, name FROM tickets WHERE (mobile = ? OR mobile = ? OR REPLACE(REPLACE(mobile,' ',''),'+','') = ?) ORDER BY created_at DESC LIMIT 1`,
          [w.phone_number, phone, phone]
        );
        if (tickets.length === 0) {
          console.log(`   ⚠️ No ticket for phone ${w.phone_number}, skipping message`);
          continue;
        }
        const t = tickets[0];

        await connection.execute(
          `INSERT INTO ticket_messages (tenant_id, ticket_id, sender_type, sender_name, message, channel, external_id, created_at)
           VALUES (?, ?, 'user', ?, ?, 'whatsapp', ?, ?)`,
          [t.tenant_id || 1, t.id, t.name || 'Customer', w.message_text, w.message_id || null, w.created_at]
        );
        whatsappMigrated++;
      }
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') console.log('   (whatsapp_messages table does not exist, skipping)');
      else throw e;
    }
    console.log(`✅ Migrated ${whatsappMigrated} whatsapp_messages\n`);

    // 5. Drop legacy tables (keep chat_sessions, chat_participants - used for real-time presence)
    console.log('📋 Step 5: Dropping legacy tables...');
    const tablesToDrop = ['chat_messages', 'replies', 'whatsapp_messages', 'whatsapp_conversations'];
    for (const table of tablesToDrop) {
      try {
        await connection.execute(`DROP TABLE IF EXISTS ${table}`);
        console.log(`   Dropped ${table}`);
      } catch (e) {
        console.warn(`   Could not drop ${table}:`, e.message);
      }
    }
    console.log('✅ Legacy tables removed\n');

    await connection.commit();
    console.log('✅ Migration completed successfully');
    console.log('   All conversations are now in ticket_messages with channel (email/whatsapp/platform_chat)');
  } catch (error) {
    await connection.rollback();
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate().catch(() => process.exit(1));
