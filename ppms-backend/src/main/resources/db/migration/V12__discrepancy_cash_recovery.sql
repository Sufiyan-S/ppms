-- Cash recovery amount captured on the shift when a SHORT discrepancy is resolved
-- via CASH_RECOVERY (operator physically returned the cash).
-- NULL for all other resolution types and unresolved discrepancies.
ALTER TABLE shifts
    ADD COLUMN cash_recovery_amount NUMERIC(14,2);

-- Per-day total of all cash recoveries recorded on that report date.
-- Only populated for DAY balance sheets; always 0 for SHIFT reports.
ALTER TABLE balance_sheets
    ADD COLUMN total_cash_recovery NUMERIC(14,2) NOT NULL DEFAULT 0;
