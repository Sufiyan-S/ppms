-- One invoice may fill several tanks of the same fuel; a tank still cannot appear twice on one invoice.
DROP INDEX IF EXISTS uq_delivery_pump_invoice_fuel;

CREATE UNIQUE INDEX uq_delivery_pump_invoice_tank
    ON tanker_deliveries (pump_id, invoice_reference, tank_id)
    WHERE invoice_reference IS NOT NULL;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DELIVERY_UPDATED';
