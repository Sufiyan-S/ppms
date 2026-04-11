-- V4: Expense DRAFT status + payroll deductions + net pay
-- Ticket context: spec v4.0 compliance — missing features A and E

-- ── A: Add DRAFT to the expense approval status enum ─────────────────────────
-- DRAFT = saved but not yet submitted for approval.
-- Only DRAFT expenses can be deleted; once submitted the record is permanent.
ALTER TYPE expense_approval_status ADD VALUE IF NOT EXISTS 'DRAFT';

-- ── A: Track who submitted a DRAFT expense and when ──────────────────────────
-- NULL for expenses created before this migration (they were auto-submitted on creation).
ALTER TABLE pump_expenses
    ADD COLUMN IF NOT EXISTS submitted_by_user_id BIGINT,
    ADD COLUMN IF NOT EXISTS submitted_at          TIMESTAMPTZ;

-- ── E: Payroll deductions and net pay ────────────────────────────────────────
-- deductions = sum of salary-deduction discrepancy amounts linked to this pay period.
-- net_pay    = gross_amount - deductions.
-- Both default to 0 so existing records remain valid (no deductions were tracked before).
ALTER TABLE payroll_records
    ADD COLUMN IF NOT EXISTS deductions NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS net_pay    NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Back-fill net_pay for existing records (all had zero deductions so net = gross).
UPDATE payroll_records SET net_pay = gross_amount WHERE net_pay = 0;
