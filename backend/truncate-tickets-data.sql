-- =====================================================
-- Ticket Data Truncation Script
-- =====================================================
-- This script truncates all ticket-related data while preserving
-- the database structure and maintaining referential integrity.
--
-- WARNING: This will delete ALL ticket-related data!
-- Make sure you have backups before running this script.
-- =====================================================

-- Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- Show current data counts before truncation
SELECT 'Current data counts before truncation:' as info;

SELECT 'tickets' as table_name, COUNT(*) as row_count FROM tickets
UNION ALL
SELECT 'replies', COUNT(*) FROM replies
UNION ALL
SELECT 'performance_ratings', COUNT(*) FROM performance_ratings
UNION ALL
SELECT 'chat_messages', COUNT(*) FROM chat_messages
UNION ALL
SELECT 'chat_sessions', COUNT(*) FROM chat_sessions
UNION ALL
SELECT 'chat_participants', COUNT(*) FROM chat_participants
UNION ALL
SELECT 'escalations', COUNT(*) FROM escalations
UNION ALL
SELECT 'sla_timers', COUNT(*) FROM sla_timers
UNION ALL
SELECT 'ticket_assignments', COUNT(*) FROM ticket_assignments
UNION ALL
SELECT 'agent_sessions', COUNT(*) FROM agent_sessions
UNION ALL
SELECT 'whatsapp_conversations', COUNT(*) FROM whatsapp_conversations;

-- =====================================================
-- TRUNCATE TABLES IN CORRECT ORDER
-- =====================================================

-- 1. Truncate child tables first (tables that reference tickets)

-- Chat participants (references chat_sessions)
TRUNCATE TABLE chat_participants;

-- Chat messages (references tickets)
TRUNCATE TABLE chat_messages;

-- Chat sessions (references tickets)
TRUNCATE TABLE chat_sessions;

-- Escalations (references tickets and sla_timers)
TRUNCATE TABLE escalations;

-- SLA timers (references tickets)
TRUNCATE TABLE sla_timers;

-- Performance ratings (references tickets)
TRUNCATE TABLE performance_ratings;

-- Replies (references tickets)
TRUNCATE TABLE replies;

-- Ticket assignments (references tickets)
TRUNCATE TABLE ticket_assignments;

-- Agent sessions (references agents)
TRUNCATE TABLE agent_sessions;

-- 2. Truncate main ticket table
TRUNCATE TABLE tickets;

-- 3. Truncate WhatsApp conversations (if they reference tickets)
TRUNCATE TABLE whatsapp_conversations;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show data counts after truncation
SELECT 'Data counts after truncation:' as info;

SELECT 'tickets' as table_name, COUNT(*) as row_count FROM tickets
UNION ALL
SELECT 'replies', COUNT(*) FROM replies
UNION ALL
SELECT 'performance_ratings', COUNT(*) FROM performance_ratings
UNION ALL
SELECT 'chat_messages', COUNT(*) FROM chat_messages
UNION ALL
SELECT 'chat_sessions', COUNT(*) FROM chat_sessions
UNION ALL
SELECT 'chat_participants', COUNT(*) FROM chat_participants
UNION ALL
SELECT 'escalations', COUNT(*) FROM escalations
UNION ALL
SELECT 'sla_timers', COUNT(*) FROM sla_timers
UNION ALL
SELECT 'ticket_assignments', COUNT(*) FROM ticket_assignments
UNION ALL
SELECT 'agent_sessions', COUNT(*) FROM agent_sessions
UNION ALL
SELECT 'whatsapp_conversations', COUNT(*) FROM whatsapp_conversations;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

SELECT '✅ Ticket data truncation completed successfully!' as status;
SELECT '✅ All ticket-related data has been cleared' as info1;
SELECT '✅ Database structure preserved' as info2;
SELECT '✅ Referential integrity maintained' as info3;
