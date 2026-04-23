-- V6: Payment settlement tracking
-- Adds tables to track when UPI / Card / Fleet Card payments actually arrive in the bank.
-- Background: digital payments collected in shifts are not credited instantly. There is a
-- settlement lag (e.g. UPI settles next-day by 6 AM). Owners track this "wallet" balance
-- so they know how much is still in transit.
--
-- payment_settlement_configs — per-type daily alert time, configurable per pump.
-- payment_settlements         — records each day's actual bank credit, entered by Admin/Owner.

CREATE TYPE settlement_payment_type AS ENUM ('UPI', 'CARD', 'FLEET_CARD');

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'SETTLEMENT_REMINDER';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SETTLEMENT_RECORDED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SETTLEMENT_CONFIG_UPDATED';

-- One row per payment type per pump. Upserted by the config API.
CREATE TABLE payment_settlement_configs (
    id           BIGSERIAL PRIMARY KEY,
    pump_id      BIGINT NOT NULL REFERENCES pump_locations(id) ON DELETE CASCADE,
    payment_type settlement_payment_type NOT NULL,
    -- Time (IST) when admin should be reminded to record today's settlement.
    -- Default 18:00 (6 PM) — typical end-of-business reconciliation time.
    alert_time   TIME NOT NULL DEFAULT '18:00:00',
    is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (pump_id, payment_type)
);

-- One row per settlement entry (admin records "₹X arrived in bank on 2026-04-21 for UPI").
-- settlement_date is the date the money arrived, not when it was recorded.
CREATE TABLE payment_settlements (
    id                  BIGSERIAL PRIMARY KEY,
    pump_id             BIGINT NOT NULL REFERENCES pump_locations(id) ON DELETE CASCADE,
    payment_type        settlement_payment_type NOT NULL,
    settlement_date     DATE NOT NULL,
    amount_received     NUMERIC(15, 2) NOT NULL CHECK (amount_received >= 0),
    notes               TEXT,
    recorded_by_user_id BIGINT NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast wallet-balance calculation (SUM by pump + type) and date-range queries.
CREATE INDEX idx_payment_settlements_pump_type ON payment_settlements(pump_id, payment_type);
CREATE INDEX idx_payment_settlements_pump_date ON payment_settlements(pump_id, settlement_date DESC);
