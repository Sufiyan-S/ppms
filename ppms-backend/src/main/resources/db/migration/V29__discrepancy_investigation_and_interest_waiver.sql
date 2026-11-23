-- 1. A discrepancy can be put under investigation without being resolved.
--    The shift keeps its pending status; these columns record who is investigating, since when and why.
ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS investigation_note             TEXT,
    ADD COLUMN IF NOT EXISTS investigation_started_by_id    BIGINT,
    ADD COLUMN IF NOT EXISTS investigation_started_at       TIMESTAMPTZ;

ALTER TABLE shifts
    ADD CONSTRAINT fk_shift_investigation_started_by
        FOREIGN KEY (investigation_started_by_id) REFERENCES users (id),
    ADD CONSTRAINT chk_shift_investigation_fields
        CHECK ((investigation_started_at IS NULL) = (investigation_started_by_id IS NULL)
               AND (investigation_started_at IS NULL) = (investigation_note IS NULL));

-- Shifts that were marked PENDING_INVESTIGATION used to be closed as resolved by mistake.
-- Reopen them as under investigation, escalated again when the pump's current threshold says so.
UPDATE shifts s
SET investigation_note          = COALESCE(NULLIF(TRIM(s.discrepancy_resolution_note), ''), 'Marked pending investigation'),
    investigation_started_by_id = s.discrepancy_resolved_by_id,
    investigation_started_at    = COALESCE(s.discrepancy_resolved_at, s.updated_at),
    status = CASE
                 WHEN p.discrepancy_escalation_threshold IS NOT NULL
                      AND p.discrepancy_escalation_threshold > 0
                      AND s.discrepancy_amount > p.discrepancy_escalation_threshold
                     THEN 'CLOSED_DISCREPANCY_PENDING_APPROVAL'::shift_status
                 ELSE 'CLOSED_DISCREPANCY_PENDING'::shift_status
             END,
    discrepancy_resolution      = NULL,
    discrepancy_resolution_note = NULL,
    discrepancy_resolved_by_id  = NULL,
    discrepancy_resolved_at     = NULL
FROM pump_locations p
WHERE p.id = s.pump_id
  AND s.status = 'CLOSED_DISCREPANCY_RESOLVED'
  AND s.discrepancy_resolution = 'PENDING_INVESTIGATION'
  AND s.discrepancy_resolved_by_id IS NOT NULL;

-- 2. Interest charges are waived instead of deleted: the row stays with who waived it, when and why.
ALTER TABLE credit_interest_charges
    ADD COLUMN IF NOT EXISTS voided_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by      BIGINT,
    ADD COLUMN IF NOT EXISTS void_reason    TEXT;

ALTER TABLE credit_interest_charges
    ADD CONSTRAINT fk_cic_voided_by FOREIGN KEY (voided_by) REFERENCES users (id),
    ADD CONSTRAINT chk_cic_void_fields
        CHECK ((voided_at IS NULL) = (voided_by IS NULL) AND (voided_at IS NULL) = (void_reason IS NULL));

-- A waived period may be charged again, so only live charges must be unique per period.
ALTER TABLE credit_interest_charges DROP CONSTRAINT IF EXISTS uq_cic_client_period;
CREATE UNIQUE INDEX uq_cic_client_period_live
    ON credit_interest_charges (client_id, period_from, period_to)
    WHERE voided_at IS NULL;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DISCREPANCY_INVESTIGATION_STARTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTEREST_CHARGE_WAIVED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTEREST_SETTINGS_CHANGED';
