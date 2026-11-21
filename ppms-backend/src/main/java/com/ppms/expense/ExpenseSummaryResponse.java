package com.ppms.expense;

import java.math.BigDecimal;

public record ExpenseSummaryResponse(
        BigDecimal approvedTotal,
        long pendingCount,
        BigDecimal pendingTotal
) {}
