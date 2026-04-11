package com.ppms.inventory;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class TankStockResponse {

    private Long tankId;
    private String tankIdentifier;
    private String fuelType;
    private BigDecimal capacity;
    private BigDecimal currentStock;
    private BigDecimal stockPercentage;     // 0–100, one decimal place
    private boolean lowStock;               // true when stockPercentage < 20
    private BigDecimal dipTolerance;
    private Long pumpId;
    private String status;                  // ACTIVE or INACTIVE
}
