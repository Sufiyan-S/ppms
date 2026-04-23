-- Track the wallet balance at the time a settlement was recorded.
-- Nullable so existing rows are unaffected (treated as "unknown" in the UI).
ALTER TABLE payment_settlements
    ADD COLUMN pending_at_record_time NUMERIC(14, 2);
