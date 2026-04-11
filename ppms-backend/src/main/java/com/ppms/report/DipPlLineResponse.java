package com.ppms.report;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * A single Dip P/L entry returned as part of the balance sheet detail response
 * and the standalone dip P/L report.
 *
 * Two types:
 *   MAINTENANCE_REMOVAL — physical fuel removed from tank for maintenance/testing. Always a loss.
 *   DIP_CHECK           — dipstick variance reading (measuredQty − systemStock). Can be a surplus
 *                         gain (positive) or shortage loss (negative).
 *
 * monetaryAmount convention: negative = loss, positive = gain.
 */
@Data
@Builder
public class DipPlLineResponse {

    /** "DIP_CHECK" or "MAINTENANCE_REMOVAL" */
    private String type;

    private String fuelType;

    /**
     * Litres (signed):
     *   DIP_CHECK:            measuredQuantity − systemStock (+surplus, −shortage)
     *   MAINTENANCE_REMOVAL:  litresRemoved (positive; represents physical removal)
     */
    private BigDecimal litres;

    /**
     * Monetary impact (signed):
     *   DIP_CHECK:            litres × currentFuelPrice (+gain, −loss)
     *   MAINTENANCE_REMOVAL:  −monetaryLoss (always negative)
     */
    private BigDecimal monetaryAmount;

    /** Timestamp the entry was recorded. Used for chronological sorting. */
    private OffsetDateTime recordedAt;

    /** DIP_CHECK: notes field; MAINTENANCE_REMOVAL: reason field. May be null. */
    private String notes;
}
