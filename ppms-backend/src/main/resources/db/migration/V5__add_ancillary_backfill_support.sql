-- V5: Ancillary product backfill support
-- Adds is_backfilled flag to ancillary_sales and ancillary_stock_deliveries.
-- Backfilled entries are entered retroactively by Admin/Owner for historical data.
-- They behave identically to live entries for reports and balance sheets.

ALTER TABLE ancillary_sales ADD COLUMN is_backfilled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ancillary_stock_deliveries ADD COLUMN is_backfilled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ANCILLARY_SALE_BACKFILLED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ANCILLARY_DELIVERY_BACKFILLED';
