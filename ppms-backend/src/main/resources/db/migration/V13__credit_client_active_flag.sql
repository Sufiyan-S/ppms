-- Soft-disable flag for credit clients.
-- Disabled clients are hidden from shift credit entry dropdowns and shown at the
-- bottom of the Clients list. All historical data is preserved.
ALTER TABLE credit_clients
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
