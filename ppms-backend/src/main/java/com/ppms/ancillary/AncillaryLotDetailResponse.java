package com.ppms.ancillary;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Read model for a single FIFO inventory lot, returned by GET .../lots.
 * Includes invoice reference from the linked delivery record.
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AncillaryLotDetailResponse {

    private Long id;
    private Long deliveryId;
    private LocalDate deliveryDate;
    /** Invoice / bill number from the stock-in delivery. Null if not recorded. */
    private String invoiceReference;
    private BigDecimal costPricePerUnit;
    private Integer remainingQuantity;
    private Integer originalQuantity;
    /** ACTIVE or EXHAUSTED */
    private String status;
    private OffsetDateTime createdAt;
}
