package com.ppms.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ProfitLossReport(
        Long pumpId,
        LocalDate from,
        LocalDate to,
        int totalShifts,
        BigDecimal totalRevenue,
        BigDecimal totalCogs,
        BigDecimal grossProfit,
        BigDecimal totalCashRevenue,
        BigDecimal totalUpiRevenue,
        BigDecimal totalCardRevenue,
        BigDecimal totalCreditRevenue,
        List<FuelLine> byFuelType) {

    public record FuelLine(
            String fuelType,
            BigDecimal revenue,
            BigDecimal cogs,
            BigDecimal grossProfit,
            BigDecimal grossMarginPerLitre,    // null when totalUnitsSold == 0
            List<LotCostLine> lotCostLines) {}

    public record LotCostLine(
            Long lotId,
            String tankerReference,
            LocalDate deliveryDate,
            BigDecimal costPricePerUnit,
            BigDecimal quantityConsumed,
            BigDecimal lotCost) {}
}
