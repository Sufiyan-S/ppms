package com.ppms.pump;

import java.math.BigDecimal;

public record PumpOverviewSummary(
        Long pumpId,
        String name,
        boolean enabled,
        BigDecimal todaySales,
        long openShiftCount,
        long overdueShiftCount,
        long lowStockTankCount,
        boolean fuelPricesStale
) {
}
