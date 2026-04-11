package com.ppms.fuel;

import java.math.BigDecimal;

/**
 * Returned as HTTP 409 when a new fuel price deviates more than 15% from the last recorded price.
 * The frontend must show a confirmation dialog and re-submit the request with confirmed=true.
 * Spec: Business Rule 37, Section 6.12.
 */
public record PriceDeviationWarning(
        String message,
        BigDecimal lastPrice,
        BigDecimal newPrice,
        BigDecimal deviationPercent
) {}
