-- V2: Allow multiple nozzles with the same fuel type on a single DU.
--
-- Real-world MPD machines commonly have several nozzles all dispensing the same
-- product (e.g. 4 Petrol nozzles on one machine so multiple operators can serve
-- customers simultaneously). The original unique constraint was overly restrictive.
--
-- The nozzle_number uniqueness per DU (uq_nozzle_du_number) is kept — each nozzle
-- position must still be unique within its DU.

ALTER TABLE nozzles DROP CONSTRAINT IF EXISTS uq_nozzle_du_fuel;
