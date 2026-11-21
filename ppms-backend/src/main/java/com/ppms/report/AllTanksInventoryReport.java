package com.ppms.report;

import java.math.BigDecimal;
import java.util.List;

public record AllTanksInventoryReport(
        Long pumpId,
        List<TankSection> tanks,
        List<CrossTankSummaryLine> crossTankSummary) {

    public record TankSection(
            Long tankId,
            String tankIdentifier,
            String fuelType,
            int lotCount,
            BigDecimal totalRemaining,
            BigDecimal weightedAvgCostPerUnit,   // null when totalRemaining == 0
            BigDecimal totalStockValue,
            List<InventoryLotsReport.LotLine> lots) {}

    public record CrossTankSummaryLine(
            String fuelType,
            BigDecimal totalRemaining,
            BigDecimal weightedAvgCostPerUnit,
            BigDecimal totalStockValue) {}
}
