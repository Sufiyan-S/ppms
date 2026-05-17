-- Adds the actual bill/invoice total to tanker deliveries.
-- Nullable: existing records and manager-recorded entries (no cost price) remain NULL.
-- For batch deliveries, all rows sharing the same invoice_reference store the same value.
ALTER TABLE tanker_deliveries
    ADD COLUMN IF NOT EXISTS bill_total NUMERIC(12, 2) NULL;
