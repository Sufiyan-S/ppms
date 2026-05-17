-- Tanker (truck) configuration per pump.
-- Each tanker has a fixed fuel capacity (e.g. 12,000L, 14,000L, 18,000L).
-- When recording a batch delivery the total quantity must match the selected
-- tanker's capacity exactly (enforced at the application layer).

CREATE TABLE tankers (
    id              BIGSERIAL    PRIMARY KEY,
    pump_id         BIGINT       NOT NULL REFERENCES pump_locations(id),
    name            VARCHAR(100) NOT NULL,
    capacity_litres NUMERIC(10, 2) NOT NULL,
    tanker_type     VARCHAR(20)  NOT NULL DEFAULT 'COMPANY'
                    CHECK (tanker_type IN ('OWN', 'COMPANY')),
    is_default      BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tankers_pump_id ON tankers(pump_id);

-- At most one active default tanker per pump
CREATE UNIQUE INDEX idx_tankers_pump_default
    ON tankers(pump_id)
    WHERE is_default = true AND is_active = true;

-- Reference from deliveries to the tanker that made the delivery (nullable —
-- existing deliveries and entries that skip tanker selection have no reference).
ALTER TABLE tanker_deliveries
    ADD COLUMN IF NOT EXISTS tanker_id   BIGINT REFERENCES tankers(id),
    ADD COLUMN IF NOT EXISTS tanker_name VARCHAR(100);
