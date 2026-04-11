package com.ppms.report;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Service
@RequiredArgsConstructor
public class BalanceSheetDetailAssembler {

    private final BalanceSheetSupportService supportService;

    public BalanceSheetDetailResponse toDetailResponse(
            BalanceSheet balanceSheet,
            List<BsFuelLine> fuelLines,
            List<BsShiftLine> shiftLines,
            List<MeterAmendmentLineResponse> amendmentLines,
            List<DipPlLineResponse> dipPlEntries,
            String generatedByName,
            BalanceSheetDetailResponse.ProductSalesSummary productSalesSummary,
            BalanceSheetDetailResponse.ExpenseSummary expenseSummary) {

        BigDecimal totalDipNetAmount = dipPlEntries.stream()
                .map(DipPlLineResponse::getMonetaryAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal productSalesGrossProfit = productSalesSummary != null
                ? supportService.orZero(productSalesSummary.getGrossProfit()) : BigDecimal.ZERO;
        BigDecimal totalExpensesAmount = expenseSummary != null
                ? supportService.orZero(expenseSummary.getTotalAmount()) : BigDecimal.ZERO;

        BigDecimal totalNetProfit = supportService.orZero(balanceSheet.getTotalGrossProfit())
                .add(totalDipNetAmount)
                .add(productSalesGrossProfit)
                .subtract(totalExpensesAmount)
                .setScale(2, RoundingMode.HALF_UP);

        return BalanceSheetDetailResponse.builder()
                .id(balanceSheet.getId())
                .pumpId(balanceSheet.getPumpId())
                .reportType(balanceSheet.getReportType().name())
                .reportDate(balanceSheet.getReportDate())
                .shiftWindow(balanceSheet.getShiftWindow())
                .periodLabel(balanceSheet.getPeriodLabel())
                .generatedByUserName(generatedByName)
                .generatedAt(balanceSheet.getGeneratedAt())
                .notes(balanceSheet.getNotes())
                .totalExpectedRevenue(balanceSheet.getTotalExpectedRevenue())
                .totalCashCollected(balanceSheet.getTotalCashCollected())
                .totalUpiCollected(balanceSheet.getTotalUpiCollected())
                .totalCardCollected(balanceSheet.getTotalCardCollected())
                .totalFleetCardCollected(supportService.orZero(balanceSheet.getTotalFleetCardCollected()))
                .totalCreditSold(balanceSheet.getTotalCreditSold())
                .totalCreditRecovered(balanceSheet.getTotalCreditRecovered())
                .cashDiscrepancy(balanceSheet.getCashDiscrepancy())
                .totalLitresSold(balanceSheet.getTotalLitresSold())
                .totalLitresDelivered(balanceSheet.getTotalLitresDelivered())
                .totalCostOfGoods(balanceSheet.getTotalCostOfGoods())
                .totalGrossProfit(balanceSheet.getTotalGrossProfit())
                .totalDipNetAmount(totalDipNetAmount)
                .totalNetProfit(totalNetProfit)
                .fuelLines(fuelLines.stream().map(line -> BsFuelLineResponse.builder()
                        .fuelType(line.getFuelType())
                        .openingStock(line.getOpeningStock())
                        .closingStock(line.getClosingStock())
                        .deliveredLitres(line.getDeliveredLitres())
                        .deliveredCost(line.getDeliveredCost())
                        .soldLitres(line.getSoldLitres())
                        .sellingPrice(line.getSellingPrice())
                        .expectedRevenue(line.getExpectedRevenue())
                        .costOfGoods(line.getCostOfGoods())
                        .grossProfit(line.getGrossProfit())
                        .creditSoldAmount(line.getCreditSoldAmount())
                        .stockVariance(line.getStockVariance())
                        .dipLossLitres(supportService.orZero(line.getDipLossLitres()))
                        .dipLossAmount(supportService.orZero(line.getDipLossAmount()))
                        .build()).toList())
                .shiftLines(shiftLines.stream().map(line -> BsShiftLineResponse.builder()
                        .shiftId(line.getShiftId())
                        .operatorName(line.getOperatorName())
                        .nozzleNumber(line.getNozzleNumber())
                        .fuelTypesSummary(line.getFuelTypesSummary())
                        .litresSold(line.getLitresSold())
                        .expectedRevenue(line.getExpectedRevenue())
                        .cashCollected(line.getCashCollected())
                        .upiCollected(line.getUpiCollected())
                        .cardCollected(line.getCardCollected())
                        .fleetCardCollected(supportService.orZero(line.getFleetCardCollected()))
                        .creditAmount(line.getCreditAmount())
                        .discrepancy(line.getDiscrepancy())
                        .build()).toList())
                .meterAmendments(amendmentLines)
                .dipPlEntries(dipPlEntries)
                .productSales(productSalesSummary)
                .expenses(expenseSummary)
                .build();
    }
}
