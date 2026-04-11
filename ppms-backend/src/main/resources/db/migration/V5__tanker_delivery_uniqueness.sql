-- V5: Add unique constraint on tanker_deliveries (pump_id, invoice_reference, fuel_type)
--
-- Context: V3 attempted a (pump_id, invoice_reference) unique index but skipped it because
-- INV-101 rows appeared to be duplicates. They were actually legitimate multi-fuel deliveries —
-- one invoice can cover PETROL, DIESEL, SPEED_PETROL, SPEED_DIESEL in separate rows (one per tank).
-- The correct uniqueness rule is: the same fuel type cannot be recorded twice under the same
-- invoice for the same pump. No data cleanup is needed — all existing rows pass this constraint.
--
-- Partial index: NULL invoice_reference rows (no invoice provided) are excluded since
-- each NULL is considered distinct by PostgreSQL, allowing back-dated or informal deliveries
-- without an invoice number.

CREATE UNIQUE INDEX uq_delivery_pump_invoice_fuel
    ON tanker_deliveries (pump_id, invoice_reference, fuel_type)
    WHERE invoice_reference IS NOT NULL;
