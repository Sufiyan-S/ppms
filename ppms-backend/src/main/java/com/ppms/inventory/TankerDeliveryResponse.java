package com.ppms.inventory;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Data
@Builder
public class TankerDeliveryResponse {

    private Long id;
    private Long pumpId;
    private Long tankId;
    private String tankIdentifier;
    private String fuelType;
    private BigDecimal quantityDelivered;
    private BigDecimal costPricePerUnit;
    private BigDecimal totalCost;
    /** Actual bill amount as entered by the user. Null if not provided. May differ from totalCost due to freight or other charges. */
    private BigDecimal billTotal;
    /** Name of the tanker (truck) that made this delivery. Null for legacy deliveries. */
    private String tankerName;
    private OffsetDateTime deliveryDate;
    private String invoiceReference;
    private String loggedByUserName;
    private OffsetDateTime createdAt;
}
