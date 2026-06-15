-- Add fields to track actual response and resolution times
-- This script adds first_response_at and resolved_at fields to the tickets table

ALTER TABLE tickets 
ADD COLUMN first_response_at DATETIME NULL COMMENT 'Timestamp when agent first responded to the ticket',
ADD COLUMN resolved_at DATETIME NULL COMMENT 'Timestamp when ticket was resolved/closed';

-- Add indexes for better performance
CREATE INDEX idx_tickets_first_response ON tickets(first_response_at);
CREATE INDEX idx_tickets_resolved_at ON tickets(resolved_at);

-- Update existing tickets that are already in_progress or closed
-- Set first_response_at for tickets that are in_progress or closed
UPDATE tickets 
SET first_response_at = updated_at 
WHERE status IN ('in_progress', 'closed', 'escalated') 
AND first_response_at IS NULL;

-- Set resolved_at for tickets that are closed
UPDATE tickets 
SET resolved_at = updated_at 
WHERE status = 'closed' 
AND resolved_at IS NULL;
