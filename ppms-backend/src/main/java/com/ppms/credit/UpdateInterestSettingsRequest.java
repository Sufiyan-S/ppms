package com.ppms.credit;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/**
 * Request body for PATCH /api/pumps/{pumpId}/credit-ledger/clients/{clientId}/interest-settings
 */
public record UpdateInterestSettingsRequest(

        /**
         * Simple interest rate per calendar month, as a percentage.
         * 0.00 = no interest charged. Max 100% per month (safety cap).
         */
        @NotNull
        @DecimalMin("0.00")
        @DecimalMax("100.00")
        BigDecimal monthlyInterestRate,

        /**
         * Days after the first credit entry before interest starts accruing.
         * Minimum 0 (interest starts immediately from day 0).
         * Default in DB is 1 (starts the day after first sale).
         */
        @NotNull
        @Min(0)
        Integer interestGraceDays
) {}
