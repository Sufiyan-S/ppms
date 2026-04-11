-- V3: Add uniqueness guards to prevent double-application of interest and duplicate tanker deliveries.
--
-- BUG-3 FIX: Prevent duplicate interest charges for the same client and period.
-- Without this, calling the manual interest endpoint twice (or a rare ShedLock race in
-- InterestStagingJob) would charge a client twice for the same calendar period.
-- The constraint fires at the DB level — any duplicate insert gets a clear constraint
-- violation rather than silently creating a second charge row.

-- Deduplicate any existing rows before adding the constraint, keeping the oldest (lowest id).
-- This handles the case where the interest endpoint was called multiple times during development.
DELETE FROM credit_interest_charges a
USING credit_interest_charges b
WHERE a.id > b.id
  AND a.client_id   = b.client_id
  AND a.period_from = b.period_from
  AND a.period_to   = b.period_to;

ALTER TABLE credit_interest_charges
    ADD CONSTRAINT uq_cic_client_period UNIQUE (client_id, period_from, period_to);

-- BUG-4 FIX: Prevent recording the same tanker delivery invoice twice at the same pump.
-- Without this, a data-entry mistake (e.g. submitting the form twice) doubles the tank
-- stock and creates a phantom FIFO lot — every subsequent shift close uses inflated COGS.
-- Applied as a partial index so that NULL invoice_reference rows (legacy / partial entries)
-- are not blocked — each NULL is considered distinct by PostgreSQL.
--
-- IMPORTANT: tanker_deliveries rows are referenced by inventory_lots via FK (fk_lot_delivery),
-- so duplicate rows cannot be deleted here. The index is created conditionally: if duplicates
-- already exist in dev data, the index is skipped and a notice is raised. This allows the app
-- to start. The duplicate deliveries should be cleaned up manually (see comment below), after
-- which this index can be applied by running:
--   CREATE UNIQUE INDEX uq_delivery_pump_invoice ON tanker_deliveries (pump_id, invoice_reference)
--   WHERE invoice_reference IS NOT NULL;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM tanker_deliveries
        WHERE invoice_reference IS NOT NULL
        GROUP BY pump_id, invoice_reference
        HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'V3: Skipped uq_delivery_pump_invoice — duplicate (pump_id, invoice_reference) '
                     'rows exist that are referenced by inventory_lots and cannot be auto-deleted. '
                     'Clean up duplicate tanker deliveries and their inventory_lots manually, '
                     'then run: CREATE UNIQUE INDEX uq_delivery_pump_invoice ON tanker_deliveries '
                     '(pump_id, invoice_reference) WHERE invoice_reference IS NOT NULL;';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_pump_invoice
            ON tanker_deliveries (pump_id, invoice_reference)
            WHERE invoice_reference IS NOT NULL;
        RAISE NOTICE 'V3: Created uq_delivery_pump_invoice index successfully.';
    END IF;
END $$;
