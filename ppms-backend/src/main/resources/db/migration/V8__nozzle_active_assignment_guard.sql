-- Tracks which nozzles are currently locked to an active (open) shift.
-- The PRIMARY KEY on nozzle_id provides a DB-level uniqueness guarantee:
-- even if two concurrent requests both pass the application-level check in
-- validateShiftCanOpen, only one INSERT will succeed — the other will fail
-- with a unique-constraint violation that ShiftService converts to a
-- BusinessException with a friendly message.
--
-- Managed by ShiftService:
--   - INSERT on shift open (one row per nozzle)
--   - DELETE on shift close (covers OPEN, OPEN_OVERDUE, AUTO_CLOSED_OVERDUE)
--
-- The OverdueShiftJob does NOT modify this table: OPEN_OVERDUE and
-- AUTO_CLOSED_OVERDUE shifts still block their nozzles until an operator
-- or manager explicitly closes them via the normal close-shift flow.

CREATE TABLE active_nozzle_assignments (
    nozzle_id BIGINT PRIMARY KEY,
    shift_id  BIGINT NOT NULL
);

-- Backfill any currently active shifts so the table starts consistent.
INSERT INTO active_nozzle_assignments (nozzle_id, shift_id)
SELECT sn.nozzle_id, sn.shift_id
FROM   shift_nozzles sn
JOIN   shifts        s  ON s.id = sn.shift_id
WHERE  s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
ON CONFLICT (nozzle_id) DO NOTHING;
