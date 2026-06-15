# Reopen SLA behavior verification checklist

## Goal
Verify **Ticket Reopen (Customer Rejection Flow)** does **not** reset SLA baseline.

- **Response time**: computed once (creation → first agent action). Must not change on reopen.
- **Resolution SLA**: continues from **original `tickets.created_at`**. Must not reset on reopen.
- **Reopen side effects**: only status + reopen metadata changes; no new SLA cycle.

## Pre-reqs
- Backend running
- A tenant and SLA configs exist for the ticket’s product/module/issue type (or system defaults apply)

## Test 1 — Reopen after SLA deadline (must show breached)
1. Create a ticket and note its `id`.
2. Ensure it has an SLA resolution time short enough to breach for testing (or wait long enough).
3. Let time pass so that **now > created_at + resolution_time_minutes**.
4. Close the ticket.
5. Reopen it via customer endpoint: `PUT /api/tickets/:ticketId/reopen`.
6. Fetch SLA timer: `GET /api/sla/timers/:ticketId/remaining`.

**Expected**
- `tickets.created_at` is unchanged after reopen.
- SLA response shows `is_breached: true` (or remaining goes negative logically).
- SLA deadline is still `created_at + resolution_time_minutes` (not “reopen time + …”).
- No duplicate `sla_timers` records are created for the ticket.

## Test 2 — Reopen before SLA deadline (timer continues)
1. Create ticket; confirm SLA timer remaining is positive.
2. Close and then reopen before the deadline.
3. Fetch timer remaining again.

**Expected**
- Remaining time decreases naturally with clock time (no “reset to full” on reopen).
- Deadline remains based on original `created_at`.

## Test 3 — Response time stability
1. Create ticket.
2. Move ticket to `in_progress` once (agent action) so `first_response_at` is set.
3. Close and reopen ticket.

**Expected**
- `first_response_at` remains populated (not cleared).
- `sla_first_response_met` remains unchanged (not reset to NULL).

## DB spot-check queries (MySQL)
Run these before and after reopen.

```sql
SELECT id, status, created_at, updated_at, first_response_at, sla_first_response_met,
       resolved_at, closed_at, resolution_time,
       reopened_at, reopen_count
FROM tickets
WHERE id = <TICKET_ID>;

SELECT ticket_id, timer_type, sla_deadline, status, updated_at
FROM sla_timers
WHERE ticket_id = <TICKET_ID>
ORDER BY timer_type, id;
```

**Expected**
- `created_at` unchanged on reopen.
- `reopened_at` updates to the latest reopen timestamp (if column exists).
- `reopen_count` increments by 1 on each reopen (if column exists).
- For `sla_timers`: at most one row per (`ticket_id`, `timer_type`) in normal operation; reopen must not insert new rows (should only update deadlines if SLA config changes).

