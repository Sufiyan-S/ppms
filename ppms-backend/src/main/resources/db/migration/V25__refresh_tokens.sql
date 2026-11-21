-- Rotating refresh tokens. Only the SHA-256 hash is stored; the raw value lives only in the browser cookie.
-- Every token issued from one login shares a family_id, so reuse of an old token can revoke the whole chain.
CREATE TABLE refresh_tokens (
    id                 BIGSERIAL   PRIMARY KEY,
    user_id            BIGINT      NOT NULL,
    token_hash         VARCHAR(64) NOT NULL,
    family_id          UUID        NOT NULL,
    token_version      INTEGER     NOT NULL,
    expires_at         TIMESTAMPTZ NOT NULL,
    family_expires_at  TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at            TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ,

    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_tokens_family_id  ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
CREATE INDEX idx_refresh_tokens_revoked_at ON refresh_tokens (revoked_at) WHERE revoked_at IS NOT NULL;
