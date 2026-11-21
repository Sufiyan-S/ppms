-- Indexes for the hot read paths: shift history, overdue job, reports, balance sheets,
-- cash drawer balance and credit extensions. Plain CREATE INDEX (inside Flyway's transaction):
-- every table here is small enough per pump that the brief write lock during the build is acceptable.

CREATE INDEX IF NOT EXISTS idx_shifts_pump_start ON shifts (pump_id, actual_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_pump_end ON shifts (pump_id, actual_end_time);
CREATE INDEX IF NOT EXISTS idx_shifts_open ON shifts (actual_start_time) WHERE status IN ('OPEN', 'OPEN_OVERDUE');

CREATE INDEX IF NOT EXISTS idx_ftxn_pump_recorded ON fuel_transactions (pump_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_cext_client_status ON credit_extensions (pump_id, client_id, status);
CREATE INDEX IF NOT EXISTS idx_cext_active_expiry ON credit_extensions (expiry_date) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_bsfl_sheet ON bs_fuel_lines (balance_sheet_id);
CREATE INDEX IF NOT EXISTS idx_bssl_sheet ON bs_shift_lines (balance_sheet_id);
CREATE INDEX IF NOT EXISTS idx_bs_pump_date ON balance_sheets (pump_id, report_date DESC, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_events_pump ON cash_events (pump_id, event_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asale_pump_date ON ancillary_sales (pump_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_asale_pump_created ON ancillary_sales (pump_id, created_at);
CREATE INDEX IF NOT EXISTS idx_alc_sale ON ancillary_lot_consumptions (sale_id);

CREATE INDEX IF NOT EXISTS idx_expense_pump_date ON pump_expenses (pump_id, expense_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dips_pump_checked ON dip_checks (pump_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_nra_pump_created ON nozzle_reading_adjustments (pump_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fde_pump_date ON fuel_dip_entries (pump_id, dip_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_pump_date ON tanker_deliveries (pump_id, delivery_date);

CREATE INDEX IF NOT EXISTS idx_cal_pump_nozzle_date ON nozzle_calibration_logs (pump_id, nozzle_id, calibration_date DESC);
