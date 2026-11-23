package com.ppms.report;

import com.ppms.adjustment.FuelDipEntry;
import com.ppms.ancillary.AncillaryLotConsumption;
import com.ppms.ancillary.AncillaryLotConsumptionRepository;
import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.ancillary.AncillarySale;
import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.common.time.BusinessClock;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.expense.PumpExpense;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.fuel.FuelType;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.DipCheck;
import com.ppms.settlement.PaymentSettlement;
import com.ppms.settlement.PaymentSettlementRepository;
import com.ppms.settlement.SettlementPaymentType;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BalanceSheetSupportService {

    private final AncillarySaleRepository ancillarySaleRepository;
    private final AncillaryLotConsumptionRepository ancillaryLotConsumptionRepository;
    private final AncillaryProductRepository ancillaryProductRepository;
    private final PumpExpenseRepository pumpExpenseRepository;
    private final UserRepository userRepository;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final BusinessClock businessClock;
    private final PaymentSettlementRepository settlementRepository;
    private final ShiftRepository shiftRepository;

    public BalanceSheetDetailResponse.ProductSalesSummary buildProductSalesSummary(Long pumpId, ReportPeriod period) {
        List<AncillarySale> sales = ancillarySaleRepository.findByPumpIdAndDateRange(pumpId, period.reportDate(), period.reportDate());
        if (sales.isEmpty()) {
            return null;
        }

        List<Long> saleIds = sales.stream().map(AncillarySale::getId).toList();
        List<AncillaryLotConsumption> consumptions = ancillaryLotConsumptionRepository.findBySaleIdIn(saleIds);
        Map<Long, BigDecimal> cogsBySaleId = consumptions.stream()
                .collect(Collectors.groupingBy(
                        AncillaryLotConsumption::getSaleId,
                        Collectors.reducing(BigDecimal.ZERO,
                                consumption -> new BigDecimal(consumption.getQuantityConsumed()).multiply(consumption.getCostPricePerUnit()),
                                BigDecimal::add)));

        Set<Long> productIds = sales.stream().map(AncillarySale::getProductId).collect(Collectors.toSet());
        Map<Long, AncillaryProduct> productMap = ancillaryProductRepository.findAllById(productIds).stream()
                .collect(Collectors.toMap(AncillaryProduct::getId, product -> product));

        Map<Long, BigDecimal> revenueByProduct = new LinkedHashMap<>();
        Map<Long, BigDecimal> cogsByProduct = new LinkedHashMap<>();
        Map<Long, Integer> unitsByProduct = new LinkedHashMap<>();

        for (AncillarySale sale : sales) {
            Long productId = sale.getProductId();
            revenueByProduct.merge(productId, orZero(sale.getTotalAmount()), BigDecimal::add);
            cogsByProduct.merge(productId, cogsBySaleId.getOrDefault(sale.getId(), BigDecimal.ZERO), BigDecimal::add);
            unitsByProduct.merge(productId, sale.getQuantityUnits(), Integer::sum);
        }

        List<BalanceSheetDetailResponse.ProductLine> productLines = productIds.stream()
                .filter(revenueByProduct::containsKey)
                .map(productId -> {
                    AncillaryProduct product = productMap.get(productId);
                    String displayName = product != null
                            ? ((product.getBrand() != null ? product.getBrand() + " " : "")
                            + product.getName()
                            + (product.getVariant() != null ? " " + product.getVariant() : ""))
                            : "Unknown Product";
                    BigDecimal revenue = revenueByProduct.getOrDefault(productId, BigDecimal.ZERO)
                            .setScale(2, RoundingMode.HALF_UP);
                    BigDecimal cogs = cogsByProduct.getOrDefault(productId, BigDecimal.ZERO)
                            .setScale(2, RoundingMode.HALF_UP);
                    return BalanceSheetDetailResponse.ProductLine.builder()
                            .productId(productId)
                            .productName(displayName)
                            .unitsSold(unitsByProduct.getOrDefault(productId, 0))
                            .revenue(revenue)
                            .cogs(cogs)
                            .build();
                })
                .toList();

        BigDecimal totalRevenue = productLines.stream()
                .map(BalanceSheetDetailResponse.ProductLine::getRevenue)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalCogs = productLines.stream()
                .map(BalanceSheetDetailResponse.ProductLine::getCogs)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        return BalanceSheetDetailResponse.ProductSalesSummary.builder()
                .totalRevenue(totalRevenue)
                .totalCogs(totalCogs)
                .grossProfit(totalRevenue.subtract(totalCogs).setScale(2, RoundingMode.HALF_UP))
                .productLines(productLines)
                .build();
    }

    public BalanceSheetDetailResponse.ExpenseSummary buildExpenseSummary(Long pumpId, ReportPeriod period) {
        List<PumpExpense> expenses = pumpExpenseRepository.findByPumpIdAndExpenseDateAndApprovalStatus(
                pumpId, period.reportDate(), ExpenseApprovalStatus.APPROVED);
        if (expenses.isEmpty()) {
            return null;
        }

        Set<Long> userIds = expenses.stream().map(PumpExpense::getRecordedByUserId).collect(Collectors.toSet());
        Map<Long, String> userNames = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        List<BalanceSheetDetailResponse.ExpenseLine> lines = expenses.stream()
                .map(expense -> BalanceSheetDetailResponse.ExpenseLine.builder()
                        .id(expense.getId())
                        .category(expense.getCategory().name())
                        .description(expense.getDescription())
                        .amount(expense.getAmount().setScale(2, RoundingMode.HALF_UP))
                        .recordedByName(userNames.getOrDefault(expense.getRecordedByUserId(), "Unknown"))
                        .build())
                .toList();

        BigDecimal totalAmount = lines.stream()
                .map(BalanceSheetDetailResponse.ExpenseLine::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        return BalanceSheetDetailResponse.ExpenseSummary.builder()
                .totalAmount(totalAmount)
                .lines(lines)
                .build();
    }

    /**
     * Dip check variances are valued at purchase cost, like drains: a shortfall at the cost of the lots it was
     * drawn from, extra fuel at the cost of the lot created for it.
     */
    public List<DipPlLineResponse> buildDipPlEntries(Long pumpId,
                                                     List<FuelDipEntry> dipEntries,
                                                     List<DipCheck> dipChecks,
                                                     Map<Long, FuelType> tankFuelTypeMap) {
        List<DipPlLineResponse> entries = new ArrayList<>();

        for (FuelDipEntry dipEntry : dipEntries) {
            entries.add(DipPlLineResponse.builder()
                    .type("MAINTENANCE_REMOVAL")
                    .fuelType(dipEntry.getFuelType())
                    .litres(dipEntry.getLitresRemoved().setScale(3, RoundingMode.HALF_UP))
                    .monetaryAmount(dipEntry.getMonetaryLoss().negate().setScale(2, RoundingMode.HALF_UP))
                    .recordedAt(dipEntry.getCreatedAt())
                    .notes(dipEntry.getReason())
                    .build());
        }

        Map<Long, BigDecimal> costByDipCheckId = dipCheckVarianceCosts(dipChecks);
        for (DipCheck dipCheck : dipChecks) {
            FuelType fuelType = tankFuelTypeMap.get(dipCheck.getTankId());
            if (fuelType == null) {
                continue;
            }
            BigDecimal litresVariance = dipCheck.getMeasuredQuantity().subtract(dipCheck.getSystemStock())
                    .setScale(3, RoundingMode.HALF_UP);
            BigDecimal varianceCost = costByDipCheckId.get(dipCheck.getId());
            if (varianceCost == null) {
                varianceCost = litresVariance.abs().multiply(latestPurchaseCost(pumpId, fuelType));
            }
            BigDecimal monetaryAmount = (litresVariance.signum() < 0 ? varianceCost.negate() : varianceCost)
                    .setScale(2, RoundingMode.HALF_UP);
            entries.add(DipPlLineResponse.builder()
                    .type("DIP_CHECK")
                    .fuelType(fuelType.name())
                    .litres(litresVariance)
                    .monetaryAmount(monetaryAmount)
                    .recordedAt(dipCheck.getCheckedAt())
                    .notes(dipCheck.getNotes())
                    .build());
        }

        entries.sort(Comparator.comparing(DipPlLineResponse::getRecordedAt));
        return entries;
    }

    /** Unsigned purchase cost of each check's variance, from the lot ledger entries the check made. */
    private Map<Long, BigDecimal> dipCheckVarianceCosts(List<DipCheck> dipChecks) {
        if (dipChecks.isEmpty()) {
            return Map.of();
        }
        List<Long> dipCheckIds = dipChecks.stream().map(DipCheck::getId).toList();
        Map<Long, BigDecimal> costByDipCheckId = new HashMap<>();
        for (LotConsumption shortfall : lotConsumptionRepository.findByDipCorrectionIdIn(dipCheckIds)) {
            costByDipCheckId.merge(shortfall.getDipCorrectionId(),
                    shortfall.getQuantityConsumed().multiply(shortfall.getCostPricePerUnit()), BigDecimal::add);
        }
        for (InventoryLot gainLot : inventoryLotRepository.findByDipCheckIdIn(dipCheckIds)) {
            costByDipCheckId.merge(gainLot.getDipCheckId(),
                    gainLot.getOriginalQuantity().multiply(gainLot.getCostPricePerUnit()), BigDecimal::add);
        }
        return costByDipCheckId;
    }

    /** Checks recorded before the ledger linked them to lots are valued at the latest real purchase cost. */
    private BigDecimal latestPurchaseCost(Long pumpId, FuelType fuelType) {
        return inventoryLotRepository.findFirstByPumpIdAndFuelTypeAndIsDipAdjustmentFalseOrderByDeliveryDateDesc(pumpId, fuelType)
                .map(InventoryLot::getCostPricePerUnit)
                .orElse(BigDecimal.ZERO);
    }

    public BigDecimal orZero(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    public OffsetDateTime startOfBusinessDay(LocalDate date) {
        return businessClock.startOfDay(date);
    }

    /**
     * Builds the settlement summary for a DAY balance sheet.
     *
     * settlementsOnDate — entries dated on the report date (the date money arrived in bank).
     * settled amounts   — totals per type for this date.
     * wallet pending    — cumulative (all collections up to reportDate) − (all settlements up to reportDate).
     *
     * The "as-of" wallet snapshot uses reportDate as the cut-off so the figure is historically
     * accurate even when viewed months later.
     */
    public BalanceSheetDetailResponse.SettlementSummary buildSettlementSummary(Long pumpId, ReportPeriod period) {
        LocalDate reportDate = period.reportDate();
        List<PaymentSettlement> onDate = settlementRepository.findActiveByPumpIdAndSettlementDate(pumpId, reportDate);

        // Batch-load recorder names
        Set<Long> recorderIds = onDate.stream()
                .map(PaymentSettlement::getRecordedByUserId)
                .collect(Collectors.toSet());
        Map<Long, String> recorderNames = recorderIds.isEmpty()
                ? Map.of()
                : userRepository.findAllById(recorderIds).stream()
                        .collect(Collectors.toMap(User::getId, User::getFullName));

        // Per-type settled amounts on this date
        BigDecimal upiOnDate   = onDate.stream()
                .filter(s -> s.getPaymentType() == SettlementPaymentType.UPI)
                .map(PaymentSettlement::getAmountReceived).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cardOnDate  = onDate.stream()
                .filter(s -> s.getPaymentType() == SettlementPaymentType.CARD)
                .map(PaymentSettlement::getAmountReceived).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal fleetOnDate = onDate.stream()
                .filter(s -> s.getPaymentType() == SettlementPaymentType.FLEET_CARD)
                .map(PaymentSettlement::getAmountReceived).reduce(BigDecimal.ZERO, BigDecimal::add);

        // Cumulative wallet as-of reportDate
        BigDecimal upiCollected   = shiftRepository.sumUpiCollectedByPumpIdAsOf(pumpId, reportDate);
        BigDecimal cardCollected  = shiftRepository.sumCardCollectedByPumpIdAsOf(pumpId, reportDate);
        BigDecimal fleetCollected = shiftRepository.sumFleetCardCollectedByPumpIdAsOf(pumpId, reportDate);

        BigDecimal upiSettledTotal   = settlementRepository.sumAmountByPumpIdAndPaymentTypeAsOf(pumpId, SettlementPaymentType.UPI, reportDate);
        BigDecimal cardSettledTotal  = settlementRepository.sumAmountByPumpIdAndPaymentTypeAsOf(pumpId, SettlementPaymentType.CARD, reportDate);
        BigDecimal fleetSettledTotal = settlementRepository.sumAmountByPumpIdAndPaymentTypeAsOf(pumpId, SettlementPaymentType.FLEET_CARD, reportDate);

        BigDecimal upiPending   = orZero(upiCollected).subtract(orZero(upiSettledTotal)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal cardPending  = orZero(cardCollected).subtract(orZero(cardSettledTotal)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal fleetPending = orZero(fleetCollected).subtract(orZero(fleetSettledTotal)).setScale(2, RoundingMode.HALF_UP);

        List<BalanceSheetDetailResponse.SettlementLine> lines = onDate.stream()
                .map(s -> BalanceSheetDetailResponse.SettlementLine.builder()
                        .id(s.getId())
                        .paymentType(s.getPaymentType().name())
                        .amountReceived(s.getAmountReceived())
                        .notes(s.getNotes())
                        .recordedByUserName(recorderNames.getOrDefault(s.getRecordedByUserId(), "Unknown"))
                        .createdAt(s.getCreatedAt())
                        .build())
                .toList();

        return BalanceSheetDetailResponse.SettlementSummary.builder()
                .upiSettledOnDate(upiOnDate.setScale(2, RoundingMode.HALF_UP))
                .cardSettledOnDate(cardOnDate.setScale(2, RoundingMode.HALF_UP))
                .fleetCardSettledOnDate(fleetOnDate.setScale(2, RoundingMode.HALF_UP))
                .walletUpiPending(upiPending)
                .walletCardPending(cardPending)
                .walletFleetCardPending(fleetPending)
                .settlementsOnDate(lines)
                .build();
    }
}
