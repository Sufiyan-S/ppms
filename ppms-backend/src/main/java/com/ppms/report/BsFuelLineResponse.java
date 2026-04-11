package com.ppms.report;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class BsFuelLineResponse {
    private String   fuelType;
    private BigDecimal openingStock;
    private BigDecimal closingStock;
    private BigDecimal deliveredLitres;
    private BigDecimal deliveredCost;
    private BigDecimal soldLitres;
    private BigDecimal sellingPrice;
    private BigDecimal expectedRevenue;
    private BigDecimal costOfGoods;
    private BigDecimal grossProfit;
    private BigDecimal creditSoldAmount;
    private BigDecimal stockVariance;
    private BigDecimal dipLossLitres;
    private BigDecimal dipLossAmount;
}
