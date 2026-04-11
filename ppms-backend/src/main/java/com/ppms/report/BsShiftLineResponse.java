package com.ppms.report;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class BsShiftLineResponse {
    private Long     shiftId;
    private String   operatorName;
    private Integer  nozzleNumber;
    private String   fuelTypesSummary;
    private BigDecimal litresSold;
    private BigDecimal expectedRevenue;
    private BigDecimal cashCollected;
    private BigDecimal upiCollected;
    private BigDecimal cardCollected;
    private BigDecimal fleetCardCollected;
    private BigDecimal creditAmount;
    private BigDecimal discrepancy;
}
