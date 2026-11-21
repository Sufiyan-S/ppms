-- Totals that feed net profit, stored when a balance sheet is generated so that later price
-- changes or late expense approvals do not change a saved report. NULL for sheets generated
-- before this migration; those keep recomputing from live data.
ALTER TABLE balance_sheets ADD COLUMN IF NOT EXISTS total_dip_net_amount       NUMERIC(14,2);
ALTER TABLE balance_sheets ADD COLUMN IF NOT EXISTS product_sales_gross_profit NUMERIC(14,2);
ALTER TABLE balance_sheets ADD COLUMN IF NOT EXISTS total_expenses_amount      NUMERIC(14,2);
