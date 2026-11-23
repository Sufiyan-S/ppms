-- A handover closes the outgoing shift and opens a new one for the incoming operator; older handovers have none.
ALTER TABLE shift_handovers
    ADD COLUMN incoming_shift_id BIGINT,
    ADD CONSTRAINT fk_sho_incoming_shift FOREIGN KEY (incoming_shift_id) REFERENCES shifts (id);

-- A saved sheet is marked stale when something it summarises changes after it was generated.
-- open_shift_count is only non-zero on a live sheet generated for today while shifts were still open.
ALTER TABLE balance_sheets
    ADD COLUMN stale            BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN stale_reason     VARCHAR(500),
    ADD COLUMN open_shift_count INTEGER      NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_bs_open_shift_count_not_negative CHECK (open_shift_count >= 0);

-- Links the lot a dip check created for extra fuel found, so the gain is valued at that lot's cost.
ALTER TABLE inventory_lots
    ADD COLUMN dip_check_id BIGINT,
    ADD CONSTRAINT fk_lot_dip_check FOREIGN KEY (dip_check_id) REFERENCES dip_checks (id);

-- Existing gain lots were created with the check's tank and timestamp as their delivery date.
UPDATE inventory_lots l
SET dip_check_id = d.id
FROM dip_checks d
WHERE l.is_dip_adjustment = TRUE
  AND l.dip_check_id IS NULL
  AND l.tank_id = d.tank_id
  AND l.delivery_date = d.checked_at;

CREATE INDEX idx_lots_dip_check ON inventory_lots (dip_check_id) WHERE dip_check_id IS NOT NULL;
CREATE INDEX idx_consumptions_dip_correction ON lot_consumptions (dip_correction_id) WHERE dip_correction_id IS NOT NULL;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'CALIBRATION_DUE_SOON';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'LOT_COST_CORRECTED';
