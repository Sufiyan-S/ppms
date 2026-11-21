package com.ppms.pump;

import java.math.BigDecimal;

public record PumpOverviewTotals(
        BigDecimal todaySales,
        long openShiftCount,
        long overdueShiftCount,
        long lowStockTankCount,
        long stalePricePumpCount
) {
}
