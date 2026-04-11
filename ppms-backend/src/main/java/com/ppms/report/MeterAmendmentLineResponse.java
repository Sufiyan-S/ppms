package com.ppms.report;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Represents a single meter reading amendment that occurred during a balance sheet's report period.
 * Included in BalanceSheetDetailResponse for full operational transparency.
 * No financial impact — informational only.
 */
@Data
@Builder
public class MeterAmendmentLineResponse {

    private Long   id;
    private String fuelType;
    /** RESET or CUSTOM_READING */
    private String adjustmentType;
    private BigDecimal previousReading;
    private BigDecimal newReading;
    /** Signed delta: newReading − previousReading. Negative if reset/reduced. */
    private BigDecimal delta;
    private String reason;
    private String recordedByUserName;
    private OffsetDateTime createdAt;
}
