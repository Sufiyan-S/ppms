package com.ppms.report;

import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.shift.ShiftFuelReading;
import com.ppms.shift.ShiftFuelReadingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BalanceSheetDetailAssembler {

    private final BalanceSheetSupportService supportService;
    private final ShiftFuelReadingRepository shiftFuelReadingRepository;
    private final NozzleRepository nozzleRepository;

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

        // Batch fetch per-nozzle fuel readings for all shifts in this report — avoids N+1
        List<Long> shiftIds = shiftLines.stream().map(BsShiftLine::getShiftId).toList();
        Map<Long, List<ShiftFuelReading>> readingsByShift = shiftFuelReadingRepository
                .findByShiftIdIn(shiftIds)
                .stream()
                .collect(Collectors.groupingBy(ShiftFuelReading::getShiftId));

        Set<Long> nozzleIds = readingsByShift.values().stream()
                .flatMap(List::stream)
                .map(ShiftFuelReading::getNozzleId)
                .collect(Collectors.toSet());
        Map<Long, Integer> nozzleNumberById = nozzleIds.isEmpty()
                ? Map.of()
                : nozzleRepository.findAllById(nozzleIds).stream()
                        .collect(Collectors.toMap(Nozzle::getId, Nozzle::getNozzleNumber));

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
                .totalCashRecovery(supportService.orZero(balanceSheet.getTotalCashRecovery()))
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
                .shiftLines(shiftLines.stream().map(line -> {
                    List<BsShiftLineResponse.NozzleReadingLine> nozzleReadings = readingsByShift
                            .getOrDefault(line.getShiftId(), List.of())
                            .stream()
                            .filter(r -> r.getUnitsSold() != null)
                            .sorted(Comparator.comparingInt(r -> nozzleNumberById.getOrDefault(r.getNozzleId(), 0)))
                            .map(r -> BsShiftLineResponse.NozzleReadingLine.builder()
                                    .nozzleNumber(nozzleNumberById.getOrDefault(r.getNozzleId(), 0))
                                    .fuelType(r.getFuelType().name())
                                    .litresSold(r.getUnitsSold().setScale(3, RoundingMode.HALF_UP))
                                    .expectedRevenue(r.getUnitsSold()
                                            .multiply(r.getPriceSnapshot())
                                            .setScale(2, RoundingMode.HALF_UP))
                                    .build())
                            .toList();
                    return BsShiftLineResponse.builder()
                            .shiftId(line.getShiftId())
                            .operatorName(line.getOperatorName())
                            .duNumber(line.getDuNumber())
                            .duName(line.getDuName())
                            .fuelTypesSummary(line.getFuelTypesSummary())
                            .litresSold(line.getLitresSold())
                            .expectedRevenue(line.getExpectedRevenue())
                            .cashCollected(line.getCashCollected())
                            .upiCollected(line.getUpiCollected())
                            .cardCollected(line.getCardCollected())
                            .fleetCardCollected(supportService.orZero(line.getFleetCardCollected()))
                            .creditAmount(line.getCreditAmount())
                            .discrepancy(line.getDiscrepancy())
                            .nozzleReadings(nozzleReadings)
                            .build();
                }).toList())
                .meterAmendments(amendmentLines)
                .dipPlEntries(dipPlEntries)
                .productSales(productSalesSummary)
                .expenses(expenseSummary)
                .build();
    }
}
