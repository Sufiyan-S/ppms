package com.ppms.pump;

import java.math.BigDecimal;

public record UpdatePumpSettingsRequest(
        BigDecimal discrepancyEscalationThreshold,
        BigDecimal expenseApprovalThreshold
) {}
