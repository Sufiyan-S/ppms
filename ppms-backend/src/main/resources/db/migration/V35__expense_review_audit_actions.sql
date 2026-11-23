-- Expense approvals and rejections were not written to the audit log; the shared approval queue records both.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXPENSE_APPROVED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXPENSE_REJECTED';
