package com.ppms.pump;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Data
@Builder
public class TankResponse {

    private Long id;
    private Long pumpId;
    private String tankIdentifier;
    private String fuelType;
    private BigDecimal capacity;
    private BigDecimal currentStock;
    private BigDecimal dipTolerance;
    private String status;
    private OffsetDateTime createdAt;
}
