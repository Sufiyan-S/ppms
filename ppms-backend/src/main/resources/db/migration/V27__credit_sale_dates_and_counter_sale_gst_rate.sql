-- Credit sales keep the business day they belong to and counter sales keep the GST rate they were sold at,
-- so invoices, ledgers and interest no longer depend on when an entry was typed in or on today's product rate.

-- Fuel credit entries: a backfilled shift's entries belong to the shift's day; live entries to the IST day they were made.
ALTER TABLE shift_credit_entries ADD COLUMN sale_date DATE;

UPDATE shift_credit_entries e
SET sale_date = CASE
                    WHEN s.is_backfilled THEN s.shift_date
                    ELSE (e.created_at AT TIME ZONE 'Asia/Kolkata')::date
                END
FROM shifts s
WHERE s.id = e.shift_id;

ALTER TABLE shift_credit_entries ALTER COLUMN sale_date SET NOT NULL;

CREATE INDEX idx_sce_client_sale_date ON shift_credit_entries (client_id, sale_date);

-- Counter sales: existing sales take their product's current rate, the best record available.
ALTER TABLE ancillary_sales ADD COLUMN gst_rate_percent NUMERIC(5,2);

UPDATE ancillary_sales s
SET gst_rate_percent = p.gst_rate_percent
FROM ancillary_products p
WHERE p.id = s.product_id;

ALTER TABLE ancillary_sales ALTER COLUMN gst_rate_percent SET NOT NULL;

ALTER TABLE ancillary_sales
    ADD CONSTRAINT chk_asale_gst_rate_non_neg CHECK (gst_rate_percent >= 0);

-- Credit counter sales are now summed into every client balance.
CREATE INDEX idx_asale_credit_client ON ancillary_sales (client_id, sale_date) WHERE payment_mode = 'CREDIT';
