-- Meter readings entered with a dip check taken while shifts were open on the tank's nozzles.
-- Fuel sold since each shift opened has not left tank stock yet, so it is subtracted before the variance is taken.
CREATE TABLE dip_check_nozzle_readings (
    id              BIGSERIAL       PRIMARY KEY,
    dip_check_id    BIGINT          NOT NULL,
    shift_id        BIGINT          NOT NULL,
    nozzle_id       BIGINT          NOT NULL,
    opening_reading NUMERIC(14,3)   NOT NULL,
    meter_reading   NUMERIC(14,3)   NOT NULL,
    units_sold      NUMERIC(14,3)   NOT NULL,

    CONSTRAINT fk_dcnr_dip_check FOREIGN KEY (dip_check_id) REFERENCES dip_checks (id) ON DELETE CASCADE,
    CONSTRAINT fk_dcnr_shift     FOREIGN KEY (shift_id)     REFERENCES shifts (id),
    CONSTRAINT fk_dcnr_nozzle    FOREIGN KEY (nozzle_id)    REFERENCES nozzles (id),
    CONSTRAINT uq_dcnr_dip_check_nozzle UNIQUE (dip_check_id, nozzle_id),
    CONSTRAINT chk_dcnr_units_sold_not_negative CHECK (units_sold >= 0)
);

CREATE INDEX idx_dcnr_dip_check ON dip_check_nozzle_readings (dip_check_id);

-- Fuel drained for maintenance or testing now leaves the tank's lots; older entries keep a null tank.
ALTER TYPE lot_consumption_source ADD VALUE IF NOT EXISTS 'MAINTENANCE_REMOVAL';

ALTER TABLE fuel_dip_entries
    ADD COLUMN tank_id BIGINT,
    ADD CONSTRAINT fk_fde_tank FOREIGN KEY (tank_id) REFERENCES underground_tanks (id);

ALTER TABLE lot_consumptions
    ADD COLUMN fuel_dip_entry_id BIGINT,
    ADD CONSTRAINT fk_consumption_fuel_dip_entry FOREIGN KEY (fuel_dip_entry_id) REFERENCES fuel_dip_entries (id);

CREATE INDEX idx_consumptions_fuel_dip_entry ON lot_consumptions (fuel_dip_entry_id) WHERE fuel_dip_entry_id IS NOT NULL;
