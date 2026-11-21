-- BCrypt hash of the PIN a credit client uses with the public balance page; NULL disables the lookup.
ALTER TABLE credit_clients ADD COLUMN IF NOT EXISTS portal_pin_hash VARCHAR(100);
