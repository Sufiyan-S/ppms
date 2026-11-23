-- Stored results of writes sent with an Idempotency-Key header (close shift, handover, credit entry), so a retry
-- after a lost response replays the first result instead of acting twice. Rows older than 48 hours are deleted daily.
CREATE TABLE idempotency_keys (
    id               BIGSERIAL    PRIMARY KEY,
    key              VARCHAR(128) NOT NULL,
    user_id          BIGINT       NOT NULL,
    endpoint         VARCHAR(255) NOT NULL,
    request_hash     VARCHAR(64)  NOT NULL,
    response_status  INTEGER      NOT NULL,
    response_body    JSONB        NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_idempotency_keys_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uq_idempotency_keys_user_key UNIQUE (user_id, key)
);

CREATE INDEX idx_idempotency_keys_created_at ON idempotency_keys (created_at);
