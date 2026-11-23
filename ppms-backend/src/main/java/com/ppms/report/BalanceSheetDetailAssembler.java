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
import java.util.Objects;
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

        BigDecimal liveDipNetAmount = dipPlEntries.stream()
                .map(DipPlLineResponse::getMonetaryAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal liveProductSalesGrossProfit = productSalesSummary != null
                ? supportService.orZero(productSalesSummary.getGrossProfit()) : BigDecimal.ZERO;
        BigDecimal liveExpensesAmount = expenseSummary != null
                ? supportService.orZero(expenseSummary.getTotalAmount()) : BigDecimal.ZERO;

        // Sheets saved before the totals were stored fall back to the live line items.
        BigDecimal totalDipNetAmount = balanceSheet.getTotalDipNetAmount() != null
                ? balanceSheet.getTotalDipNetAmount() : liveDipNetAmount;
        BigDecimal productSalesGrossProfit = balanceSheet.getProductSalesGrossProfit() != null
                ? balanceSheet.getProductSalesGrossProfit() : liveProductSalesGrossProfit;
        BigDecimal totalExpensesAmount = balanceSheet.getTotalExpensesAmount() != null
                ? balanceSheet.getTotalExpensesAmount() : liveExpensesAmount;
        boolean linesChangedSinceGenerated = totalDipNetAmount.compareTo(liveDipNetAmount) != 0
                || productSalesGrossProfit.compareTo(liveProductSalesGrossProfit) != 0
                || totalExpensesAmount.compareTo(liveExpensesAmount) != 0;

        BigDecimal totalNetProfit = supportService.orZero(balanceSheet.getTotalGrossProfit())
                .add(totalDipNetAmount)
                .add(productSalesGrossProfit)
                .subtract(totalExpensesAmount)
                .setScale(2, RoundingMode.HALF_UP);

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
                .periodLabelCode(balanceSheet.getPeriodLabelCode())
                .periodLabelParams(Objects.requireNonNullElse(balanceSheet.getPeriodLabelParams(), Map.of()))
                .generatedByUserName(generatedByName)
                .generatedAt(balanceSheet.getGeneratedAt())
                .notes(balanceSheet.getNotes())
                .stale(balanceSheet.isStale())
                .staleReason(balanceSheet.getStaleReason())
                .staleReasonCode(balanceSheet.getStaleReasonCode())
                .staleReasonParams(Objects.requireNonNullElse(balanceSheet.getStaleReasonParams(), Map.of()))
                .openShiftCount(balanceSheet.getOpenShiftCount())
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
                .linesChangedSinceGenerated(linesChangedSinceGenerated)
                .fuelLines(fuelLines.stream().map(this::toFuelLineResponse).toList())
                .shiftLines(shiftLines.stream()
                        .map(line -> toShiftLineResponse(line, readingsByShift, nozzleNumberById))
                        .toList())
                .meterAmendments(amendmentLines)
                .dipPlEntries(dipPlEntries)
                .productSales(productSalesSummary)
                .expenses(expenseSummary)
                .build();
    }

    private BsFuelLineResponse toFuelLineResponse(BsFuelLine line) {
        return BsFuelLineResponse.builder()
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
                .build();
    }

    private BsShiftLineResponse toShiftLineResponse(BsShiftLine line,
                                                    Map<Long, List<ShiftFuelReading>> readingsByShift,
                                                    Map<Long, Integer> nozzleNumberById) {
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
    }
}
