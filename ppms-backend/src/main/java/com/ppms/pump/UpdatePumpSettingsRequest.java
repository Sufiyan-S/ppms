package com.ppms.pump;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** A missing value is left unchanged; an empty GST text value clears it. */
public record UpdatePumpSettingsRequest(
        BigDecimal discrepancyEscalationThreshold,
        BigDecimal expenseApprovalThreshold,
        String gstin,
        @Size(max = 150, message = "Legal name must be at most 150 characters") String legalName,
        @Size(max = 60, message = "State name must be at most 60 characters") String stateName,
        String invoicePrefix
) {}
