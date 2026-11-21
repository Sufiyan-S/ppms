-- Bumped on every password change/reset; JWTs carrying an older version are rejected.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Store only the SHA-256 hash of password reset tokens. Existing rows are hashed in place
-- (lower-case canonical UUID text, matching TokenHashing.sha256Hex(uuid.toString())),
-- so links already emailed and still unexpired keep working.
ALTER TABLE password_reset_tokens ADD COLUMN token_hash VARCHAR(64);

UPDATE password_reset_tokens
SET token_hash = encode(sha256(convert_to(token::text, 'UTF8')), 'hex');

ALTER TABLE password_reset_tokens ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE password_reset_tokens ADD CONSTRAINT uq_password_reset_tokens_token_hash UNIQUE (token_hash);
ALTER TABLE password_reset_tokens DROP COLUMN token;
