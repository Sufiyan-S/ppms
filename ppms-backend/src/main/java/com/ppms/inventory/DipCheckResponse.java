package com.ppms.inventory;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Data
@Builder
public class DipCheckResponse {

    private Long id;
    private Long tankId;
    private String tankIdentifier;
    private String fuelType;
    private BigDecimal measuredQuantity;
    private BigDecimal systemStock;
    private BigDecimal variance;        // positive = more fuel found, negative = shortage
    private String notes;
    private OffsetDateTime checkedAt;
    private String loggedByUserName;
    private String checkedByUserName;   // operator who physically took the reading
    private OffsetDateTime createdAt;

    /** WITHIN_TOLERANCE | PENDING_REVIEW | REVIEWED */
    private String status;
    private OffsetDateTime reviewedAt;
    private String reviewedByUserName;
}
