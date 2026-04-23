-- V3: Backfill shift support
-- Adds is_backfilled flag to shifts and SHIFT_BACKFILLED audit action.
-- Backfilled shifts are entered retroactively by Admin/Owner for historical data.
-- They behave identically to live closed shifts for reports and balance sheets.

ALTER TABLE shifts ADD COLUMN is_backfilled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SHIFT_BACKFILLED';
