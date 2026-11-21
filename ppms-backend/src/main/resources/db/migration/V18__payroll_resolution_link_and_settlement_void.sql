-- Shifts whose discrepancy a payroll draft resolved as SALARY_DEDUCTION, with the status to restore if the draft is deleted.
CREATE TABLE payroll_resolved_shifts (
    id              BIGSERIAL   PRIMARY KEY,
    payroll_id      BIGINT      NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
    shift_id        BIGINT      NOT NULL REFERENCES shifts(id),
    previous_status VARCHAR(50) NOT NULL,
    CONSTRAINT uq_payroll_resolved_shift UNIQUE (payroll_id, shift_id)
);

CREATE INDEX idx_payroll_resolved_shifts_payroll ON payroll_resolved_shifts(payroll_id);

-- Deductions that exceeded gross pay; net pay is floored at zero and this amount is carried for the owner to see.
ALTER TABLE payroll_records ADD COLUMN uncovered_deductions NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE payment_settlements
    ADD COLUMN void_status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN void_reason       TEXT,
    ADD COLUMN voided_by_user_id BIGINT,
    ADD COLUMN voided_at         TIMESTAMPTZ;
