package com.ppms.report;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record InventoryLotsReport(
        Long tankId,
        int totalLots,
        BigDecimal totalRemaining,
        BigDecimal weightedAvgCostPerUnit,   // null when totalRemaining == 0
        BigDecimal totalStockValue,
        List<LotLine> lots) {

    public record LotLine(
            Long lotId,
            String tankerReference,
            String fuelType,
            java.time.OffsetDateTime deliveryDate,
            BigDecimal originalQuantity,
            BigDecimal remainingQuantity,
            BigDecimal totalConsumed,
            BigDecimal costPricePerUnit,
            BigDecimal totalCogsConsumed,
            String status,
            Boolean isDipAdjustment,
            List<ConsumptionLine> consumptions) {}

    public record ConsumptionLine(
            Long id,
            String sourceType,
            Long shiftId,
            String shiftName,
            BigDecimal quantityConsumed,
            BigDecimal costPricePerUnit,
            BigDecimal totalCost,
            java.time.OffsetDateTime consumedAt) {}
}
