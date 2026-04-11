-- =============================================================================
-- PPMS Realistic Seed Data Script
-- Covers the last 15 days: 2026-03-20 → 2026-04-03 (for both pumps)
-- Safe to rerun: cleans up seeded date range before re-inserting
--
-- Assumptions made:
--   • Pump 1 (Malgaonkar) id=1, Pump 2 (pump2) id=2
--   • Manager for P1: Sanjay(9), Manager for P2: Mahesh(15), Owner: Jatin(3)
--   • 2 nozzles per pump are seeded (nozzle 1+2 for P1, nozzle 5+6 for P2)
--   • Historical shift definitions are created for 2026-03-20→2026-04-03
--     (current defs are effective from 2026-04-04, no overlap)
--   • Pump2 nozzle outlets had no tank_id; this script assigns them
-- =============================================================================

BEGIN;

DO $SEED$
DECLARE
  -- ── loop variable ──────────────────────────────────────────────────────────
  v_d   INT;      -- day offset 0..14
  v_day DATE;     -- actual date

  -- ── historical shift def IDs (returned after INSERT) ──────────────────────
  v_p1_night       BIGINT; v_p1_morning    BIGINT; v_p1_afternoon  BIGINT;
  v_p2_night       BIGINT; v_p2_morning    BIGINT; v_p2_afternoon  BIGINT;

  -- ── shift IDs captured via RETURNING ──────────────────────────────────────
  v_s BIGINT;

  -- ── outlet meter-reading accumulators ─────────────────────────────────────
  -- Pump1 Nozzle1 (id=1):  outlet 1 → tank1 PETROL | outlet 2 → tank3 SPEED_PETROL
  v_o1  NUMERIC := 10000.000;
  v_o2  NUMERIC :=  8000.000;
  -- Pump1 Nozzle2 (id=2):  outlet 3 → tank2 PETROL | outlet 4 → tank4 DIESEL
  v_o3  NUMERIC := 15000.000;
  v_o4  NUMERIC := 12000.000;
  -- Pump2 Nozzle5 (id=5):  outlet 9 → tank7 PETROL | outlet 10 → tank8 SPEED_PETROL
  v_o9  NUMERIC :=  5000.000;
  v_o10 NUMERIC :=  3000.000;
  -- Pump2 Nozzle6 (id=6):  outlet 11 → tank7 PETROL | outlet 12 → tank9 DIESEL
  v_o11 NUMERIC :=  7000.000;
  v_o12 NUMERIC :=  6000.000;

  -- ── per-shift sale quantities (litres) ────────────────────────────────────
  v_q1 NUMERIC; v_q2 NUMERIC;          -- outlet quantities in a shift
  v_tot NUMERIC;                        -- total rupee amount for the shift
  v_cash NUMERIC; v_upi NUMERIC;
  v_card NUMERIC; v_cred NUMERIC;

  -- ── ancillary product IDs for pump2 ───────────────────────────────────────
  v_p2_prod1 BIGINT; v_p2_prod2 BIGINT; v_p2_prod3 BIGINT;

  -- ── misc ──────────────────────────────────────────────────────────────────
  v_disc BOOLEAN;  -- does this shift have a discrepancy?

BEGIN

  -- ===========================================================================
  -- 0. CLEANUP  (delete seeded data so rerun is safe)
  -- ===========================================================================
  DELETE FROM shift_credit_entries WHERE shift_id IN (
    SELECT id FROM shifts WHERE pump_id IN (1,2)
      AND shift_date BETWEEN '2026-03-20' AND '2026-04-04'
  );
  DELETE FROM fuel_transactions WHERE shift_id IN (
    SELECT id FROM shifts WHERE pump_id IN (1,2)
      AND shift_date BETWEEN '2026-03-20' AND '2026-04-04'
  );
  DELETE FROM shift_fuel_readings WHERE shift_id IN (
    SELECT id FROM shifts WHERE pump_id IN (1,2)
      AND shift_date BETWEEN '2026-03-20' AND '2026-04-04'
  );
  DELETE FROM shifts
    WHERE pump_id IN (1,2) AND shift_date BETWEEN '2026-03-20' AND '2026-04-04';
  DELETE FROM dip_checks
    WHERE pump_id IN (1,2)
      AND checked_at >= '2026-03-20 00:00:00+00' AND checked_at < '2026-04-05 00:00:00+00';
  DELETE FROM cash_events
    WHERE pump_id IN (1,2) AND event_date BETWEEN '2026-03-20' AND '2026-04-04';
  DELETE FROM pump_expenses
    WHERE pump_id IN (1,2) AND expense_date BETWEEN '2026-03-20' AND '2026-04-04';
  DELETE FROM lot_consumptions WHERE lot_id IN (
    SELECT id FROM inventory_lots WHERE pump_id IN (1,2)
      AND delivery_date >= '2026-03-20 00:00:00+00' AND delivery_date < '2026-04-05 00:00:00+00'
  );
  DELETE FROM inventory_lots
    WHERE pump_id IN (1,2)
      AND delivery_date >= '2026-03-20 00:00:00+00' AND delivery_date < '2026-04-05 00:00:00+00';
  DELETE FROM tanker_deliveries
    WHERE pump_id IN (1,2)
      AND delivery_date >= '2026-03-20 00:00:00+00' AND delivery_date < '2026-04-05 00:00:00+00';
  DELETE FROM ancillary_lot_consumptions WHERE sale_id IN (
    SELECT id FROM ancillary_sales WHERE pump_id IN (1,2) AND sale_date BETWEEN '2026-03-20' AND '2026-04-04'
  );
  DELETE FROM ancillary_sales
    WHERE pump_id IN (1,2) AND sale_date BETWEEN '2026-03-20' AND '2026-04-04';
  DELETE FROM ancillary_lot_consumptions WHERE lot_id IN (
    SELECT id FROM ancillary_stock_lots WHERE pump_id IN (1,2)
      AND delivery_date BETWEEN '2026-03-20' AND '2026-04-04'
  );
  DELETE FROM ancillary_stock_lots
    WHERE pump_id IN (1,2) AND delivery_date BETWEEN '2026-03-20' AND '2026-04-04';
  DELETE FROM ancillary_stock_deliveries
    WHERE pump_id IN (1,2) AND delivery_date BETWEEN '2026-03-20' AND '2026-04-04';
  DELETE FROM credit_payments
    WHERE pump_id IN (1,2) AND payment_date BETWEEN '2026-03-20' AND '2026-04-04';
  -- remove only the historical defs created by this seed
  DELETE FROM pump_shift_definitions
    WHERE pump_id IN (1,2) AND effective_from = '2026-03-20' AND effective_to = '2026-04-03';

  -- ===========================================================================
  -- 1. FIX PUMP2 NOZZLE OUTLET → TANK ASSIGNMENTS  (idempotent)
  -- ===========================================================================
  UPDATE nozzle_outlets SET tank_id = 7  WHERE id = 9  AND tank_id IS NULL;
  UPDATE nozzle_outlets SET tank_id = 8  WHERE id = 10 AND tank_id IS NULL;
  UPDATE nozzle_outlets SET tank_id = 7  WHERE id = 11 AND tank_id IS NULL;
  UPDATE nozzle_outlets SET tank_id = 9  WHERE id = 12 AND tank_id IS NULL;
  UPDATE nozzle_outlets SET tank_id = 9  WHERE id = 13 AND tank_id IS NULL;
  UPDATE nozzle_outlets SET tank_id = 10 WHERE id = 14 AND tank_id IS NULL;
  UPDATE nozzle_outlets SET tank_id = 7  WHERE id = 15 AND tank_id IS NULL;
  UPDATE nozzle_outlets SET tank_id = 9  WHERE id = 16 AND tank_id IS NULL;

  -- ===========================================================================
  -- 2. ANCILLARY PRODUCTS FOR PUMP 2  (only if absent)
  -- ===========================================================================
  IF NOT EXISTS (SELECT 1 FROM ancillary_products WHERE pump_id = 2) THEN
    INSERT INTO ancillary_products
      (pump_id, name, brand, package_size, unit_of_measure,
       current_stock_units, low_stock_threshold, gst_rate_percent, status, created_at, updated_at)
    VALUES
      (2, 'Engine Oil',  'Castrol',  1.000, 'LITRE'::unit_of_measure, 80, 15, 18.00, 'ACTIVE'::ancillary_product_status, NOW(), NOW()),
      (2, 'Coolant',     'Prestone', 1.000, 'LITRE'::unit_of_measure, 50, 10, 18.00, 'ACTIVE'::ancillary_product_status, NOW(), NOW()),
      (2, 'Wiper Fluid', 'Generic',  0.500, 'LITRE'::unit_of_measure, 30,  8, 18.00, 'ACTIVE'::ancillary_product_status, NOW(), NOW());
  END IF;

  SELECT id INTO v_p2_prod1 FROM ancillary_products WHERE pump_id = 2 ORDER BY id LIMIT 1;
  SELECT id INTO v_p2_prod2 FROM ancillary_products WHERE pump_id = 2 ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO v_p2_prod3 FROM ancillary_products WHERE pump_id = 2 ORDER BY id OFFSET 2 LIMIT 1;

  -- ===========================================================================
  -- 3. HISTORICAL SHIFT DEFINITIONS  (2026-03-20 → 2026-04-03)
  --    Same Night / Morning / Afternoon pattern as current active defs.
  -- ===========================================================================
  INSERT INTO pump_shift_definitions
    (pump_id, name, start_time, end_time, crosses_midnight, is_night_shift,
     sort_order, effective_from, effective_to, created_by_user_id, created_at, updated_at)
  VALUES
    -- Pump 1
    (1, 'Night',     '23:00', '08:59', TRUE,  TRUE,  1, '2026-03-20', '2026-04-03', 3, NOW(), NOW()),
    (1, 'Morning',   '09:00', '15:59', FALSE, FALSE, 2, '2026-03-20', '2026-04-03', 3, NOW(), NOW()),
    (1, 'Afternoon', '16:00', '22:59', FALSE, FALSE, 3, '2026-03-20', '2026-04-03', 3, NOW(), NOW()),
    -- Pump 2
    (2, 'Night',     '23:00', '08:59', TRUE,  TRUE,  1, '2026-03-20', '2026-04-03', 3, NOW(), NOW()),
    (2, 'Morning',   '09:00', '15:59', FALSE, FALSE, 2, '2026-03-20', '2026-04-03', 3, NOW(), NOW()),
    (2, 'Afternoon', '16:00', '22:59', FALSE, FALSE, 3, '2026-03-20', '2026-04-03', 3, NOW(), NOW());

  SELECT id INTO v_p1_night     FROM pump_shift_definitions WHERE pump_id=1 AND effective_from='2026-03-20' AND name='Night';
  SELECT id INTO v_p1_morning   FROM pump_shift_definitions WHERE pump_id=1 AND effective_from='2026-03-20' AND name='Morning';
  SELECT id INTO v_p1_afternoon FROM pump_shift_definitions WHERE pump_id=1 AND effective_from='2026-03-20' AND name='Afternoon';
  SELECT id INTO v_p2_night     FROM pump_shift_definitions WHERE pump_id=2 AND effective_from='2026-03-20' AND name='Night';
  SELECT id INTO v_p2_morning   FROM pump_shift_definitions WHERE pump_id=2 AND effective_from='2026-03-20' AND name='Morning';
  SELECT id INTO v_p2_afternoon FROM pump_shift_definitions WHERE pump_id=2 AND effective_from='2026-03-20' AND name='Afternoon';

  -- ===========================================================================
  -- 4. MAIN LOOP  — 15 days (v_d = 0 → 14)
  -- ===========================================================================
  FOR v_d IN 0..14 LOOP
    v_day := DATE '2026-03-20' + v_d;

    -- every ~4th day this pump has one shift with a small discrepancy
    v_disc := (v_d % 4 = 3);

    -- =========================================================================
    -- PUMP 1  ·  NOZZLE 1  (outlet1=PETROL / outlet2=SPEED_PETROL)
    -- operators: Night=Raju(4)  Morning=Nikhil(7)  Afternoon=Babu(10)
    -- =========================================================================

    -- ── Night shift  23:05 → next-day 08:55 ──────────────────────────────────
    v_q1 := 180 + (v_d * 7) % 60;            -- PETROL  litres
    v_q2 :=  50 + (v_d * 5) % 30;            -- SPEED_PETROL litres
    v_tot  := ROUND(v_q1 * 103.2 + v_q2 * 113.3, 2);
    v_cash := ROUND(v_tot * 0.55, 2);
    v_upi  := ROUND(v_tot * 0.30, 2);
    v_card := ROUND(v_tot * 0.10, 2);
    v_cred := v_tot - v_cash - v_upi - v_card;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, discrepancy_amount, discrepancy_type,
      discrepancy_resolution, discrepancy_resolved_by_id, discrepancy_resolved_at,
      status, is_overdue_flag, created_at, updated_at)
    VALUES (
      1, 1, 4, 9, 9,
      v_p1_night, 'Night', TRUE, v_day,
      (v_day || ' 23:05:00+05:30')::TIMESTAMPTZ,
      (v_day + 1    || ' 08:55:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0,
      v_cred, v_tot,
      CASE WHEN v_disc THEN 75 ELSE NULL END,
      CASE WHEN v_disc THEN 'SHORT'::discrepancy_type ELSE NULL END,
      CASE WHEN v_disc THEN 'WAIVED'::discrepancy_resolution ELSE NULL END,
      CASE WHEN v_disc THEN 9 ELSE NULL END,
      CASE WHEN v_disc THEN (v_day + 1 || ' 10:00:00+05:30')::TIMESTAMPTZ ELSE NULL END,
      CASE WHEN v_disc THEN 'CLOSED_DISCREPANCY_RESOLVED'::shift_status ELSE 'CLOSED_BALANCED'::shift_status END,
      FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 1, 'PETROL'::fuel_type,       1, v_o1,  v_o1  + v_q1, v_q1, 103.2),
      (v_s, 2, 'SPEED_PETROL'::fuel_type, 3, v_o2,  v_o2  + v_q2, v_q2, 113.3);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 1, 1, 'PETROL'::fuel_type, ROUND(v_q1*0.6,3), 103.2, ROUND(v_q1*0.6*103.2,2), 'CASH'::transaction_payment_mode,  4, (v_day || ' 23:40:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 1, 'PETROL'::fuel_type, ROUND(v_q1*0.4,3), 103.2, ROUND(v_q1*0.4*103.2,2), 'UPI'::transaction_payment_mode,   4, (v_day + 1 || ' 04:15:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 2, 'SPEED_PETROL'::fuel_type, v_q2,         113.3, ROUND(v_q2*113.3,2),      'CASH'::transaction_payment_mode, 4, (v_day + 1 || ' 06:30:00+05:30')::TIMESTAMPTZ);

    -- credit entry on night shift (linked to VJ Transport = client 8)
    IF v_d % 3 = 1 THEN
      INSERT INTO shift_credit_entries (shift_id, client_id, client_name, bill_no, amount, fuel_type, vehicle_registration, void_status, created_at)
      VALUES (v_s, 8, 'VJ Transport', 'VJT-' || LPAD(v_d::TEXT,4,'0'), v_cred, 'PETROL', 'MH12AB' || (1000+v_d)::TEXT, 'ACTIVE', NOW());
    END IF;

    v_o1 := v_o1 + v_q1;
    v_o2 := v_o2 + v_q2;

    -- ── Morning shift  09:05 → 15:55 ─────────────────────────────────────────
    v_q1 := 320 + (v_d * 7) % 80;
    v_q2 :=  90 + (v_d * 5) % 40;
    v_tot  := ROUND(v_q1 * 103.2 + v_q2 * 113.3, 2);
    v_cash := ROUND(v_tot * 0.50, 2);
    v_upi  := ROUND(v_tot * 0.33, 2);
    v_card := ROUND(v_tot * 0.08, 2);
    v_cred := v_tot - v_cash - v_upi - v_card;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      1, 1, 7, 9, 9,
      v_p1_morning, 'Morning', FALSE, v_day,
      (v_day || ' 09:05:00+05:30')::TIMESTAMPTZ, (v_day || ' 15:55:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 1, 'PETROL'::fuel_type,       1, v_o1, v_o1+v_q1, v_q1, 103.2),
      (v_s, 2, 'SPEED_PETROL'::fuel_type, 3, v_o2, v_o2+v_q2, v_q2, 113.3);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 1, 1, 'PETROL'::fuel_type, ROUND(v_q1*0.55,3), 103.2, ROUND(v_q1*0.55*103.2,2), 'CASH'::transaction_payment_mode, 7, (v_day || ' 10:20:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 1, 'PETROL'::fuel_type, ROUND(v_q1*0.45,3), 103.2, ROUND(v_q1*0.45*103.2,2), 'UPI'::transaction_payment_mode,  7, (v_day || ' 13:45:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 2, 'SPEED_PETROL'::fuel_type, v_q2,          113.3, ROUND(v_q2*113.3,2),       'UPI'::transaction_payment_mode,  7, (v_day || ' 12:00:00+05:30')::TIMESTAMPTZ);

    -- credit entry on morning shift (Ambulance = client 2, child of Gov Hospital)
    IF v_d % 5 = 2 THEN
      INSERT INTO shift_credit_entries (shift_id, client_id, client_name, bill_no, amount, fuel_type, vehicle_registration, void_status, created_at)
      VALUES (v_s, 2, 'Ambulance', 'AMB-' || LPAD(v_d::TEXT,4,'0'), v_cred, 'PETROL', 'MH12GH' || (2000+v_d)::TEXT, 'ACTIVE', NOW());
    END IF;

    v_o1 := v_o1 + v_q1;
    v_o2 := v_o2 + v_q2;

    -- ── Afternoon shift  16:05 → 22:55 ───────────────────────────────────────
    v_q1 := 300 + (v_d * 7) % 70;
    v_q2 :=  80 + (v_d * 5) % 35;
    v_tot  := ROUND(v_q1 * 103.2 + v_q2 * 113.3, 2);
    v_cash := ROUND(v_tot * 0.52, 2);
    v_upi  := ROUND(v_tot * 0.32, 2);
    v_card := ROUND(v_tot * 0.09, 2);
    v_cred := v_tot - v_cash - v_upi - v_card;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      1, 1, 10, 9, 9,
      v_p1_afternoon, 'Afternoon', FALSE, v_day,
      (v_day || ' 16:05:00+05:30')::TIMESTAMPTZ, (v_day || ' 22:55:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 1, 'PETROL'::fuel_type,       1, v_o1, v_o1+v_q1, v_q1, 103.2),
      (v_s, 2, 'SPEED_PETROL'::fuel_type, 3, v_o2, v_o2+v_q2, v_q2, 113.3);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 1, 1, 'PETROL'::fuel_type, ROUND(v_q1*0.6,3), 103.2, ROUND(v_q1*0.6*103.2,2), 'CASH'::transaction_payment_mode, 10, (v_day || ' 17:30:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 1, 'PETROL'::fuel_type, ROUND(v_q1*0.4,3), 103.2, ROUND(v_q1*0.4*103.2,2), 'UPI'::transaction_payment_mode,  10, (v_day || ' 20:10:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 2, 'SPEED_PETROL'::fuel_type, v_q2,         113.3, ROUND(v_q2*113.3,2),      'CASH'::transaction_payment_mode, 10, (v_day || ' 19:00:00+05:30')::TIMESTAMPTZ);

    -- Police Station credit on afternoon
    IF v_d % 7 = 4 THEN
      INSERT INTO shift_credit_entries (shift_id, client_id, client_name, bill_no, amount, fuel_type, vehicle_registration, void_status, created_at)
      VALUES (v_s, 5, 'Police Station', 'PS-' || LPAD(v_d::TEXT,4,'0'), v_cred, 'PETROL', 'MH12PS' || (3000+v_d)::TEXT, 'ACTIVE', NOW());
    END IF;

    v_o1 := v_o1 + v_q1;
    v_o2 := v_o2 + v_q2;

    -- =========================================================================
    -- PUMP 1  ·  NOZZLE 2  (outlet3=PETROL / outlet4=DIESEL)
    -- operators: Night=Mahesh(6)  Morning=Nilesh(8)  Afternoon=Anil(11)
    -- =========================================================================

    -- Night
    v_q1 := 250 + (v_d * 7) % 80;   -- PETROL
    v_q2 := 300 + (v_d * 11) % 100; -- DIESEL
    v_tot  := ROUND(v_q1 * 103.2 + v_q2 * 94.1, 2);
    v_cash := ROUND(v_tot * 0.55, 2);
    v_upi  := ROUND(v_tot * 0.30, 2);
    v_card := 0;
    v_cred := v_tot - v_cash - v_upi;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      1, 2, 6, 9, 9,
      v_p1_night, 'Night', TRUE, v_day,
      (v_day || ' 23:06:00+05:30')::TIMESTAMPTZ, (v_day+1 || ' 08:54:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 3, 'PETROL'::fuel_type, 2, v_o3, v_o3+v_q1, v_q1, 103.2),
      (v_s, 4, 'DIESEL'::fuel_type, 4, v_o4, v_o4+v_q2, v_q2,  94.1);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 1, 3, 'PETROL'::fuel_type, v_q1,                  103.2, ROUND(v_q1*103.2,2),       'CASH'::transaction_payment_mode, 6, (v_day    || ' 02:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 4, 'DIESEL'::fuel_type, ROUND(v_q2*0.7,3),      94.1, ROUND(v_q2*0.7*94.1,2),  'CASH'::transaction_payment_mode, 6, (v_day    || ' 04:30:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 4, 'DIESEL'::fuel_type, ROUND(v_q2*0.3,3),      94.1, ROUND(v_q2*0.3*94.1,2),  'UPI'::transaction_payment_mode,  6, (v_day+1  || ' 07:00:00+05:30')::TIMESTAMPTZ);

    -- Sanju Contractor diesel credit
    IF v_d % 4 = 0 THEN
      INSERT INTO shift_credit_entries (shift_id, client_id, client_name, bill_no, amount, fuel_type, void_status, created_at)
      VALUES (v_s, 9, 'Sanju Contractor', 'SC-' || LPAD(v_d::TEXT,4,'0'), v_cred, 'DIESEL', 'ACTIVE', NOW());
    END IF;

    v_o3 := v_o3 + v_q1;
    v_o4 := v_o4 + v_q2;

    -- Morning
    v_q1 := 400 + (v_d * 7) % 100;
    v_q2 := 480 + (v_d * 11) % 120;
    v_tot  := ROUND(v_q1 * 103.2 + v_q2 * 94.1, 2);
    v_cash := ROUND(v_tot * 0.50, 2);
    v_upi  := ROUND(v_tot * 0.35, 2);
    v_card := ROUND(v_tot * 0.05, 2);
    v_cred := v_tot - v_cash - v_upi - v_card;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      1, 2, 8, 9, 9,
      v_p1_morning, 'Morning', FALSE, v_day,
      (v_day || ' 09:06:00+05:30')::TIMESTAMPTZ, (v_day || ' 15:54:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 3, 'PETROL'::fuel_type, 2, v_o3, v_o3+v_q1, v_q1, 103.2),
      (v_s, 4, 'DIESEL'::fuel_type, 4, v_o4, v_o4+v_q2, v_q2,  94.1);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 1, 3, 'PETROL'::fuel_type, ROUND(v_q1*0.6,3), 103.2, ROUND(v_q1*0.6*103.2,2), 'CASH'::transaction_payment_mode, 8, (v_day || ' 10:30:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 3, 'PETROL'::fuel_type, ROUND(v_q1*0.4,3), 103.2, ROUND(v_q1*0.4*103.2,2), 'UPI'::transaction_payment_mode,  8, (v_day || ' 14:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 4, 'DIESEL'::fuel_type, v_q2,               94.1, ROUND(v_q2*94.1,2),        'CASH'::transaction_payment_mode, 8, (v_day || ' 11:15:00+05:30')::TIMESTAMPTZ);

    v_o3 := v_o3 + v_q1;
    v_o4 := v_o4 + v_q2;

    -- Afternoon
    v_q1 := 380 + (v_d * 7) % 90;
    v_q2 := 460 + (v_d * 11) % 110;
    v_tot  := ROUND(v_q1 * 103.2 + v_q2 * 94.1, 2);
    v_cash := ROUND(v_tot * 0.52, 2);
    v_upi  := ROUND(v_tot * 0.33, 2);
    v_card := ROUND(v_tot * 0.07, 2);
    v_cred := v_tot - v_cash - v_upi - v_card;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      1, 2, 11, 9, 9,
      v_p1_afternoon, 'Afternoon', FALSE, v_day,
      (v_day || ' 16:06:00+05:30')::TIMESTAMPTZ, (v_day || ' 22:54:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 3, 'PETROL'::fuel_type, 2, v_o3, v_o3+v_q1, v_q1, 103.2),
      (v_s, 4, 'DIESEL'::fuel_type, 4, v_o4, v_o4+v_q2, v_q2,  94.1);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 1, 3, 'PETROL'::fuel_type, v_q1,               103.2, ROUND(v_q1*103.2,2),       'CASH'::transaction_payment_mode, 11, (v_day || ' 18:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 4, 'DIESEL'::fuel_type, ROUND(v_q2*0.65,3),  94.1, ROUND(v_q2*0.65*94.1,2), 'CASH'::transaction_payment_mode, 11, (v_day || ' 17:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 1, 4, 'DIESEL'::fuel_type, ROUND(v_q2*0.35,3),  94.1, ROUND(v_q2*0.35*94.1,2), 'UPI'::transaction_payment_mode,  11, (v_day || ' 21:30:00+05:30')::TIMESTAMPTZ);

    v_o3 := v_o3 + v_q1;
    v_o4 := v_o4 + v_q2;

    -- =========================================================================
    -- PUMP 2  ·  NOZZLE 5  (outlet9=PETROL / outlet10=SPEED_PETROL)
    -- operators: Night=Sanjay(12)  Morning=Rahul(14)  Afternoon=Shyam(13)
    -- =========================================================================

    -- Night
    v_q1 := 240 + (v_d * 7) % 70;
    v_q2 :=  70 + (v_d * 5) % 35;
    v_tot  := ROUND(v_q1 * 104.2 + v_q2 * 114.2, 2);
    v_cash := ROUND(v_tot * 0.58, 2);
    v_upi  := ROUND(v_tot * 0.30, 2);
    v_card := 0;
    v_cred := v_tot - v_cash - v_upi;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      2, 5, 12, 15, 15,
      v_p2_night, 'Night', TRUE, v_day,
      (v_day    || ' 23:07:00+05:30')::TIMESTAMPTZ,
      (v_day+1  || ' 08:53:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s,  9, 'PETROL'::fuel_type,       7, v_o9,  v_o9 +v_q1, v_q1, 104.2),
      (v_s, 10, 'SPEED_PETROL'::fuel_type, 8, v_o10, v_o10+v_q2, v_q2, 114.2);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 2,  9, 'PETROL'::fuel_type,       v_q1, 104.2, ROUND(v_q1*104.2,2), 'CASH'::transaction_payment_mode, 12, (v_day || ' 03:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 10, 'SPEED_PETROL'::fuel_type, v_q2, 114.2, ROUND(v_q2*114.2,2), 'UPI'::transaction_payment_mode,  12, (v_day+1 || ' 06:00:00+05:30')::TIMESTAMPTZ);

    -- Police credit (pump2 client 13)
    IF v_d % 5 = 0 THEN
      INSERT INTO shift_credit_entries (shift_id, client_id, client_name, bill_no, amount, fuel_type, void_status, created_at)
      VALUES (v_s, 13, 'Police', 'PC2-' || LPAD(v_d::TEXT,4,'0'), v_cred, 'PETROL', 'ACTIVE', NOW());
    END IF;

    v_o9  := v_o9  + v_q1;
    v_o10 := v_o10 + v_q2;

    -- Morning
    v_q1 := 420 + (v_d * 7) % 90;
    v_q2 := 120 + (v_d * 5) % 50;
    v_tot  := ROUND(v_q1 * 104.2 + v_q2 * 114.2, 2);
    v_cash := ROUND(v_tot * 0.50, 2);
    v_upi  := ROUND(v_tot * 0.35, 2);
    v_card := ROUND(v_tot * 0.10, 2);
    v_cred := v_tot - v_cash - v_upi - v_card;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      2, 5, 14, 15, 15,
      v_p2_morning, 'Morning', FALSE, v_day,
      (v_day || ' 09:07:00+05:30')::TIMESTAMPTZ, (v_day || ' 15:53:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s,  9, 'PETROL'::fuel_type,       7, v_o9,  v_o9 +v_q1, v_q1, 104.2),
      (v_s, 10, 'SPEED_PETROL'::fuel_type, 8, v_o10, v_o10+v_q2, v_q2, 114.2);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 2,  9, 'PETROL'::fuel_type,       ROUND(v_q1*0.6,3), 104.2, ROUND(v_q1*0.6*104.2,2), 'CASH'::transaction_payment_mode, 14, (v_day || ' 10:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 2,  9, 'PETROL'::fuel_type,       ROUND(v_q1*0.4,3), 104.2, ROUND(v_q1*0.4*104.2,2), 'UPI'::transaction_payment_mode,  14, (v_day || ' 13:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 10, 'SPEED_PETROL'::fuel_type, v_q2,               114.2, ROUND(v_q2*114.2,2),       'CARD'::transaction_payment_mode, 14, (v_day || ' 11:30:00+05:30')::TIMESTAMPTZ);

    v_o9  := v_o9  + v_q1;
    v_o10 := v_o10 + v_q2;

    -- Afternoon
    v_q1 := 400 + (v_d * 7) % 80;
    v_q2 := 110 + (v_d * 5) % 45;
    v_tot  := ROUND(v_q1 * 104.2 + v_q2 * 114.2, 2);
    v_cash := ROUND(v_tot * 0.55, 2);
    v_upi  := ROUND(v_tot * 0.35, 2);
    v_card := 0;
    v_cred := v_tot - v_cash - v_upi;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      2, 5, 13, 15, 15,
      v_p2_afternoon, 'Afternoon', FALSE, v_day,
      (v_day || ' 16:07:00+05:30')::TIMESTAMPTZ, (v_day || ' 22:53:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s,  9, 'PETROL'::fuel_type,       7, v_o9,  v_o9 +v_q1, v_q1, 104.2),
      (v_s, 10, 'SPEED_PETROL'::fuel_type, 8, v_o10, v_o10+v_q2, v_q2, 114.2);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 2,  9, 'PETROL'::fuel_type,       v_q1, 104.2, ROUND(v_q1*104.2,2), 'CASH'::transaction_payment_mode, 13, (v_day || ' 19:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 10, 'SPEED_PETROL'::fuel_type, v_q2, 114.2, ROUND(v_q2*114.2,2), 'UPI'::transaction_payment_mode,  13, (v_day || ' 20:30:00+05:30')::TIMESTAMPTZ);

    v_o9  := v_o9  + v_q1;
    v_o10 := v_o10 + v_q2;

    -- =========================================================================
    -- PUMP 2  ·  NOZZLE 6  (outlet11=PETROL / outlet12=DIESEL)
    -- operators: Night=Shyam(13)  Morning=Sanjay(12)  Afternoon=Rahul(14)
    -- =========================================================================

    -- Night
    v_q1 := 220 + (v_d * 7) % 70;
    v_q2 := 280 + (v_d * 11) % 90;
    v_tot  := ROUND(v_q1 * 104.2 + v_q2 * 92.23, 2);
    v_cash := ROUND(v_tot * 0.60, 2);
    v_upi  := ROUND(v_tot * 0.30, 2);
    v_card := 0;
    v_cred := v_tot - v_cash - v_upi;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      2, 6, 13, 15, 15,
      v_p2_night, 'Night', TRUE, v_day,
      (v_day    || ' 23:08:00+05:30')::TIMESTAMPTZ,
      (v_day+1  || ' 08:52:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 11, 'PETROL'::fuel_type, 7, v_o11, v_o11+v_q1, v_q1, 104.2),
      (v_s, 12, 'DIESEL'::fuel_type, 9, v_o12, v_o12+v_q2, v_q2,  92.23);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 2, 11, 'PETROL'::fuel_type, v_q1,              104.2, ROUND(v_q1*104.2,2),      'CASH'::transaction_payment_mode, 13, (v_day   || ' 01:30:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 12, 'DIESEL'::fuel_type, ROUND(v_q2*0.6,3),  92.23, ROUND(v_q2*0.6*92.23,2), 'CASH'::transaction_payment_mode, 13, (v_day   || ' 03:45:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 12, 'DIESEL'::fuel_type, ROUND(v_q2*0.4,3),  92.23, ROUND(v_q2*0.4*92.23,2), 'UPI'::transaction_payment_mode,  13, (v_day+1 || ' 07:30:00+05:30')::TIMESTAMPTZ);

    -- Hospital diesel credit (pump2 client 14)
    IF v_d % 4 = 2 THEN
      INSERT INTO shift_credit_entries (shift_id, client_id, client_name, bill_no, amount, fuel_type, void_status, created_at)
      VALUES (v_s, 14, 'Hospital', 'HOS2-' || LPAD(v_d::TEXT,4,'0'), v_cred, 'DIESEL', 'ACTIVE', NOW());
    END IF;

    v_o11 := v_o11 + v_q1;
    v_o12 := v_o12 + v_q2;

    -- Morning
    v_q1 := 380 + (v_d * 7) % 90;
    v_q2 := 450 + (v_d * 11) % 110;
    v_tot  := ROUND(v_q1 * 104.2 + v_q2 * 92.23, 2);
    v_cash := ROUND(v_tot * 0.50, 2);
    v_upi  := ROUND(v_tot * 0.35, 2);
    v_card := ROUND(v_tot * 0.08, 2);
    v_cred := v_tot - v_cash - v_upi - v_card;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      2, 6, 12, 15, 15,
      v_p2_morning, 'Morning', FALSE, v_day,
      (v_day || ' 09:08:00+05:30')::TIMESTAMPTZ, (v_day || ' 15:52:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 11, 'PETROL'::fuel_type, 7, v_o11, v_o11+v_q1, v_q1, 104.2),
      (v_s, 12, 'DIESEL'::fuel_type, 9, v_o12, v_o12+v_q2, v_q2,  92.23);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 2, 11, 'PETROL'::fuel_type, v_q1,               104.2, ROUND(v_q1*104.2,2),       'CASH'::transaction_payment_mode, 12, (v_day || ' 11:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 12, 'DIESEL'::fuel_type, ROUND(v_q2*0.55,3),  92.23, ROUND(v_q2*0.55*92.23,2), 'CASH'::transaction_payment_mode, 12, (v_day || ' 12:00:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 12, 'DIESEL'::fuel_type, ROUND(v_q2*0.45,3),  92.23, ROUND(v_q2*0.45*92.23,2), 'UPI'::transaction_payment_mode,  12, (v_day || ' 14:30:00+05:30')::TIMESTAMPTZ);

    v_o11 := v_o11 + v_q1;
    v_o12 := v_o12 + v_q2;

    -- Afternoon
    v_q1 := 360 + (v_d * 7) % 80;
    v_q2 := 430 + (v_d * 11) % 100;
    v_tot  := ROUND(v_q1 * 104.2 + v_q2 * 92.23, 2);
    v_cash := ROUND(v_tot * 0.55, 2);
    v_upi  := ROUND(v_tot * 0.35, 2);
    v_card := 0;
    v_cred := v_tot - v_cash - v_upi;

    INSERT INTO shifts (pump_id, nozzle_id, operator_id, opened_by_user_id, closed_by_user_id,
      shift_definition_id, shift_name, is_night_shift, shift_date,
      actual_start_time, actual_end_time,
      cash_collected, upi_collected, card_collected, fleet_card_collected,
      credit_total, total_amount_due, status, is_overdue_flag, created_at, updated_at)
    VALUES (
      2, 6, 14, 15, 15,
      v_p2_afternoon, 'Afternoon', FALSE, v_day,
      (v_day || ' 16:08:00+05:30')::TIMESTAMPTZ, (v_day || ' 22:52:00+05:30')::TIMESTAMPTZ,
      v_cash, v_upi, v_card, 0, v_cred, v_tot,
      'CLOSED_BALANCED'::shift_status, FALSE, NOW(), NOW()
    ) RETURNING id INTO v_s;

    INSERT INTO shift_fuel_readings (shift_id, outlet_id, fuel_type, tank_id, start_reading, end_reading, units_sold, price_snapshot)
    VALUES
      (v_s, 11, 'PETROL'::fuel_type, 7, v_o11, v_o11+v_q1, v_q1, 104.2),
      (v_s, 12, 'DIESEL'::fuel_type, 9, v_o12, v_o12+v_q2, v_q2,  92.23);

    INSERT INTO fuel_transactions (shift_id, pump_id, nozzle_outlet_id, fuel_type, quantity_litres, price_per_unit, total_amount, payment_mode, recorded_by_user_id, recorded_at)
    VALUES
      (v_s, 2, 11, 'PETROL'::fuel_type, v_q1,               104.2, ROUND(v_q1*104.2,2),       'CASH'::transaction_payment_mode, 14, (v_day || ' 17:45:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 12, 'DIESEL'::fuel_type, ROUND(v_q2*0.5,3),   92.23, ROUND(v_q2*0.5*92.23,2),  'CASH'::transaction_payment_mode, 14, (v_day || ' 18:30:00+05:30')::TIMESTAMPTZ),
      (v_s, 2, 12, 'DIESEL'::fuel_type, ROUND(v_q2*0.5,3),   92.23, ROUND(v_q2*0.5*92.23,2),  'UPI'::transaction_payment_mode,  14, (v_day || ' 21:00:00+05:30')::TIMESTAMPTZ);

    v_o11 := v_o11 + v_q1;
    v_o12 := v_o12 + v_q2;

    -- =========================================================================
    -- CASH EVENTS  (daily per pump: opening + closing balance)
    -- =========================================================================
    INSERT INTO cash_events (pump_id, event_type, amount, description, event_date, recorded_by_user_id, created_at)
    VALUES
      (1, 'OPENING_BALANCE'::cash_event_type, 8000 + (v_d * 500) % 4000,
         'Opening cash balance', v_day, 9, NOW()),
      (1, 'CLOSING_BALANCE'::cash_event_type, 6000 + (v_d * 700) % 5000,
         'Closing cash balance', v_day, 9, NOW()),
      (2, 'OPENING_BALANCE'::cash_event_type, 7000 + (v_d * 600) % 3500,
         'Opening cash balance', v_day, 15, NOW()),
      (2, 'CLOSING_BALANCE'::cash_event_type, 5500 + (v_d * 650) % 4500,
         'Closing cash balance', v_day, 15, NOW());

    -- cash in on some days (e.g. petty cash replenishment)
    IF v_d % 3 = 1 THEN
      INSERT INTO cash_events (pump_id, event_type, amount, description, event_date, recorded_by_user_id, created_at)
      VALUES
        (1, 'CASH_IN'::cash_event_type,  2000, 'Petty cash top-up', v_day, 9,  NOW()),
        (2, 'CASH_IN'::cash_event_type,  1500, 'Petty cash top-up', v_day, 15, NOW());
    END IF;

    -- cash out on some days (e.g. vendor payment)
    IF v_d % 5 = 4 THEN
      INSERT INTO cash_events (pump_id, event_type, amount, description, event_date, recorded_by_user_id, created_at)
      VALUES
        (1, 'CASH_OUT'::cash_event_type, 1200, 'Vendor payment – cleaning supplies', v_day, 9,  NOW()),
        (2, 'CASH_OUT'::cash_event_type, 800,  'Miscellaneous expense',              v_day, 15, NOW());
    END IF;

    -- =========================================================================
    -- DIP CHECKS  (every 2 days, one tank per pump)
    -- Tank 1 (P1 PETROL) and tank 7 (P2 PETROL) checked on even days
    -- Tank 4 (P1 DIESEL) and tank 9 (P2 DIESEL) checked on odd days
    -- =========================================================================
    IF v_d % 2 = 0 THEN
      INSERT INTO dip_checks (pump_id, tank_id, measured_quantity, system_stock, notes,
        checked_at, logged_by_user_id, checked_by_user_id, status, created_at)
      VALUES
        (1, 1, 30000 - (v_d * 800), 30000 - (v_d * 800) + 5,
         'Routine morning dip', (v_day || ' 09:01:00+05:30')::TIMESTAMPTZ, 9, 7, 'WITHIN_TOLERANCE', NOW()),
        (2, 7, 25000 - (v_d * 700), 25000 - (v_d * 700) + 4,
         'Routine morning dip', (v_day || ' 09:02:00+05:30')::TIMESTAMPTZ, 15, 14, 'WITHIN_TOLERANCE', NOW());
    ELSE
      INSERT INTO dip_checks (pump_id, tank_id, measured_quantity, system_stock, notes,
        checked_at, logged_by_user_id, checked_by_user_id, status, created_at)
      VALUES
        (1, 4, 18000 - (v_d * 700), 18000 - (v_d * 700) + CASE WHEN v_d = 9 THEN 35 ELSE 3 END,
         CASE WHEN v_d = 9 THEN 'Variance noted — pump seal check done' ELSE 'Routine dip' END,
         (v_day || ' 09:03:00+05:30')::TIMESTAMPTZ, 9, 8,
         CASE WHEN v_d = 9 THEN 'REVIEWED' ELSE 'WITHIN_TOLERANCE' END, NOW()),
        (2, 9, 20000 - (v_d * 650), 20000 - (v_d * 650) + CASE WHEN v_d = 11 THEN 28 ELSE 6 END,
         CASE WHEN v_d = 11 THEN 'Slight variance — under observation' ELSE NULL END,
         (v_day || ' 09:04:00+05:30')::TIMESTAMPTZ, 15, 12,
         CASE WHEN v_d = 11 THEN 'PENDING_REVIEW' ELSE 'WITHIN_TOLERANCE' END, NOW());
    END IF;

    -- =========================================================================
    -- EXPENSES  (every 3 days alternating categories)
    -- =========================================================================
    IF v_d % 3 = 0 THEN
      INSERT INTO pump_expenses (pump_id, category, amount, description, expense_date,
        recorded_by_user_id, approval_status, approved_by_user_id, approved_at, created_at)
      VALUES (
        1,
        CASE v_d % 18
          WHEN 0  THEN 'MAINTENANCE'::expense_category
          WHEN 3  THEN 'UTILITIES'::expense_category
          WHEN 6  THEN 'SALARY'::expense_category
          WHEN 9  THEN 'EQUIPMENT'::expense_category
          WHEN 12 THEN 'FUEL'::expense_category
          ELSE         'OTHER'::expense_category
        END,
        CASE v_d % 18
          WHEN 0  THEN 2500
          WHEN 3  THEN 8200
          WHEN 6  THEN 25000
          WHEN 9  THEN 4800
          WHEN 12 THEN 1200
          ELSE         950
        END,
        CASE v_d % 18
          WHEN 0  THEN 'Pump motor service and oil change'
          WHEN 3  THEN 'Electricity bill payment'
          WHEN 6  THEN 'Staff salary advance – Raju'
          WHEN 9  THEN 'New pressure gauge set'
          WHEN 12 THEN 'Generator diesel – 12 litres'
          ELSE         'Office stationery and sundries'
        END,
        v_day, 9, 'APPROVED'::expense_approval_status, 3,
        (v_day || ' 14:00:00+05:30')::TIMESTAMPTZ, NOW()
      );
      INSERT INTO pump_expenses (pump_id, category, amount, description, expense_date,
        recorded_by_user_id, approval_status, approved_by_user_id, approved_at, created_at)
      VALUES (
        2,
        CASE v_d % 12
          WHEN 0  THEN 'MAINTENANCE'::expense_category
          WHEN 3  THEN 'UTILITIES'::expense_category
          WHEN 6  THEN 'SALARY'::expense_category
          ELSE         'OTHER'::expense_category
        END,
        CASE v_d % 12
          WHEN 0  THEN 1800
          WHEN 3  THEN 7500
          WHEN 6  THEN 20000
          ELSE         750
        END,
        CASE v_d % 12
          WHEN 0  THEN 'Nozzle seal replacement'
          WHEN 3  THEN 'Electricity and water bill'
          WHEN 6  THEN 'Staff monthly advance'
          ELSE         'Cleaning supplies'
        END,
        v_day, 15, 'APPROVED'::expense_approval_status, 3,
        (v_day || ' 14:30:00+05:30')::TIMESTAMPTZ, NOW()
      );
    END IF;

    -- Add one PENDING_APPROVAL expense on day 7 for both pumps
    IF v_d = 7 THEN
      INSERT INTO pump_expenses (pump_id, category, amount, description, expense_date,
        recorded_by_user_id, approval_status, created_at)
      VALUES
        (1, 'EQUIPMENT'::expense_category, 12500, 'CCTV camera replacement – canopy', v_day, 9,  'PENDING_APPROVAL'::expense_approval_status, NOW()),
        (2, 'MAINTENANCE'::expense_category, 8900, 'Compressor overhaul – quote attached', v_day, 12, 'PENDING_APPROVAL'::expense_approval_status, NOW());
    END IF;

    -- =========================================================================
    -- TANKER DELIVERIES  (every 5 days for different fuel types)
    -- =========================================================================
    IF v_d % 5 = 0 THEN
      -- Pump 1: PETROL delivery to tank 1
      INSERT INTO tanker_deliveries (pump_id, tank_id, fuel_type, quantity_delivered,
        cost_price_per_unit, delivery_date, invoice_reference, logged_by_user_id, created_at)
      VALUES (1, 1, 'PETROL'::fuel_type, 10000.000, 98.50,
        (v_day || ' 08:00:00+05:30')::TIMESTAMPTZ,
        'INV-P1-' || TO_CHAR(v_day, 'YYYYMMDD'), 9, NOW());

      -- Pump 2: PETROL delivery to tank 7
      INSERT INTO tanker_deliveries (pump_id, tank_id, fuel_type, quantity_delivered,
        cost_price_per_unit, delivery_date, invoice_reference, logged_by_user_id, created_at)
      VALUES (2, 7, 'PETROL'::fuel_type, 8000.000, 99.20,
        (v_day || ' 08:30:00+05:30')::TIMESTAMPTZ,
        'INV-P2-' || TO_CHAR(v_day, 'YYYYMMDD'), 15, NOW());
    END IF;

    IF v_d % 5 = 2 THEN
      -- Pump 1: DIESEL delivery to tank 4
      INSERT INTO tanker_deliveries (pump_id, tank_id, fuel_type, quantity_delivered,
        cost_price_per_unit, delivery_date, invoice_reference, logged_by_user_id, created_at)
      VALUES (1, 4, 'DIESEL'::fuel_type, 12000.000, 88.40,
        (v_day || ' 07:45:00+05:30')::TIMESTAMPTZ,
        'INV-P1D-' || TO_CHAR(v_day, 'YYYYMMDD'), 9, NOW());

      -- Pump 2: DIESEL delivery to tank 9
      INSERT INTO tanker_deliveries (pump_id, tank_id, fuel_type, quantity_delivered,
        cost_price_per_unit, delivery_date, invoice_reference, logged_by_user_id, created_at)
      VALUES (2, 9, 'DIESEL'::fuel_type, 10000.000, 87.80,
        (v_day || ' 08:15:00+05:30')::TIMESTAMPTZ,
        'INV-P2D-' || TO_CHAR(v_day, 'YYYYMMDD'), 15, NOW());
    END IF;

    -- =========================================================================
    -- ANCILLARY SALES  (daily: 1-2 products per pump)
    -- =========================================================================
    -- Pump 1: sell Oil products (product ids 1, 2, 3)
    INSERT INTO ancillary_sales (pump_id, product_id, quantity_units, selling_price_per_unit,
      total_amount, gst_amount, total_with_gst, payment_mode, sold_by_user_id, sale_date, created_at)
    VALUES (
      1, 1 + (v_d % 3),       -- rotate through products 1,2,3
      1 + (v_d % 3),          -- qty: 1-3 units
      CASE (v_d % 3)
        WHEN 0 THEN 450.00
        WHEN 1 THEN 200.00
        ELSE        280.00
      END,
      (1 + (v_d % 3)) * CASE (v_d % 3) WHEN 0 THEN 450.00 WHEN 1 THEN 200.00 ELSE 280.00 END,
      ROUND((1 + (v_d % 3)) * CASE (v_d % 3) WHEN 0 THEN 450.00 WHEN 1 THEN 200.00 ELSE 280.00 END * 0.18, 2),
      ROUND((1 + (v_d % 3)) * CASE (v_d % 3) WHEN 0 THEN 450.00 WHEN 1 THEN 200.00 ELSE 280.00 END * 1.18, 2),
      CASE (v_d % 2) WHEN 0 THEN 'CASH'::transaction_payment_mode ELSE 'UPI'::transaction_payment_mode END,
      9, v_day, NOW()
    );

    -- Pump 2: sell ancillary products (v_p2_prod1/2/3, skip if NULL)
    IF v_p2_prod1 IS NOT NULL THEN
      INSERT INTO ancillary_sales (pump_id, product_id, quantity_units, selling_price_per_unit,
        total_amount, gst_amount, total_with_gst, payment_mode, sold_by_user_id, sale_date, created_at)
      VALUES (
        2,
        CASE (v_d % 3) WHEN 0 THEN v_p2_prod1 WHEN 1 THEN v_p2_prod2 ELSE v_p2_prod3 END,
        1 + (v_d % 2),
        CASE (v_d % 3) WHEN 0 THEN 320.00 WHEN 1 THEN 180.00 ELSE 80.00 END,
        (1 + (v_d % 2)) * CASE (v_d % 3) WHEN 0 THEN 320.00 WHEN 1 THEN 180.00 ELSE 80.00 END,
        ROUND((1 + (v_d % 2)) * CASE (v_d % 3) WHEN 0 THEN 320.00 WHEN 1 THEN 180.00 ELSE 80.00 END * 0.18, 2),
        ROUND((1 + (v_d % 2)) * CASE (v_d % 3) WHEN 0 THEN 320.00 WHEN 1 THEN 180.00 ELSE 80.00 END * 1.18, 2),
        CASE (v_d % 2) WHEN 0 THEN 'CASH'::transaction_payment_mode ELSE 'UPI'::transaction_payment_mode END,
        15, v_day, NOW()
      );
    END IF;

  END LOOP;   -- ── end main day loop ──────────────────────────────────────────

  -- ===========================================================================
  -- 5. ANCILLARY STOCK DELIVERIES  (once a week for each pump)
  -- ===========================================================================
  INSERT INTO ancillary_stock_deliveries (product_id, pump_id, quantity_units, cost_price_per_unit,
    delivery_date, invoice_reference, logged_by_user_id, created_at)
  VALUES
    (1, 1, 20, 350.00, '2026-03-22', 'STK-P1-001', 9, NOW()),
    (2, 1, 30, 150.00, '2026-03-22', 'STK-P1-002', 9, NOW()),
    (1, 1, 20, 350.00, '2026-03-29', 'STK-P1-003', 9, NOW()),
    (3, 1, 15, 220.00, '2026-04-01', 'STK-P1-004', 9, NOW());

  IF v_p2_prod1 IS NOT NULL THEN
    INSERT INTO ancillary_stock_deliveries (product_id, pump_id, quantity_units, cost_price_per_unit,
      delivery_date, invoice_reference, logged_by_user_id, created_at)
    VALUES
      (v_p2_prod1, 2, 40, 250.00, '2026-03-23', 'STK-P2-001', 15, NOW()),
      (v_p2_prod2, 2, 25, 130.00, '2026-03-23', 'STK-P2-002', 15, NOW()),
      (v_p2_prod1, 2, 30, 250.00, '2026-03-30', 'STK-P2-003', 15, NOW()),
      (v_p2_prod3, 2, 20,  55.00, '2026-04-02', 'STK-P2-004', 15, NOW());
  END IF;

  -- ===========================================================================
  -- 6. CREDIT PAYMENTS  (bi-weekly from major clients)
  -- ===========================================================================
  -- Pump 1 clients
  INSERT INTO credit_payments (pump_id, client_id, amount, payment_date, payment_mode,
    reference_no, notes, received_by_user_id, payment_approval_status, approved_by_user_id, approved_at, created_at)
  VALUES
    (1, 1, 15000.00, '2026-03-25', 'CASH'::payment_mode,
     NULL, 'Monthly payment – Gov Hospital', 9, 'APPROVED'::expense_approval_status, 3, '2026-03-25 15:00:00+05:30', NOW()),
    (1, 5, 8500.00, '2026-03-27', 'BANK_TRANSFER'::payment_mode,
     'NEFT-23456', 'Police Station – partial payment', 9, 'APPROVED'::expense_approval_status, 3, '2026-03-27 11:00:00+05:30', NOW()),
    (1, 8, 12000.00, '2026-03-28', 'UPI'::payment_mode,
     'UPI-VJT-001', 'VJ Transport payment – March', 9, 'APPROVED'::expense_approval_status, 3, '2026-03-28 10:00:00+05:30', NOW()),
    (1, 1, 20000.00, '2026-04-02', 'CASH'::payment_mode,
     NULL, 'Gov Hospital – April advance', 9, 'APPROVED'::expense_approval_status, 3, '2026-04-02 16:00:00+05:30', NOW()),
    (1, 9, 5000.00, '2026-04-01', 'UPI'::payment_mode,
     'UPI-SC-002', 'Sanju Contractor partial settlement', 9, 'APPROVED'::expense_approval_status, 3, '2026-04-01 14:00:00+05:30', NOW());
  -- Pump 2 clients
  INSERT INTO credit_payments (pump_id, client_id, amount, payment_date, payment_mode,
    reference_no, notes, received_by_user_id, payment_approval_status, approved_by_user_id, approved_at, created_at)
  VALUES
    (2, 13, 10000.00, '2026-03-26', 'BANK_TRANSFER'::payment_mode,
     'NEFT-P2-001', 'Police – monthly fuel bill', 15, 'APPROVED'::expense_approval_status, 3, '2026-03-26 12:00:00+05:30', NOW()),
    (2, 14,  7500.00, '2026-03-30', 'CASH'::payment_mode,
     NULL, 'Hospital – fortnightly payment', 15, 'APPROVED'::expense_approval_status, 3, '2026-03-30 11:00:00+05:30', NOW()),
    (2, 13,  8000.00, '2026-04-02', 'UPI'::payment_mode,
     'UPI-P2-003', 'Police – advance for April', 15, 'APPROVED'::expense_approval_status, 3, '2026-04-02 15:00:00+05:30', NOW());

  -- ===========================================================================
  -- 7. UPDATE NOZZLE OUTLET LAST_READINGS  (reflect cumulative sales in seed)
  -- ===========================================================================
  UPDATE nozzle_outlets SET last_reading = v_o1  WHERE id = 1;
  UPDATE nozzle_outlets SET last_reading = v_o2  WHERE id = 2;
  UPDATE nozzle_outlets SET last_reading = v_o3  WHERE id = 3;
  UPDATE nozzle_outlets SET last_reading = v_o4  WHERE id = 4;
  UPDATE nozzle_outlets SET last_reading = v_o9  WHERE id = 9;
  UPDATE nozzle_outlets SET last_reading = v_o10 WHERE id = 10;
  UPDATE nozzle_outlets SET last_reading = v_o11 WHERE id = 11;
  UPDATE nozzle_outlets SET last_reading = v_o12 WHERE id = 12;

  RAISE NOTICE '✓ Seed complete. 15 days × 12 shifts = 180 shifts inserted across both pumps.';
  RAISE NOTICE '  Tanker deliveries, dip checks, expenses, cash events, ancillary sales & credit payments also inserted.';

END $SEED$;

COMMIT;
