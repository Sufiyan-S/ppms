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
import com.ppms.inventory.DipCheck;
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
    private final BusinessClock businessClock;

    public BalanceSheetDetailResponse.ProductSalesSummary buildProductSalesSummary(Long pumpId, LocalDate reportDate) {
        List<AncillarySale> sales = ancillarySaleRepository.findByPumpIdAndDateRange(pumpId, reportDate, reportDate);
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

    public BalanceSheetDetailResponse.ExpenseSummary buildExpenseSummary(Long pumpId, LocalDate reportDate) {
        List<PumpExpense> expenses = pumpExpenseRepository.findByPumpIdAndExpenseDateAndApprovalStatus(
                pumpId, reportDate, ExpenseApprovalStatus.APPROVED);
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

    public List<DipPlLineResponse> buildDipPlEntries(List<FuelDipEntry> dipEntries,
                                                     List<DipCheck> dipChecks,
                                                     Map<FuelType, BigDecimal> priceMap,
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

        for (DipCheck dipCheck : dipChecks) {
            FuelType fuelType = tankFuelTypeMap.get(dipCheck.getTankId());
            if (fuelType == null) {
                continue;
            }
            BigDecimal litresVariance = dipCheck.getMeasuredQuantity().subtract(dipCheck.getSystemStock())
                    .setScale(3, RoundingMode.HALF_UP);
            BigDecimal monetaryAmount = litresVariance.multiply(priceMap.getOrDefault(fuelType, BigDecimal.ZERO))
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

    public BigDecimal orZero(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    public OffsetDateTime startOfBusinessDay(LocalDate date) {
        return businessClock.startOfDay(date);
    }
}
