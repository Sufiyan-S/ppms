package com.ppms.report;

import com.ppms.fuel.FuelType;
import com.ppms.report.BalanceSheetInputsCollector.CostOfGoods;
import com.ppms.report.BalanceSheetInputsCollector.Deliveries;
import com.ppms.report.BalanceSheetInputsCollector.DipLosses;
import com.ppms.report.BalanceSheetInputsCollector.FuelSales;
import com.ppms.report.BalanceSheetInputsCollector.StockLevels;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Builds one balance sheet line per fuel type that was sold, delivered, in stock or lost in the period. */
final class BalanceSheetFuelLineBuilder {

    private BalanceSheetFuelLineBuilder() {
    }

    static List<BsFuelLine> build(Long balanceSheetId, FuelSales fuelSales, CostOfGoods costOfGoods,
                                  Deliveries deliveries, StockLevels stock, DipLosses dipLosses,
                                  Map<FuelType, BigDecimal> currentPriceByFuel,
                                  Map<FuelType, BigDecimal> creditSoldByFuel,
                                  Map<FuelType, BigDecimal> dipVarianceByFuel) {
        Set<FuelType> fuelTypes = new LinkedHashSet<>();
        fuelTypes.addAll(fuelSales.litresByFuel().keySet());
        fuelTypes.addAll(deliveries.litresByFuel().keySet());
        fuelTypes.addAll(stock.openingByFuel().keySet());
        fuelTypes.addAll(stock.closingByFuel().keySet());
        fuelTypes.addAll(dipLosses.litresByFuel().keySet());

        List<BsFuelLine> fuelLines = new ArrayList<>();
        for (FuelType fuelType : fuelTypes) {
            BigDecimal expectedRevenue = money(fuelSales.expectedRevenueByFuel(), fuelType);
            BigDecimal cost = money(costOfGoods.byFuel(), fuelType);
            fuelLines.add(BsFuelLine.builder()
                    .balanceSheetId(balanceSheetId)
                    .fuelType(fuelType.name())
                    .openingStock(litres(stock.openingByFuel(), fuelType))
                    .closingStock(litres(stock.closingByFuel(), fuelType))
                    .deliveredLitres(litres(deliveries.litresByFuel(), fuelType))
                    .deliveredCost(money(deliveries.costByFuel(), fuelType))
                    .soldLitres(litres(fuelSales.litresByFuel(), fuelType))
                    // Current price at generation, for display only; revenue uses each reading's price snapshot.
                    .sellingPrice(currentPriceByFuel.getOrDefault(fuelType, BigDecimal.ZERO))
                    .expectedRevenue(expectedRevenue)
                    .costOfGoods(cost)
                    .grossProfit(expectedRevenue.subtract(cost))
                    .creditSoldAmount(money(creditSoldByFuel, fuelType))
                    .stockVariance(litres(dipVarianceByFuel, fuelType))
                    .dipLossLitres(litres(dipLosses.litresByFuel(), fuelType))
                    .dipLossAmount(money(dipLosses.amountByFuel(), fuelType))
                    .build());
        }
        return fuelLines;
    }

    private static BigDecimal money(Map<FuelType, BigDecimal> byFuel, FuelType fuelType) {
        return byFuel.getOrDefault(fuelType, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal litres(Map<FuelType, BigDecimal> byFuel, FuelType fuelType) {
        return byFuel.getOrDefault(fuelType, BigDecimal.ZERO).setScale(3, RoundingMode.HALF_UP);
    }
}
