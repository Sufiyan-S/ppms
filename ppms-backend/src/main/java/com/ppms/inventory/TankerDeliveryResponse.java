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
    private OffsetDateTime deliveryDate;
    private String invoiceReference;
    private String loggedByUserName;
    private OffsetDateTime createdAt;
}
