
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enum types ─────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
    'SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT'
);
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE fuel_type AS ENUM ('PETROL', 'SPEED_PETROL', 'DIESEL', 'SPEED_DIESEL', 'CNG');
CREATE TYPE nozzle_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE tank_status AS ENUM ('ACTIVE', 'INACTIVE', 'DECOMMISSIONED');
CREATE TYPE lot_status AS ENUM ('ACTIVE', 'EXHAUSTED');
CREATE TYPE lot_consumption_source AS ENUM ('SHIFT_CLOSE', 'DIP_CORRECTION');
CREATE TYPE shift_window AS ENUM ('SHIFT_1', 'SHIFT_2', 'SHIFT_3');
CREATE TYPE shift_status AS ENUM (
    'OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE',
    'CLOSED_BALANCED', 'CLOSED_DISCREPANCY_PENDING', 'CLOSED_DISCREPANCY_RESOLVED'
);
CREATE TYPE discrepancy_type AS ENUM ('SHORT', 'OVER');
CREATE TYPE discrepancy_resolution AS ENUM (
    'SALARY_DEDUCTION', 'CASH_RECOVERY', 'WAIVED', 'PENDING_INVESTIGATION'
);
CREATE TYPE payment_mode AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE transaction_payment_mode AS ENUM ('CASH', 'UPI', 'CARD', 'FLEET_CARD', 'CREDIT');
CREATE TYPE cash_event_type AS ENUM ('OPENING_BALANCE', 'CASH_IN', 'CASH_OUT', 'CLOSING_BALANCE');
CREATE TYPE expense_category AS ENUM (
    'FUEL', 'MAINTENANCE', 'SALARY', 'UTILITIES', 'EQUIPMENT', 'OTHER'
);
CREATE TYPE expense_approval_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE notification_type AS ENUM (
    'LOW_STOCK', 'PRICE_STALE', 'DOCUMENT_EXPIRING', 'CALIBRATION_DUE',
    'SHIFT_OVERDUE', 'ZERO_SALE_SHIFT', 'PRICE_CHANGE_OPEN_SHIFT',
    'ANCILLARY_LOW_STOCK', 'AUTO_CLOSED_SHIFT'
);
CREATE TYPE audit_action AS ENUM (
    'USER_CREATED', 'USER_DEACTIVATED', 'USER_STATUS_CHANGED',
    'FUEL_PRICE_UPDATED', 'SHIFT_OPENED', 'SHIFT_CLOSED', 'DISCREPANCY_RESOLVED',
    'CREDIT_ENTRY_VOIDED', 'CREDIT_LIMIT_CHANGED', 'CREDIT_PAYMENT_RECEIVED',
    'INTEREST_APPLIED', 'CREDIT_CLIENT_CREATED', 'CREDIT_CLIENT_DELETED',
    'CREDIT_ENTRY_REASSIGNED', 'DELIVERY_RECORDED', 'DIP_CHECK_RECORDED',
    'DOCUMENT_ADDED', 'EXPENSE_RECORDED', 'LOGIN', 'LOGIN_FAILED', 'TOKEN_REVOKED',
    'PAYROLL_APPROVED', 'PUMP_CREATED', 'PUMP_DELETED', 'NOZZLE_ADDED', 'TANK_ADDED',
    'ANCILLARY_SALE_RECORDED', 'ANCILLARY_DELIVERY_RECORDED', 'HANDOVER_COMPLETED',
    'PUMP_CLOSURE_ADDED', 'BANK_STATEMENT_IMPORTED', 'SUPPLIER_PAYMENT_RECORDED',
    'PUMP_CONFIG_UPDATED', 'PAYROLL_DELETED'
);
CREATE TYPE payroll_status AS ENUM ('DRAFT', 'APPROVED', 'PAID');
CREATE TYPE document_status AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED');
CREATE TYPE balance_sheet_report_type AS ENUM ('SHIFT', 'DAY');
CREATE TYPE billing_cycle AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE interest_period AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE credit_extension_status AS ENUM ('ACTIVE', 'EXPIRED');
CREATE TYPE credit_extension_type AS ENUM (
    'AMOUNT_EXTENSION', 'BILLING_CYCLE_EXTENSION', 'OVERDUE_BLOCK_WAIVER'
);
CREATE TYPE ancillary_product_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE ancillary_lot_status AS ENUM ('ACTIVE', 'EXHAUSTED');
CREATE TYPE unit_of_measure AS ENUM ('LITRE', 'KG', 'PIECE');
CREATE TYPE async_job_status AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE bank_line_match_status AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- ── Users ──────────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id                      BIGSERIAL       PRIMARY KEY,
    employee_id             VARCHAR(50)     NOT NULL,
    full_name               VARCHAR(150)    NOT NULL,
    phone_number            VARCHAR(15)     NOT NULL,
    password_hash           VARCHAR(255)    NOT NULL,
    email                   VARCHAR(255),
    address                 TEXT,
    role                    user_role       NOT NULL,
    status                  user_status     NOT NULL DEFAULT 'ACTIVE',
    date_of_joining         DATE,
    assigned_pump_id        BIGINT,         -- Deferrable FK to pump_locations (defined below)
    daily_rate              NUMERIC(10,2),
    shift1_hourly_rate      NUMERIC(10,2),
    standard_hourly_rate    NUMERIC(10,2),
    gender                  VARCHAR(16),
    night_shift_consent     BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_employee_id    UNIQUE (employee_id),
    CONSTRAINT uq_users_phone_number   UNIQUE (phone_number),
    CONSTRAINT uq_users_email          UNIQUE (email)
);

-- ── Pumps ──────────────────────────────────────────────────────────────────────

CREATE TABLE pump_locations (
    id                                  BIGSERIAL       PRIMARY KEY,
    owner_id                            BIGINT          NOT NULL,
    name                                VARCHAR(150)    NOT NULL,
    address                             TEXT,
    max_du_count                        INTEGER         NOT NULL DEFAULT 4,  -- max dispensary units
    manager_id                          BIGINT,
    admin_id                            BIGINT,
    discrepancy_escalation_threshold    NUMERIC(12,2),
    expense_approval_threshold          NUMERIC(12,2),
    enabled                             BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at                          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pump_owner        FOREIGN KEY (owner_id) REFERENCES users (id),
    CONSTRAINT uq_pump_owner_name   UNIQUE (owner_id, name)
);

ALTER TABLE users
    ADD CONSTRAINT fk_users_assigned_pump
    FOREIGN KEY (assigned_pump_id)
    REFERENCES pump_locations (id)
    DEFERRABLE INITIALLY DEFERRED;

-- ── Underground tanks ──────────────────────────────────────────────────────────

CREATE TABLE underground_tanks (
    id                  BIGSERIAL       PRIMARY KEY,
    pump_id             BIGINT          NOT NULL,
    tank_identifier     VARCHAR(50)     NOT NULL,
    fuel_type           fuel_type       NOT NULL,
    capacity            NUMERIC(12,3)   NOT NULL,
    current_stock       NUMERIC(12,3)   NOT NULL DEFAULT 0,
    dip_tolerance       NUMERIC(8,3)    NOT NULL DEFAULT 20.000,
    status              tank_status     NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_tank_pump             FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT uq_tank_pump_identifier  UNIQUE (pump_id, tank_identifier),
    CONSTRAINT chk_tank_capacity_positive   CHECK (capacity > 0),
    CONSTRAINT chk_tank_stock_non_negative  CHECK (current_stock >= 0)
);

-- ── Dispensary Units (MPD machines) ────────────────────────────────────────────
-- Each DU is a physical dispensing machine at the pump.
-- du_number is auto-assigned sequentially per pump (1–20).
-- name is user-provided (e.g. "Machine 1", "DU-A").

CREATE TABLE dispensary_units (
    id              BIGSERIAL       PRIMARY KEY,
    pump_id         BIGINT          NOT NULL,
    du_number       INTEGER         NOT NULL,       -- auto-assigned 1..max_du_count
    name            VARCHAR(100)    NOT NULL,
    status          nozzle_status   NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_du_pump           FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT uq_du_pump_number    UNIQUE (pump_id, du_number),
    CONSTRAINT uq_du_pump_name      UNIQUE (pump_id, name),
    CONSTRAINT chk_du_number_range  CHECK (du_number BETWEEN 1 AND 20)
);

-- ── Nozzles (one pipe on a DU — one fuel type, one meter) ────────────────────
-- nozzle_number is 1–9 within each DU.
-- Each nozzle carries exactly one fuel type.
-- CNG nozzles must be on a CNG-only DU.

CREATE TABLE nozzles (
    id              BIGSERIAL       PRIMARY KEY,
    du_id           BIGINT          NOT NULL,
    nozzle_number   INTEGER         NOT NULL,       -- 1..9 within the DU
    fuel_type       fuel_type       NOT NULL,
    last_reading    NUMERIC(14,3)   NOT NULL DEFAULT 0,
    max_meter_value NUMERIC(14,3)   NOT NULL DEFAULT 99999999.999,
    tank_id         BIGINT,                         -- nullable until mapped in Setup
    status          nozzle_status   NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_nozzle_du         FOREIGN KEY (du_id) REFERENCES dispensary_units (id) ON DELETE CASCADE,
    CONSTRAINT fk_nozzle_tank       FOREIGN KEY (tank_id) REFERENCES underground_tanks (id),
    CONSTRAINT uq_nozzle_du_number  UNIQUE (du_id, nozzle_number),
    CONSTRAINT uq_nozzle_du_fuel    UNIQUE (du_id, fuel_type),  -- one fuel type per DU
    CONSTRAINT chk_nozzle_number_range  CHECK (nozzle_number BETWEEN 1 AND 9),
    CONSTRAINT chk_nozzle_reading_non_neg CHECK (last_reading >= 0)
);

-- ── Fuel prices ────────────────────────────────────────────────────────────────

CREATE TABLE global_fuel_prices (
    id              BIGSERIAL       PRIMARY KEY,
    pump_id         BIGINT          NOT NULL,
    fuel_type       fuel_type       NOT NULL,
    price_per_litre NUMERIC(10,3)   NOT NULL,
    effective_from  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    set_by_user_id  BIGINT          NOT NULL,

    CONSTRAINT fk_gfp_pump      FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_gfp_set_by    FOREIGN KEY (set_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_gfp_price_positive   CHECK (price_per_litre > 0)
);

-- ── Fuel suppliers ─────────────────────────────────────────────────────────────

CREATE TABLE fuel_suppliers (
    id              BIGSERIAL       PRIMARY KEY,
    pump_id         BIGINT          NOT NULL,
    name            VARCHAR(150)    NOT NULL,
    contact_name    VARCHAR(150),
    phone           VARCHAR(15),
    email           VARCHAR(255),
    notes           TEXT,
    active          BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_supplier_pump FOREIGN KEY (pump_id) REFERENCES pump_locations (id)
);

-- ── Tanker deliveries ──────────────────────────────────────────────────────────

CREATE TABLE tanker_deliveries (
    id                      BIGSERIAL       PRIMARY KEY,
    pump_id                 BIGINT          NOT NULL,
    tank_id                 BIGINT          NOT NULL,
    supplier_id             BIGINT,
    fuel_type               fuel_type       NOT NULL,
    quantity_delivered      NUMERIC(12,3)   NOT NULL,
    cost_price_per_unit     NUMERIC(10,3)   NOT NULL,
    delivery_date           TIMESTAMPTZ     NOT NULL,
    invoice_reference       VARCHAR(100),
    logged_by_user_id       BIGINT          NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_delivery_pump         FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_delivery_tank         FOREIGN KEY (tank_id) REFERENCES underground_tanks (id),
    CONSTRAINT fk_delivery_supplier     FOREIGN KEY (supplier_id) REFERENCES fuel_suppliers (id),
    CONSTRAINT fk_delivery_logged_by    FOREIGN KEY (logged_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_delivery_qty_positive    CHECK (quantity_delivered > 0),
    CONSTRAINT chk_delivery_cost_positive   CHECK (cost_price_per_unit > 0)
);

-- Partial unique index: same fuel type cannot be recorded twice under the same invoice for same pump.
-- NULL invoice_reference rows are excluded (each NULL is distinct in PostgreSQL).
CREATE UNIQUE INDEX uq_delivery_pump_invoice_fuel
    ON tanker_deliveries (pump_id, invoice_reference, fuel_type)
    WHERE invoice_reference IS NOT NULL;

-- ── Inventory lots ─────────────────────────────────────────────────────────────

CREATE TABLE inventory_lots (
    id                      BIGSERIAL       PRIMARY KEY,
    tanker_delivery_id      BIGINT,
    tank_id                 BIGINT          NOT NULL,
    pump_id                 BIGINT          NOT NULL,
    fuel_type               fuel_type       NOT NULL,
    original_quantity       NUMERIC(12,3)   NOT NULL,
    remaining_quantity      NUMERIC(12,3)   NOT NULL,
    cost_price_per_unit     NUMERIC(10,3)   NOT NULL,
    delivery_date           TIMESTAMPTZ     NOT NULL,
    is_dip_adjustment       BOOLEAN         NOT NULL DEFAULT FALSE,
    status                  lot_status      NOT NULL DEFAULT 'ACTIVE',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_lot_delivery  FOREIGN KEY (tanker_delivery_id) REFERENCES tanker_deliveries (id),
    CONSTRAINT fk_lot_tank      FOREIGN KEY (tank_id) REFERENCES underground_tanks (id),
    CONSTRAINT fk_lot_pump      FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT chk_lot_orig_qty_positive        CHECK (original_quantity > 0),
    CONSTRAINT chk_lot_remaining_non_negative   CHECK (remaining_quantity >= 0)
);

-- ── Lot consumptions ───────────────────────────────────────────────────────────

CREATE TABLE lot_consumptions (
    id                  BIGSERIAL               PRIMARY KEY,
    lot_id              BIGINT                  NOT NULL,
    shift_id            BIGINT,                 -- FK added after shifts table is created
    dip_correction_id   BIGINT,
    quantity_consumed   NUMERIC(12,3)           NOT NULL,
    cost_price_per_unit NUMERIC(10,3)           NOT NULL,
    source_type         lot_consumption_source  NOT NULL DEFAULT 'SHIFT_CLOSE',
    consumed_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_consumption_lot   FOREIGN KEY (lot_id) REFERENCES inventory_lots (id),
    CONSTRAINT chk_consumption_qty_positive CHECK (quantity_consumed > 0)
);

-- ── Dip checks ─────────────────────────────────────────────────────────────────

CREATE TABLE dip_checks (
    id                      BIGSERIAL       PRIMARY KEY,
    pump_id                 BIGINT          NOT NULL,
    tank_id                 BIGINT          NOT NULL,
    measured_quantity       NUMERIC(12,3)   NOT NULL,
    system_stock            NUMERIC(12,3)   NOT NULL,
    variance                NUMERIC(12,3)   NOT NULL GENERATED ALWAYS AS (measured_quantity - system_stock) STORED,
    notes                   TEXT,
    checked_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    logged_by_user_id       BIGINT          NOT NULL,
    checked_by_user_id      BIGINT,
    status                  VARCHAR(30)     NOT NULL DEFAULT 'WITHIN_TOLERANCE',
    reviewed_by_user_id     BIGINT,
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_dip_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_dip_tank          FOREIGN KEY (tank_id) REFERENCES underground_tanks (id),
    CONSTRAINT fk_dip_logged_by     FOREIGN KEY (logged_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_dip_checked_by    FOREIGN KEY (checked_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_dip_reviewed_by   FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_dip_reading_non_negative CHECK (measured_quantity >= 0)
);

-- ── Shift definitions ──────────────────────────────────────────────────────────

CREATE TABLE pump_shift_definitions (
    id                  BIGSERIAL       PRIMARY KEY,
    pump_id             BIGINT          NOT NULL,
    name                VARCHAR(100)    NOT NULL,
    start_time          TIME            NOT NULL,
    end_time            TIME            NOT NULL,
    crosses_midnight    BOOLEAN         NOT NULL DEFAULT FALSE,
    is_night_shift      BOOLEAN         NOT NULL DEFAULT FALSE,
    sort_order          INTEGER         NOT NULL DEFAULT 1,
    effective_from      DATE            NOT NULL,
    effective_to        DATE,
    created_by_user_id  BIGINT          NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_psd_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id) ON DELETE CASCADE,
    CONSTRAINT fk_psd_created_by    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
);

-- ── Shifts ─────────────────────────────────────────────────────────────────────
-- One shift = one operator session on one DU (a subset of the DU's nozzles).
-- The specific nozzles are tracked in shift_nozzles join table.

CREATE TABLE shifts (
    id                              BIGSERIAL           PRIMARY KEY,
    pump_id                         BIGINT              NOT NULL,
    du_id                           BIGINT              NOT NULL,   -- which DU was operated
    operator_id                     BIGINT              NOT NULL,
    opened_by_user_id               BIGINT              NOT NULL,
    closed_by_user_id               BIGINT,
    shift_definition_id             BIGINT,
    shift_name                      VARCHAR(100),
    is_night_shift                  BOOLEAN             NOT NULL DEFAULT FALSE,
    shift_date                      DATE                NOT NULL,
    actual_start_time               TIMESTAMPTZ         NOT NULL,
    actual_end_time                 TIMESTAMPTZ,
    cash_collected                  NUMERIC(14,2),
    upi_collected                   NUMERIC(14,2),
    card_collected                  NUMERIC(14,2),
    fleet_card_collected            NUMERIC(14,2),
    credit_total                    NUMERIC(14,2),
    total_amount_due                NUMERIC(14,2),
    discrepancy_amount              NUMERIC(14,2),
    discrepancy_type                discrepancy_type,
    discrepancy_reason              TEXT,
    discrepancy_resolution          discrepancy_resolution,
    discrepancy_resolution_note     TEXT,
    discrepancy_resolved_by_id      BIGINT,
    discrepancy_resolved_at         TIMESTAMPTZ,
    status                          shift_status        NOT NULL DEFAULT 'OPEN',
    is_overdue_flag                 BOOLEAN             NOT NULL DEFAULT FALSE,
    created_at                      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_shift_pump            FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_shift_du              FOREIGN KEY (du_id) REFERENCES dispensary_units (id),
    CONSTRAINT fk_shift_operator        FOREIGN KEY (operator_id) REFERENCES users (id),
    CONSTRAINT fk_shift_opened_by       FOREIGN KEY (opened_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_shift_closed_by       FOREIGN KEY (closed_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_shift_definition      FOREIGN KEY (shift_definition_id) REFERENCES pump_shift_definitions (id),
    CONSTRAINT fk_shift_resolved_by     FOREIGN KEY (discrepancy_resolved_by_id) REFERENCES users (id)
);

-- ── Shift nozzles (join table) ─────────────────────────────────────────────────
-- Maps which nozzles from the DU are active in this shift.
-- One operator may take 1–N nozzles of a DU; remaining nozzles can be taken by another operator.

CREATE TABLE shift_nozzles (
    shift_id    BIGINT  NOT NULL,
    nozzle_id   BIGINT  NOT NULL,

    PRIMARY KEY (shift_id, nozzle_id),
    CONSTRAINT fk_sn_shift  FOREIGN KEY (shift_id)  REFERENCES shifts (id) ON DELETE CASCADE,
    CONSTRAINT fk_sn_nozzle FOREIGN KEY (nozzle_id) REFERENCES nozzles (id)
);

ALTER TABLE lot_consumptions
    ADD CONSTRAINT fk_consumption_shift
    FOREIGN KEY (shift_id) REFERENCES shifts (id);

-- ── Shift fuel readings ────────────────────────────────────────────────────────
-- One row per nozzle per shift (nozzle = one fuel type, one meter).

CREATE TABLE shift_fuel_readings (
    id              BIGSERIAL       PRIMARY KEY,
    shift_id        BIGINT          NOT NULL,
    nozzle_id       BIGINT          NOT NULL,   -- FK → nozzles (was outlet_id → nozzle_outlets)
    fuel_type       fuel_type       NOT NULL,
    tank_id         BIGINT,                     -- frozen at shift open for lot attribution
    start_reading   NUMERIC(14,3)   NOT NULL,
    end_reading     NUMERIC(14,3),
    units_sold      NUMERIC(14,3),
    price_snapshot  NUMERIC(10,3)   NOT NULL,

    CONSTRAINT fk_sfr_shift     FOREIGN KEY (shift_id)   REFERENCES shifts (id) ON DELETE CASCADE,
    CONSTRAINT fk_sfr_nozzle    FOREIGN KEY (nozzle_id)  REFERENCES nozzles (id),
    CONSTRAINT fk_sfr_tank      FOREIGN KEY (tank_id)    REFERENCES underground_tanks (id),
    CONSTRAINT uq_sfr_shift_nozzle  UNIQUE (shift_id, nozzle_id)
);

-- ── Fuel transactions ──────────────────────────────────────────────────────────

CREATE TABLE fuel_transactions (
    id                      BIGSERIAL                   PRIMARY KEY,
    shift_id                BIGINT                      NOT NULL,
    pump_id                 BIGINT                      NOT NULL,
    nozzle_id               BIGINT                      NOT NULL,   -- FK → nozzles (was nozzle_outlet_id)
    fuel_type               fuel_type                   NOT NULL,
    quantity_litres         NUMERIC(10,3)               NOT NULL,
    price_per_unit          NUMERIC(10,4)               NOT NULL,
    total_amount            NUMERIC(12,2)               NOT NULL,
    payment_mode            transaction_payment_mode    NOT NULL DEFAULT 'CASH',
    vehicle_registration    VARCHAR(20),
    upi_reference           VARCHAR(50),
    notes                   TEXT,
    recorded_by_user_id     BIGINT                      NOT NULL,
    recorded_at             TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ftxn_shift        FOREIGN KEY (shift_id)              REFERENCES shifts (id),
    CONSTRAINT fk_ftxn_pump         FOREIGN KEY (pump_id)               REFERENCES pump_locations (id),
    CONSTRAINT fk_ftxn_nozzle       FOREIGN KEY (nozzle_id)             REFERENCES nozzles (id),
    CONSTRAINT fk_ftxn_recorded_by  FOREIGN KEY (recorded_by_user_id)   REFERENCES users (id),
    CONSTRAINT chk_ftxn_litres_positive     CHECK (quantity_litres > 0),
    CONSTRAINT chk_ftxn_amount_positive     CHECK (total_amount > 0)
);

-- ── Credit clients ─────────────────────────────────────────────────────────────

CREATE TABLE credit_clients (
    id                      BIGSERIAL       PRIMARY KEY,
    pump_id                 BIGINT          NOT NULL,
    name                    VARCHAR(150)    NOT NULL,
    phone                   VARCHAR(15),
    notes                   TEXT,
    credit_limit            NUMERIC(14,2)   NOT NULL DEFAULT 0,
    billing_cycle           billing_cycle   NOT NULL DEFAULT 'MONTHLY',
    monthly_interest_rate   NUMERIC(5,2)    NOT NULL DEFAULT 0,
    interest_period         interest_period NOT NULL DEFAULT 'MONTHLY',
    interest_grace_days     INTEGER         NOT NULL DEFAULT 1,
    parent_client_id        BIGINT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cc_pump   FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_cc_parent FOREIGN KEY (parent_client_id) REFERENCES credit_clients (id)
);

CREATE TABLE shift_credit_entries (
    id                      BIGSERIAL       PRIMARY KEY,
    shift_id                BIGINT          NOT NULL,
    client_id               BIGINT,
    client_name             VARCHAR(150)    NOT NULL,
    bill_no                 VARCHAR(50),
    amount                  NUMERIC(14,2)   NOT NULL,
    fuel_type               VARCHAR(30)     NOT NULL,
    description             TEXT,
    vehicle_registration    VARCHAR(20),
    driver_name             VARCHAR(100),
    void_status             VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE',
    void_reason             TEXT,
    voided_by_user_id       BIGINT,
    voided_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sce_shift     FOREIGN KEY (shift_id) REFERENCES shifts (id),
    CONSTRAINT fk_sce_client    FOREIGN KEY (client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_sce_voided_by FOREIGN KEY (voided_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_sce_amount_positive  CHECK (amount > 0)
);

CREATE TABLE credit_payments (
    id                          BIGSERIAL               PRIMARY KEY,
    pump_id                     BIGINT                  NOT NULL,
    client_id                   BIGINT                  NOT NULL,
    amount                      NUMERIC(14,2)           NOT NULL,
    payment_date                DATE                    NOT NULL,
    payment_mode                payment_mode            NOT NULL DEFAULT 'CASH',
    reference_no                VARCHAR(100),
    notes                       TEXT,
    received_by_user_id         BIGINT                  NOT NULL,
    payment_approval_status     expense_approval_status NOT NULL DEFAULT 'APPROVED',
    approved_by_user_id         BIGINT,
    approved_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cpay_pump         FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_cpay_client       FOREIGN KEY (client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_cpay_received_by  FOREIGN KEY (received_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_cpay_approved_by  FOREIGN KEY (approved_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_cpay_amount_positive CHECK (amount > 0)
);

CREATE TABLE credit_interest_charges (
    id                  BIGSERIAL       PRIMARY KEY,
    pump_id             BIGINT          NOT NULL,
    client_id           BIGINT          NOT NULL,
    amount              NUMERIC(14,2)   NOT NULL,
    outstanding_balance NUMERIC(14,2)   NOT NULL,
    rate_applied        NUMERIC(5,2)    NOT NULL,
    days_applied        INTEGER         NOT NULL,
    period_from         DATE            NOT NULL,
    period_to           DATE            NOT NULL,
    source              VARCHAR(100)    NOT NULL,
    applied_by_user_id  BIGINT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cic_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_cic_client        FOREIGN KEY (client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_cic_applied_by    FOREIGN KEY (applied_by_user_id) REFERENCES users (id),
    CONSTRAINT uq_cic_client_period UNIQUE (client_id, period_from, period_to)
);

CREATE TABLE credit_extensions (
    id                  BIGSERIAL               PRIMARY KEY,
    pump_id             BIGINT                  NOT NULL,
    client_id           BIGINT                  NOT NULL,
    extension_type      credit_extension_type   NOT NULL,
    extension_amount    NUMERIC(14,2),
    expiry_date         DATE                    NOT NULL,
    status              credit_extension_status NOT NULL DEFAULT 'ACTIVE',
    reason              TEXT                    NOT NULL,
    granted_by_user_id  BIGINT                  NOT NULL,
    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cext_pump         FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_cext_client       FOREIGN KEY (client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_cext_granted_by   FOREIGN KEY (granted_by_user_id) REFERENCES users (id)
);

CREATE TABLE credit_entry_reassignments (
    id                      BIGSERIAL   PRIMARY KEY,
    credit_entry_id         BIGINT      NOT NULL,
    from_client_id          BIGINT      NOT NULL,
    to_client_id            BIGINT      NOT NULL,
    reassigned_by_user_id   BIGINT      NOT NULL,
    reason                  TEXT        NOT NULL,
    reassigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cer_entry         FOREIGN KEY (credit_entry_id) REFERENCES shift_credit_entries (id),
    CONSTRAINT fk_cer_from_client   FOREIGN KEY (from_client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_cer_to_client     FOREIGN KEY (to_client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_cer_reassigned_by FOREIGN KEY (reassigned_by_user_id) REFERENCES users (id)
);

-- ── Balance sheets ─────────────────────────────────────────────────────────────

CREATE TABLE balance_sheets (
    id                          BIGSERIAL                   PRIMARY KEY,
    pump_id                     BIGINT                      NOT NULL,
    report_type                 balance_sheet_report_type   NOT NULL,
    report_date                 DATE                        NOT NULL,
    shift_window                VARCHAR(100),
    shift_definition_id         BIGINT,
    period_label                VARCHAR(100),
    generated_by_user_id        BIGINT                      NOT NULL,
    generated_at                TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    notes                       TEXT,
    total_expected_revenue      NUMERIC(14,2),
    total_cash_collected        NUMERIC(14,2),
    total_upi_collected         NUMERIC(14,2),
    total_card_collected        NUMERIC(14,2),
    total_fleet_card_collected  NUMERIC(14,2),
    total_credit_sold           NUMERIC(14,2),
    total_credit_recovered      NUMERIC(14,2),
    cash_discrepancy            NUMERIC(14,2),
    total_litres_sold           NUMERIC(14,3),
    total_litres_delivered      NUMERIC(14,3),
    total_cost_of_goods         NUMERIC(14,2),
    total_gross_profit          NUMERIC(14,2),
    total_dip_loss_amount       NUMERIC(14,2),

    CONSTRAINT fk_bs_pump           FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_bs_generated_by   FOREIGN KEY (generated_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_bs_definition     FOREIGN KEY (shift_definition_id) REFERENCES pump_shift_definitions (id)
);

CREATE TABLE bs_fuel_lines (
    id                  BIGSERIAL       PRIMARY KEY,
    balance_sheet_id    BIGINT          NOT NULL,
    fuel_type           VARCHAR(30)     NOT NULL,
    opening_stock       NUMERIC(14,3)   NOT NULL DEFAULT 0,
    closing_stock       NUMERIC(14,3)   NOT NULL DEFAULT 0,
    delivered_litres    NUMERIC(14,3)   NOT NULL DEFAULT 0,
    delivered_cost      NUMERIC(14,2)   NOT NULL DEFAULT 0,
    sold_litres         NUMERIC(14,3)   NOT NULL DEFAULT 0,
    selling_price       NUMERIC(10,3)   NOT NULL DEFAULT 0,
    expected_revenue    NUMERIC(14,2)   NOT NULL DEFAULT 0,
    cost_of_goods       NUMERIC(14,2)   NOT NULL DEFAULT 0,
    gross_profit        NUMERIC(14,2)   NOT NULL DEFAULT 0,
    credit_sold_amount  NUMERIC(14,2)   NOT NULL DEFAULT 0,
    stock_variance      NUMERIC(14,3)   NOT NULL DEFAULT 0,
    dip_loss_litres     NUMERIC(14,3)   NOT NULL DEFAULT 0,
    dip_loss_amount     NUMERIC(14,2)   NOT NULL DEFAULT 0,

    CONSTRAINT fk_bsfl_balance_sheet FOREIGN KEY (balance_sheet_id) REFERENCES balance_sheets (id) ON DELETE CASCADE
);

-- Per-shift summary row in a balance sheet.
-- du_number identifies which machine; fuel_types_summary is comma-joined fuel list.
CREATE TABLE bs_shift_lines (
    id                      BIGSERIAL       PRIMARY KEY,
    balance_sheet_id        BIGINT          NOT NULL,
    shift_id                BIGINT          NOT NULL,
    operator_name           VARCHAR(150)    NOT NULL,
    du_number               INTEGER         NOT NULL,
    du_name                 VARCHAR(100)    NOT NULL DEFAULT '',
    fuel_types_summary      VARCHAR(255)    NOT NULL,
    litres_sold             NUMERIC(14,3)   NOT NULL DEFAULT 0,
    expected_revenue        NUMERIC(14,2)   NOT NULL DEFAULT 0,
    cash_collected          NUMERIC(14,2)   NOT NULL DEFAULT 0,
    upi_collected           NUMERIC(14,2)   NOT NULL DEFAULT 0,
    card_collected          NUMERIC(14,2)   NOT NULL DEFAULT 0,
    fleet_card_collected    NUMERIC(14,2)   NOT NULL DEFAULT 0,
    credit_amount           NUMERIC(14,2)   NOT NULL DEFAULT 0,
    discrepancy             NUMERIC(14,2)   NOT NULL DEFAULT 0,

    CONSTRAINT fk_bssl_balance_sheet FOREIGN KEY (balance_sheet_id) REFERENCES balance_sheets (id) ON DELETE CASCADE,
    CONSTRAINT fk_bssl_shift         FOREIGN KEY (shift_id) REFERENCES shifts (id)
);

-- ── Expenses ────────────────────────────────────────────────────────────────────

CREATE TABLE pump_expenses (
    id                      BIGSERIAL               PRIMARY KEY,
    pump_id                 BIGINT                  NOT NULL,
    category                expense_category        NOT NULL,
    amount                  NUMERIC(12,2)           NOT NULL,
    description             TEXT,
    expense_date            DATE                    NOT NULL,
    recorded_by_user_id     BIGINT                  NOT NULL,
    approval_status         expense_approval_status NOT NULL DEFAULT 'APPROVED',
    approved_by_user_id     BIGINT,
    approved_at             TIMESTAMPTZ,
    approval_notes          TEXT,
    submitted_by_user_id    BIGINT,
    submitted_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_expense_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_expense_recorded_by   FOREIGN KEY (recorded_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_expense_approved_by   FOREIGN KEY (approved_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_expense_amount_positive  CHECK (amount > 0)
);

-- ── Documents ───────────────────────────────────────────────────────────────────

CREATE TABLE pump_documents (
    id                  BIGSERIAL       PRIMARY KEY,
    pump_id             BIGINT          NOT NULL,
    name                VARCHAR(150)    NOT NULL,
    doc_type            VARCHAR(100)    NOT NULL,
    expiry_date         DATE,
    status              document_status NOT NULL DEFAULT 'VALID',
    notes               TEXT,
    uploaded_by_user_id BIGINT          NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_doc_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_doc_uploaded_by   FOREIGN KEY (uploaded_by_user_id) REFERENCES users (id)
);

-- ── Cash events ─────────────────────────────────────────────────────────────────

CREATE TABLE cash_events (
    id                  BIGSERIAL           PRIMARY KEY,
    pump_id             BIGINT              NOT NULL,
    event_type          cash_event_type     NOT NULL,
    amount              NUMERIC(12,2)       NOT NULL,
    description         TEXT,
    event_date          DATE                NOT NULL,
    recorded_by_user_id BIGINT              NOT NULL,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cash_event_pump        FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_cash_event_recorded_by FOREIGN KEY (recorded_by_user_id) REFERENCES users (id)
);

-- ── Nozzle calibration logs ─────────────────────────────────────────────────────

CREATE TABLE nozzle_calibration_logs (
    id                      BIGSERIAL   PRIMARY KEY,
    pump_id                 BIGINT      NOT NULL,
    nozzle_id               BIGINT      NOT NULL,
    calibration_date        DATE        NOT NULL,
    next_calibration_due    DATE,
    calibrated_by           VARCHAR(150),
    certificate_reference   VARCHAR(100),
    notes                   TEXT,
    logged_by_user_id       BIGINT      NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cal_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_cal_nozzle        FOREIGN KEY (nozzle_id) REFERENCES nozzles (id),
    CONSTRAINT fk_cal_logged_by     FOREIGN KEY (logged_by_user_id) REFERENCES users (id)
);

-- ── Nozzle reading adjustments ──────────────────────────────────────────────────

CREATE TABLE nozzle_reading_adjustments (
    id                  BIGSERIAL   PRIMARY KEY,
    pump_id             BIGINT      NOT NULL,
    nozzle_id           BIGINT      NOT NULL,   -- FK → nozzles (each nozzle is single fuel type)
    adjustment_type     VARCHAR(50) NOT NULL,
    fuel_type           VARCHAR(30) NOT NULL,
    previous_reading    NUMERIC(14,3)   NOT NULL,
    new_reading         NUMERIC(14,3)   NOT NULL,
    reason              TEXT            NOT NULL,
    recorded_by_user_id BIGINT          NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_nra_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_nra_nozzle        FOREIGN KEY (nozzle_id) REFERENCES nozzles (id),
    CONSTRAINT fk_nra_recorded_by   FOREIGN KEY (recorded_by_user_id) REFERENCES users (id)
);

-- ── Fuel dip entries ────────────────────────────────────────────────────────────

CREATE TABLE fuel_dip_entries (
    id                  BIGSERIAL   PRIMARY KEY,
    pump_id             BIGINT      NOT NULL,
    fuel_type           VARCHAR(30) NOT NULL,
    litres_removed      NUMERIC(12,3)   NOT NULL,
    price_per_unit      NUMERIC(10,3)   NOT NULL,
    monetary_loss       NUMERIC(14,2)   NOT NULL,
    reason              TEXT            NOT NULL,
    dip_date            DATE            NOT NULL,
    recorded_by_user_id BIGINT          NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_fde_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_fde_recorded_by   FOREIGN KEY (recorded_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_fde_litres_positive  CHECK (litres_removed > 0)
);

-- ── Notifications ───────────────────────────────────────────────────────────────

CREATE TABLE notifications (
    id          BIGSERIAL           PRIMARY KEY,
    pump_id     BIGINT              NOT NULL,
    type        notification_type   NOT NULL,
    title       VARCHAR(200)        NOT NULL,
    message     TEXT                NOT NULL,
    dedup_key   VARCHAR(300)        NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notif_pump        FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT uq_notif_pump_dedup  UNIQUE (pump_id, dedup_key)
);

-- ── Audit logs ──────────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
    id          BIGSERIAL       PRIMARY KEY,
    pump_id     BIGINT,
    action      audit_action    NOT NULL,
    entity_type VARCHAR(100),
    entity_id   VARCHAR(100),
    description TEXT,
    actor_id    BIGINT,
    actor_name  VARCHAR(150)    NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_audit_actor   FOREIGN KEY (actor_id) REFERENCES users (id)
);

-- ── Payroll ─────────────────────────────────────────────────────────────────────

CREATE TABLE payroll_records (
    id                      BIGSERIAL       PRIMARY KEY,
    salary_type             VARCHAR(20)     NOT NULL DEFAULT 'HOURLY_SHIFT',
    pump_id                 BIGINT          NOT NULL,
    user_id                 BIGINT          NOT NULL,
    period_from             DATE            NOT NULL,
    period_to               DATE            NOT NULL,
    total_shifts            INTEGER         NOT NULL DEFAULT 0,
    shift1_shifts           INTEGER         NOT NULL DEFAULT 0,
    shift1_hours            NUMERIC(6,2)    NOT NULL DEFAULT 0,
    shift1_rate_snapshot    NUMERIC(10,2),
    standard_shifts         INTEGER         NOT NULL DEFAULT 0,
    standard_hours          NUMERIC(6,2)    NOT NULL DEFAULT 0,
    standard_rate_snapshot  NUMERIC(10,2),
    gross_amount            NUMERIC(12,2)   NOT NULL DEFAULT 0,
    total_days              INTEGER,
    leave_days              INTEGER,
    days_worked             INTEGER,
    daily_rate_snapshot     NUMERIC(10,2),
    notes                   TEXT,
    status                  payroll_status  NOT NULL DEFAULT 'DRAFT',
    approved_by             BIGINT,
    deductions              NUMERIC(12,2)   NOT NULL DEFAULT 0,
    net_pay                 NUMERIC(12,2)   NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_payroll_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_payroll_user          FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_payroll_approved_by   FOREIGN KEY (approved_by) REFERENCES users (id),
    CONSTRAINT uq_payroll_pump_user_period UNIQUE (pump_id, user_id, period_from, period_to)
);

-- ── Staff scheduling ────────────────────────────────────────────────────────────

CREATE TABLE staff_preference (
    id              BIGSERIAL   PRIMARY KEY,
    pump_id         BIGINT      NOT NULL,
    user_id         BIGINT      NOT NULL,
    preferred_shift_definition_id BIGINT,
    preferred_day_off VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sp_pump                   FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_sp_user                   FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_sp_preferred_definition   FOREIGN KEY (preferred_shift_definition_id) REFERENCES pump_shift_definitions (id),
    CONSTRAINT uq_sp_pump_user              UNIQUE (pump_id, user_id)
);

CREATE TABLE staff_leave (
    id          BIGSERIAL   PRIMARY KEY,
    pump_id     BIGINT      NOT NULL,
    user_id     BIGINT      NOT NULL,
    leave_date  DATE        NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sl_pump       FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_sl_user       FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uq_sl_pump_user_date UNIQUE (pump_id, user_id, leave_date)
);

CREATE TABLE shift_plan (
    id                          BIGSERIAL   PRIMARY KEY,
    pump_id                     BIGINT      NOT NULL,
    week_start                  DATE        NOT NULL,
    status                      VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    operators_per_day_shift     INTEGER     NOT NULL DEFAULT 1,
    operators_per_night_shift   INTEGER     NOT NULL DEFAULT 1,
    created_by_user_id          BIGINT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_splan_pump        FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_splan_created_by  FOREIGN KEY (created_by_user_id) REFERENCES users (id)
);

CREATE TABLE shift_plan_entry (
    id                  BIGSERIAL   PRIMARY KEY,
    shift_plan_id       BIGINT      NOT NULL,
    shift_date          DATE        NOT NULL,
    shift_definition_id BIGINT,
    operator_user_id    BIGINT      NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
    note                VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_spe_plan       FOREIGN KEY (shift_plan_id) REFERENCES shift_plan (id) ON DELETE CASCADE,
    CONSTRAINT fk_spe_definition FOREIGN KEY (shift_definition_id) REFERENCES pump_shift_definitions (id),
    CONSTRAINT fk_spe_user       FOREIGN KEY (operator_user_id) REFERENCES users (id)
);

-- ── Auth tables ─────────────────────────────────────────────────────────────────

CREATE TABLE password_reset_tokens (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     BIGINT      NOT NULL,
    token       UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_prt_user  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE token_blacklist (
    id              BIGSERIAL   PRIMARY KEY,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    user_id         BIGINT      NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    blacklisted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_tbl_user  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE login_attempts (
    id              BIGSERIAL   PRIMARY KEY,
    phone_number    VARCHAR(15) NOT NULL,
    ip_address      VARCHAR(45),
    success         BOOLEAN     NOT NULL,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pump closures ───────────────────────────────────────────────────────────────

CREATE TABLE pump_closures (
    id                  BIGSERIAL   PRIMARY KEY,
    pump_id             BIGINT      NOT NULL,
    closure_date        DATE        NOT NULL,
    reason              VARCHAR(255)    NOT NULL,
    created_by_user_id  BIGINT          NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pc_pump           FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_pc_created_by     FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    CONSTRAINT uq_pc_pump_date      UNIQUE (pump_id, closure_date)
);

-- ── Shift handovers ─────────────────────────────────────────────────────────────

CREATE TABLE shift_handovers (
    id                      BIGSERIAL   PRIMARY KEY,
    pump_id                 BIGINT      NOT NULL,
    outgoing_shift_id       BIGINT      NOT NULL,
    outgoing_operator_id    BIGINT      NOT NULL,
    incoming_operator_id    BIGINT      NOT NULL,
    physical_cash_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
    meter_readings_verified BOOLEAN     NOT NULL DEFAULT FALSE,
    notes                   TEXT,
    handover_time           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sho_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_sho_outgoing_shift FOREIGN KEY (outgoing_shift_id) REFERENCES shifts (id),
    CONSTRAINT fk_sho_outgoing_op   FOREIGN KEY (outgoing_operator_id) REFERENCES users (id),
    CONSTRAINT fk_sho_incoming_op   FOREIGN KEY (incoming_operator_id) REFERENCES users (id)
);

-- ── Ancillary products ──────────────────────────────────────────────────────────

CREATE TABLE ancillary_products (
    id                      BIGSERIAL                   PRIMARY KEY,
    pump_id                 BIGINT                      NOT NULL,
    name                    VARCHAR(100)                NOT NULL,
    brand                   VARCHAR(100),
    variant                 VARCHAR(100),
    package_size            NUMERIC(10,3)               NOT NULL,
    unit_of_measure         unit_of_measure             NOT NULL,
    current_stock_units     INTEGER                     NOT NULL DEFAULT 0,
    low_stock_threshold     INTEGER,
    hsn_code                VARCHAR(10),
    gst_rate_percent        NUMERIC(5,2)                NOT NULL DEFAULT 18.00,
    status                  ancillary_product_status    NOT NULL DEFAULT 'ACTIVE',
    created_at              TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ap_pump               FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT chk_ap_package_positive  CHECK (package_size > 0),
    CONSTRAINT chk_ap_stock_non_neg     CHECK (current_stock_units >= 0),
    CONSTRAINT chk_ap_gst_non_neg       CHECK (gst_rate_percent >= 0)
);

CREATE TABLE ancillary_product_prices (
    id              BIGSERIAL       PRIMARY KEY,
    product_id      BIGINT          NOT NULL,
    pump_id         BIGINT          NOT NULL,
    price_per_unit  NUMERIC(12,2)   NOT NULL,
    effective_from  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    set_by_user_id  BIGINT          NOT NULL,

    CONSTRAINT fk_app_product   FOREIGN KEY (product_id) REFERENCES ancillary_products (id),
    CONSTRAINT fk_app_pump      FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_app_set_by    FOREIGN KEY (set_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_app_price_positive   CHECK (price_per_unit > 0)
);

CREATE TABLE ancillary_stock_deliveries (
    id                  BIGSERIAL       PRIMARY KEY,
    product_id          BIGINT          NOT NULL,
    pump_id             BIGINT          NOT NULL,
    quantity_units      INTEGER         NOT NULL,
    cost_price_per_unit NUMERIC(12,2)   NOT NULL,
    delivery_date       DATE            NOT NULL,
    invoice_reference   VARCHAR(100),
    notes               TEXT,
    logged_by_user_id   BIGINT          NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_asd_product       FOREIGN KEY (product_id) REFERENCES ancillary_products (id),
    CONSTRAINT fk_asd_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_asd_logged_by     FOREIGN KEY (logged_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_asd_qty_positive     CHECK (quantity_units > 0),
    CONSTRAINT chk_asd_cost_positive    CHECK (cost_price_per_unit > 0)
);

CREATE TABLE ancillary_stock_lots (
    id                  BIGSERIAL               PRIMARY KEY,
    delivery_id         BIGINT                  NOT NULL,
    product_id          BIGINT                  NOT NULL,
    pump_id             BIGINT                  NOT NULL,
    original_quantity   INTEGER                 NOT NULL,
    remaining_quantity  INTEGER                 NOT NULL,
    cost_price_per_unit NUMERIC(12,2)           NOT NULL,
    delivery_date       DATE                    NOT NULL,
    status              ancillary_lot_status    NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_asl_delivery  FOREIGN KEY (delivery_id) REFERENCES ancillary_stock_deliveries (id),
    CONSTRAINT fk_asl_product   FOREIGN KEY (product_id) REFERENCES ancillary_products (id),
    CONSTRAINT fk_asl_pump      FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT chk_asl_remaining_non_neg CHECK (remaining_quantity >= 0)
);

CREATE TABLE ancillary_sales (
    id                      BIGSERIAL                   PRIMARY KEY,
    pump_id                 BIGINT                      NOT NULL,
    product_id              BIGINT                      NOT NULL,
    quantity_units          INTEGER                     NOT NULL,
    selling_price_per_unit  NUMERIC(12,2)               NOT NULL,
    total_amount            NUMERIC(14,2)               NOT NULL,
    gst_amount              NUMERIC(12,2)               NOT NULL DEFAULT 0,
    total_with_gst          NUMERIC(14,2)               NOT NULL,
    payment_mode            transaction_payment_mode    NOT NULL DEFAULT 'CASH',
    client_id               BIGINT,
    client_name             VARCHAR(150),
    bill_no                 VARCHAR(50),
    notes                   TEXT,
    sold_by_user_id         BIGINT                      NOT NULL,
    sale_date               DATE                        NOT NULL,
    created_at              TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_asale_pump        FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_asale_product     FOREIGN KEY (product_id) REFERENCES ancillary_products (id),
    CONSTRAINT fk_asale_client      FOREIGN KEY (client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_asale_sold_by     FOREIGN KEY (sold_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_asale_qty_positive   CHECK (quantity_units > 0)
);

CREATE TABLE ancillary_lot_consumptions (
    id                  BIGSERIAL       PRIMARY KEY,
    lot_id              BIGINT          NOT NULL,
    sale_id             BIGINT          NOT NULL,
    quantity_consumed   INTEGER         NOT NULL,
    cost_price_per_unit NUMERIC(12,2)   NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_alc_lot   FOREIGN KEY (lot_id) REFERENCES ancillary_stock_lots (id),
    CONSTRAINT fk_alc_sale  FOREIGN KEY (sale_id) REFERENCES ancillary_sales (id)
);

-- ── Fuel supplier payments ──────────────────────────────────────────────────────

CREATE TABLE fuel_supplier_payments (
    id                  BIGSERIAL       PRIMARY KEY,
    pump_id             BIGINT          NOT NULL,
    supplier_id         BIGINT          NOT NULL,
    delivery_id         BIGINT,
    amount              NUMERIC(14,2)   NOT NULL,
    payment_date        DATE            NOT NULL,
    payment_mode        payment_mode    NOT NULL DEFAULT 'BANK_TRANSFER',
    reference_no        VARCHAR(100),
    notes               TEXT,
    recorded_by_user_id BIGINT          NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_fsp_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_fsp_supplier      FOREIGN KEY (supplier_id) REFERENCES fuel_suppliers (id),
    CONSTRAINT fk_fsp_delivery      FOREIGN KEY (delivery_id) REFERENCES tanker_deliveries (id),
    CONSTRAINT fk_fsp_recorded_by   FOREIGN KEY (recorded_by_user_id) REFERENCES users (id),
    CONSTRAINT chk_fsp_amount_positive  CHECK (amount > 0)
);

-- ── Bank reconciliation ─────────────────────────────────────────────────────────

CREATE TABLE bank_statement_imports (
    id                  BIGSERIAL   PRIMARY KEY,
    pump_id             BIGINT      NOT NULL,
    bank_name           VARCHAR(100)    NOT NULL,
    account_number      VARCHAR(50),
    statement_from_date DATE            NOT NULL,
    statement_to_date   DATE            NOT NULL,
    total_lines         INTEGER         NOT NULL DEFAULT 0,
    matched_lines       INTEGER         NOT NULL DEFAULT 0,
    imported_by_user_id BIGINT          NOT NULL,
    imported_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bsi_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_bsi_imported_by   FOREIGN KEY (imported_by_user_id) REFERENCES users (id)
);

CREATE TABLE bank_statement_lines (
    id                          BIGSERIAL               PRIMARY KEY,
    import_id                   BIGINT                  NOT NULL,
    txn_date                    DATE                    NOT NULL,
    narration                   TEXT,
    debit_amount                NUMERIC(14,2)           NOT NULL DEFAULT 0,
    credit_amount               NUMERIC(14,2)           NOT NULL DEFAULT 0,
    balance                     NUMERIC(14,2),
    utr_reference               VARCHAR(100),
    match_status                bank_line_match_status  NOT NULL DEFAULT 'UNMATCHED',
    matched_shift_id            BIGINT,
    matched_ancillary_sale_id   BIGINT,
    matched_payment_id          BIGINT,
    match_notes                 TEXT,
    created_at                  TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bsl_import            FOREIGN KEY (import_id) REFERENCES bank_statement_imports (id) ON DELETE CASCADE,
    CONSTRAINT fk_bsl_shift             FOREIGN KEY (matched_shift_id) REFERENCES shifts (id),
    CONSTRAINT fk_bsl_ancillary_sale    FOREIGN KEY (matched_ancillary_sale_id) REFERENCES ancillary_sales (id),
    CONSTRAINT fk_bsl_payment           FOREIGN KEY (matched_payment_id) REFERENCES credit_payments (id)
);

-- ── Async jobs & ShedLock ────────────────────────────────────────────────────────

CREATE TABLE async_jobs (
    id                  BIGSERIAL           PRIMARY KEY,
    pump_id             BIGINT              NOT NULL,
    job_type            VARCHAR(100)        NOT NULL,
    status              async_job_status    NOT NULL DEFAULT 'QUEUED',
    payload_json        JSONB,
    result_json         JSONB,
    error_message       TEXT,
    created_by_user_id  BIGINT              NOT NULL,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,

    CONSTRAINT fk_job_pump          FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_job_created_by    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
);

CREATE TABLE notification_dispatch_log (
    id                  BIGSERIAL           PRIMARY KEY,
    pump_id             BIGINT              NOT NULL,
    notification_type   notification_type   NOT NULL,
    channel             VARCHAR(30)         NOT NULL,
    recipient           VARCHAR(200)        NOT NULL,
    message             TEXT                NOT NULL,
    status              VARCHAR(30)         NOT NULL DEFAULT 'SENT',
    provider_reference  VARCHAR(200),
    sent_at             TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ndl_pump  FOREIGN KEY (pump_id) REFERENCES pump_locations (id)
);

CREATE TABLE shedlock (
    name        VARCHAR(64)     NOT NULL,
    lock_until  TIMESTAMPTZ     NOT NULL,
    locked_at   TIMESTAMPTZ     NOT NULL,
    locked_by   VARCHAR(255)    NOT NULL,

    CONSTRAINT pk_shedlock  PRIMARY KEY (name)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────

CREATE INDEX idx_users_phone  ON users (phone_number);
CREATE INDEX idx_users_role   ON users (role);
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_pumps_owner  ON pump_locations (owner_id);
CREATE INDEX idx_tanks_pump      ON underground_tanks (pump_id);
CREATE INDEX idx_tanks_pump_fuel ON underground_tanks (pump_id, fuel_type);
CREATE INDEX idx_du_pump         ON dispensary_units (pump_id, status);
CREATE INDEX idx_nozzles_du      ON nozzles (du_id, status);
CREATE INDEX idx_nozzles_tank    ON nozzles (tank_id);
CREATE INDEX idx_prices_pump_fuel ON global_fuel_prices (pump_id, fuel_type, effective_from DESC);
CREATE INDEX idx_deliveries_pump ON tanker_deliveries (pump_id);
CREATE INDEX idx_deliveries_tank ON tanker_deliveries (tank_id);
CREATE INDEX idx_lots_pump_fuel  ON inventory_lots (pump_id, fuel_type, status);
CREATE INDEX idx_lots_tank       ON inventory_lots (tank_id);
CREATE INDEX idx_lots_active     ON inventory_lots (pump_id, fuel_type) WHERE status = 'ACTIVE';
CREATE INDEX idx_consumptions_lot   ON lot_consumptions (lot_id);
CREATE INDEX idx_consumptions_shift ON lot_consumptions (shift_id);
CREATE INDEX idx_dips_pump ON dip_checks (pump_id);
CREATE INDEX idx_dips_tank ON dip_checks (tank_id);
CREATE INDEX idx_shifts_pump        ON shifts (pump_id);
CREATE INDEX idx_shifts_operator    ON shifts (operator_id);
CREATE INDEX idx_shifts_du          ON shifts (du_id);
CREATE INDEX idx_shifts_date        ON shifts (pump_id, shift_date);
CREATE INDEX idx_shifts_definition  ON shifts (shift_definition_id);
CREATE INDEX idx_shifts_pump_date_def ON shifts (pump_id, shift_date, shift_definition_id);
CREATE INDEX idx_shift_nozzles_nozzle ON shift_nozzles (nozzle_id);
CREATE INDEX idx_sfr_shift   ON shift_fuel_readings (shift_id);
CREATE INDEX idx_sfr_nozzle  ON shift_fuel_readings (nozzle_id);
CREATE INDEX idx_ftxn_shift  ON fuel_transactions (shift_id);
CREATE INDEX idx_ftxn_pump   ON fuel_transactions (pump_id);
CREATE INDEX idx_sce_shift   ON shift_credit_entries (shift_id);
CREATE INDEX idx_sce_client  ON shift_credit_entries (client_id);
CREATE INDEX idx_cc_pump     ON credit_clients (pump_id);
CREATE INDEX idx_cc_parent   ON credit_clients (parent_client_id);
CREATE UNIQUE INDEX uq_cc_root_pump_name
    ON credit_clients (pump_id, lower(name))
    WHERE parent_client_id IS NULL;
CREATE UNIQUE INDEX uq_cc_child_parent_name
    ON credit_clients (parent_client_id, lower(name))
    WHERE parent_client_id IS NOT NULL;
CREATE INDEX idx_cpay_client ON credit_payments (client_id);
CREATE INDEX idx_cpay_pump   ON credit_payments (pump_id);
CREATE INDEX idx_cic_client  ON credit_interest_charges (client_id);
CREATE INDEX idx_cic_pump    ON credit_interest_charges (pump_id);
CREATE INDEX idx_notif_pump  ON notifications (pump_id, read_at);
CREATE INDEX idx_audit_pump  ON audit_logs (pump_id, created_at DESC);
CREATE INDEX idx_login_phone_time ON login_attempts (phone_number, attempted_at DESC);
CREATE INDEX idx_login_ip_time    ON login_attempts (ip_address, attempted_at DESC);
CREATE INDEX idx_blacklist_hash   ON token_blacklist (token_hash);
CREATE INDEX idx_blacklist_expiry ON token_blacklist (expires_at);
CREATE INDEX idx_psd_pump_effective ON pump_shift_definitions (pump_id, effective_from, effective_to);
