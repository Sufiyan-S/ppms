-- Numbered GST tax invoices for credit customers.
-- Invoices and their lines are snapshots taken at issue time and are never edited or deleted;
-- cancelling keeps the row (and its number) and only frees the sales for a new invoice.

ALTER TABLE pump_locations
    ADD COLUMN IF NOT EXISTS gstin          VARCHAR(15),
    ADD COLUMN IF NOT EXISTS legal_name     VARCHAR(150),
    ADD COLUMN IF NOT EXISTS state_name     VARCHAR(60),
    ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(5);

ALTER TABLE pump_locations
    ADD CONSTRAINT chk_pump_gstin_format
        CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
    ADD CONSTRAINT chk_pump_invoice_prefix_format
        CHECK (invoice_prefix IS NULL OR invoice_prefix ~ '^[A-Z0-9]{1,5}$');

ALTER TABLE credit_clients
    ADD COLUMN IF NOT EXISTS gstin           VARCHAR(15),
    ADD COLUMN IF NOT EXISTS billing_address TEXT;

ALTER TABLE credit_clients
    ADD CONSTRAINT chk_cc_gstin_format
        CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

ALTER TABLE ancillary_products
    ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8);

ALTER TABLE ancillary_products
    ADD CONSTRAINT chk_ap_hsn_format CHECK (hsn_code IS NULL OR hsn_code ~ '^[0-9]{4,8}$');

-- One counter per pump per financial year; the row is locked while an invoice takes its number,
-- so numbers are consecutive with no gaps (a DB sequence would leave gaps on rollback).
CREATE TABLE invoice_sequences (
    pump_id         BIGINT      NOT NULL,
    financial_year  VARCHAR(7)  NOT NULL,
    next_number     INTEGER     NOT NULL DEFAULT 1,

    CONSTRAINT pk_invoice_sequences     PRIMARY KEY (pump_id, financial_year),
    CONSTRAINT fk_iseq_pump             FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT chk_iseq_fy_format       CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
    CONSTRAINT chk_iseq_next_positive   CHECK (next_number > 0)
);

CREATE TABLE credit_invoices (
    id                          BIGSERIAL       PRIMARY KEY,
    pump_id                     BIGINT          NOT NULL,
    client_id                   BIGINT          NOT NULL,
    invoice_number              VARCHAR(16)     NOT NULL,
    financial_year              VARCHAR(7)      NOT NULL,
    sequence_number             INTEGER         NOT NULL,
    period_from                 DATE            NOT NULL,
    period_to                   DATE            NOT NULL,
    issued_on                   DATE            NOT NULL,
    seller_trade_name           VARCHAR(150)    NOT NULL,
    seller_legal_name           VARCHAR(150)    NOT NULL,
    seller_address              TEXT,
    seller_gstin                VARCHAR(15)     NOT NULL,
    seller_state_code           VARCHAR(2)      NOT NULL,
    seller_state_name           VARCHAR(60),
    buyer_name                  VARCHAR(150)    NOT NULL,
    buyer_address               TEXT,
    buyer_gstin                 VARCHAR(15),
    buyer_state_code            VARCHAR(2)      NOT NULL,
    place_of_supply_state_code  VARCHAR(2)      NOT NULL,
    fuel_total                  NUMERIC(14,2)   NOT NULL,
    taxable_total               NUMERIC(14,2)   NOT NULL,
    cgst_total                  NUMERIC(14,2)   NOT NULL,
    sgst_total                  NUMERIC(14,2)   NOT NULL,
    igst_total                  NUMERIC(14,2)   NOT NULL,
    grand_total                 NUMERIC(14,2)   NOT NULL,
    status                      VARCHAR(20)     NOT NULL DEFAULT 'ISSUED',
    cancel_reason               TEXT,
    cancelled_by                BIGINT,
    cancelled_at                TIMESTAMPTZ,
    created_by                  BIGINT          NOT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_cinv_pump             FOREIGN KEY (pump_id) REFERENCES pump_locations (id),
    CONSTRAINT fk_cinv_client           FOREIGN KEY (client_id) REFERENCES credit_clients (id),
    CONSTRAINT fk_cinv_created_by       FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_cinv_cancelled_by     FOREIGN KEY (cancelled_by) REFERENCES users (id),
    CONSTRAINT uq_cinv_pump_number      UNIQUE (pump_id, invoice_number),
    CONSTRAINT uq_cinv_pump_fy_sequence UNIQUE (pump_id, financial_year, sequence_number),
    CONSTRAINT chk_cinv_status          CHECK (status IN ('ISSUED', 'CANCELLED')),
    CONSTRAINT chk_cinv_period          CHECK (period_from <= period_to),
    CONSTRAINT chk_cinv_sequence        CHECK (sequence_number > 0),
    CONSTRAINT chk_cinv_totals_non_neg  CHECK (fuel_total >= 0 AND taxable_total >= 0 AND cgst_total >= 0
                                               AND sgst_total >= 0 AND igst_total >= 0 AND grand_total > 0),
    CONSTRAINT chk_cinv_cancel_fields   CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL
                                               AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL))
);

CREATE INDEX idx_cinv_pump_issued ON credit_invoices (pump_id, issued_on DESC, id DESC);
CREATE INDEX idx_cinv_client ON credit_invoices (client_id, issued_on DESC);

-- is_active mirrors "the invoice is ISSUED"; cancelling clears it so the sale can be billed again.
CREATE TABLE credit_invoice_lines (
    id                      BIGSERIAL       PRIMARY KEY,
    invoice_id              BIGINT          NOT NULL,
    line_type               VARCHAR(20)     NOT NULL,
    source_id               BIGINT          NOT NULL,
    sale_date               DATE            NOT NULL,
    bill_no                 VARCHAR(50),
    description             VARCHAR(300)    NOT NULL,
    vehicle_registration    VARCHAR(20),
    hsn_code                VARCHAR(8),
    quantity                INTEGER,
    rate                    NUMERIC(12,2),
    taxable_value           NUMERIC(14,2),
    gst_rate                NUMERIC(5,2),
    cgst                    NUMERIC(12,2)   NOT NULL DEFAULT 0,
    sgst                    NUMERIC(12,2)   NOT NULL DEFAULT 0,
    igst                    NUMERIC(12,2)   NOT NULL DEFAULT 0,
    line_total              NUMERIC(14,2)   NOT NULL,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_cinvl_invoice         FOREIGN KEY (invoice_id) REFERENCES credit_invoices (id),
    CONSTRAINT chk_cinvl_type           CHECK (line_type IN ('FUEL', 'ANCILLARY')),
    CONSTRAINT chk_cinvl_amounts        CHECK (cgst >= 0 AND sgst >= 0 AND igst >= 0 AND line_total >= 0),
    CONSTRAINT chk_cinvl_fuel_untaxed   CHECK (line_type <> 'FUEL' OR (cgst = 0 AND sgst = 0 AND igst = 0)),
    CONSTRAINT chk_cinvl_ancillary_tax  CHECK (line_type <> 'ANCILLARY'
                                               OR (quantity > 0 AND taxable_value IS NOT NULL AND gst_rate IS NOT NULL))
);

CREATE INDEX idx_cinvl_invoice ON credit_invoice_lines (invoice_id);

-- A sale can be on only one issued invoice at a time.
CREATE UNIQUE INDEX uq_cinvl_active_source ON credit_invoice_lines (line_type, source_id) WHERE is_active;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'CREDIT_INVOICE_ISSUED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'CREDIT_INVOICE_CANCELLED';
