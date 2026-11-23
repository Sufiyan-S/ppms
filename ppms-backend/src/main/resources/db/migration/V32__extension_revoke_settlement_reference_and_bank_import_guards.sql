-- 1. A credit extension can be revoked before it expires; the row keeps who revoked it, when and why.
ALTER TYPE credit_extension_status ADD VALUE IF NOT EXISTS 'REVOKED';

ALTER TABLE credit_extensions
    ADD COLUMN IF NOT EXISTS revoked_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_by_user_id  BIGINT,
    ADD COLUMN IF NOT EXISTS revoke_reason       TEXT;

ALTER TABLE credit_extensions
    ADD CONSTRAINT fk_cext_revoked_by FOREIGN KEY (revoked_by_user_id) REFERENCES users (id),
    ADD CONSTRAINT chk_cext_revoke_fields
        CHECK ((revoked_at IS NULL) = (revoked_by_user_id IS NULL)
               AND (revoked_at IS NULL) = (revoke_reason IS NULL));

-- 2. A settlement may carry the bank's reference (UTR); one active settlement per reference per pump.
ALTER TABLE payment_settlements ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(100);

CREATE UNIQUE INDEX uq_payment_settlements_pump_bank_reference
    ON payment_settlements (pump_id, UPPER(bank_reference))
    WHERE bank_reference IS NOT NULL AND void_status = 'ACTIVE';

-- 3. The same statement file cannot be imported twice for a pump (earlier imports have no hash).
ALTER TABLE bank_statement_imports ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

CREATE UNIQUE INDEX uq_bank_statement_imports_pump_file_hash
    ON bank_statement_imports (pump_id, file_hash)
    WHERE file_hash IS NOT NULL;

-- 4. A credit payment is matched to one bank line only. Where an earlier mistake linked one payment to
--    several lines, the oldest line keeps the link and the others go back to UNMATCHED with a note.
UPDATE bank_statement_lines l
SET match_status       = 'UNMATCHED',
    matched_payment_id = NULL,
    match_notes        = TRIM(BOTH ' ' FROM COALESCE(l.match_notes, '') || ' [Unlinked: credit payment #'
                             || l.matched_payment_id || ' is matched to bank line #' || first_line.id || ']')
FROM (SELECT matched_payment_id, MIN(id) AS id
      FROM bank_statement_lines
      WHERE matched_payment_id IS NOT NULL
      GROUP BY matched_payment_id
      HAVING COUNT(*) > 1) first_line
WHERE l.matched_payment_id = first_line.matched_payment_id
  AND l.id <> first_line.id;

UPDATE bank_statement_imports i
SET matched_lines = (SELECT COUNT(*) FROM bank_statement_lines l
                     WHERE l.import_id = i.id AND l.match_status = 'MATCHED');

CREATE UNIQUE INDEX uq_bank_statement_lines_matched_payment
    ON bank_statement_lines (matched_payment_id)
    WHERE matched_payment_id IS NOT NULL;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'USER_PUMP_CHANGED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'CREDIT_EXTENSION_REVOKED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTEREST_RECALCULATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PUMP_UPDATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PUMP_SUSPENDED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PUMP_ENABLED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'OWNER_ONBOARDED';
