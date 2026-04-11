package com.ppms.user;

public enum UserRole {
    SUPER_ADMIN,  // Platform-level role — bypasses all pump guards; onboards pump owners
    OWNER,        // Owns one or more pumps; can manage all staff at their pumps
    ADMIN,        // Scoped to one pump; can create operators and managers at that pump
    MANAGER,
    OPERATOR,
    ACCOUNTANT    // Read-only financial access: balance sheets, expenses, credit ledger, payroll, audit logs
}
