package com.ppms.report;

import com.ppms.adjustment.FuelDipEntry;
import com.ppms.adjustment.FuelDipEntryRepository;
import com.ppms.adjustment.NozzleReadingAdjustment;
import com.ppms.adjustment.NozzleReadingAdjustmentRepository;
import com.ppms.inventory.DipCheck;
import com.ppms.inventory.DipCheckRepository;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.credit.CreditPaymentRepository;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionService;
import com.ppms.report.BalanceSheetInputsCollector.CostOfGoods;
import com.ppms.report.BalanceSheetInputsCollector.Deliveries;
import com.ppms.report.BalanceSheetInputsCollector.DipLosses;
import com.ppms.report.BalanceSheetInputsCollector.FuelSales;
import com.ppms.report.BalanceSheetInputsCollector.StockLevels;
import com.ppms.shift.*;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.ppms.common.dto.PagedResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class BalanceSheetService {
    private final BalanceSheetRepository        balanceSheetRepository;
    private final BsFuelLineRepository          bsFuelLineRepository;
    private final BsShiftLineRepository         bsShiftLineRepository;

    private final FuelDipEntryRepository               fuelDipEntryRepository;
    private final DipCheckRepository                   dipCheckRepository;
    private final NozzleReadingAdjustmentRepository    adjustmentRepository;
    private final ShiftRepository           shiftRepository;
    private final CreditPaymentRepository   creditPaymentRepository;
    private final GlobalFuelPriceRepository globalFuelPriceRepository;
    private final DispensaryUnitRepository dispensaryUnitRepository;
    private final UserRepository            userRepository;
    private final PumpShiftDefinitionService shiftDefinitionService;
    private final BusinessClock             businessClock;
    private final BalanceSheetSupportService supportService;
    private final BalanceSheetInputsCollector inputs;
    private final BalanceSheetDetailAssembler detailAssembler;
    private final PumpLocationRepository    pumpLocationRepository;

    // ── Generate ──────────────────────────────────────────────────────────────

    @Transactional
    public BalanceSheetDetailResponse generate(Long pumpId, GenerateBalanceSheetRequest req, User generatedBy) {
        validateRequest(req);

        LocalDate reportDate = req.getReportDate();
        boolean isShift = req.getReportType() == BalanceSheetReportType.SHIFT;

        // Live DAY report: reportDate == today → a rolling 24-hour window ending now, so that
        // cross-midnight shifts (e.g. 11pm→9am) are captured. Every DAY query uses the same period.
        // SHIFT reports use the calendar day of reportDate for dip and amendment lookups.
        boolean isLiveDay = !isShift && reportDate.equals(businessClock.today());
        ReportPeriod period = isLiveDay
                ? livePeriod(reportDate, businessClock.now())
                : businessDayPeriod(reportDate);

        PumpShiftDefinition shiftDef = isShift
                ? shiftDefinitionService.getByIdAndPump(req.getShiftDefinitionId(), pumpId)
                : null;

        if (!req.isForceRegenerate()) {
            rejectDuplicateSheet(pumpId, reportDate, shiftDef);
        }

        List<Shift> shifts = findClosedShiftsForReport(pumpId, reportDate, shiftDef, isLiveDay, period);
        List<Long> shiftIds = shifts.stream().map(Shift::getId).toList();

        FuelSales fuelSales = inputs.sumFuelSales(shiftIds);
        CostOfGoods costOfGoods = inputs.sumCostOfGoods(shiftIds);
        Map<FuelType, BigDecimal> priceMap = globalFuelPriceRepository.findCurrentPricesForPump(pumpId).stream()
                .collect(Collectors.toMap(GlobalFuelPrice::getFuelType, GlobalFuelPrice::getPricePerUnit));
        Deliveries deliveries = isShift ? Deliveries.NONE : inputs.sumDeliveries(pumpId, period);
        Map<FuelType, BigDecimal> creditByFuel = inputs.sumCreditSoldByFuel(shiftIds);

        Recoveries recoveries = isShift ? Recoveries.NONE : sumRecoveries(pumpId, reportDate, isLiveDay, period);
        StockLevels stock = inputs.stockLevels(pumpId, reportDate, isShift, isLiveDay, period, shifts);

        Map<Long, FuelType> tankFuelTypeMap = inputs.tankFuelTypesFor(pumpId);
        List<FuelDipEntry> dipEntries = inputs.dipEntriesFor(pumpId, period);
        DipLosses dipLosses = inputs.sumDipLosses(dipEntries);
        // Dipstick variances (measured vs system stock) of every review status; distinct from dip
        // entries, which are fuel physically removed for maintenance or testing.
        List<DipCheck> dipChecks = dipCheckRepository.findByPumpIdAndCheckedAtGreaterThanEqualAndCheckedAtLessThan(pumpId, period.start(), period.end());
        Map<FuelType, BigDecimal> dipVarianceByFuel = BalanceSheetInputsCollector.sumDipCheckVariance(dipChecks, tankFuelTypeMap);
        List<NozzleReadingAdjustment> amendments =
                adjustmentRepository.findByPumpIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(pumpId, period.start(), period.end());
        List<DipPlLineResponse> dipPlEntries = supportService.buildDipPlEntries(pumpId, dipEntries, dipChecks, tankFuelTypeMap);

        // Totals that feed net profit are stored with the sheet so later price changes or late
        // approvals cannot change a saved report.
        BalanceSheetDetailResponse.ProductSalesSummary productSalesSummary =
                isShift ? null : supportService.buildProductSalesSummary(pumpId, period);
        BalanceSheetDetailResponse.ExpenseSummary expenseSummary =
                isShift ? null : supportService.buildExpenseSummary(pumpId, period);
        BigDecimal dipNetAmount = dipPlEntries.stream()
                .map(DipPlLineResponse::getMonetaryAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        BalanceSheetDetailResponse.SettlementSummary settlementSummary = isShift ? null : supportService.buildSettlementSummary(pumpId, period);

        // The pump row lock is taken only around the final duplicate check and insert, so the
        // aggregation above does not block cash-outs and settlements on this pump.
        pumpLocationRepository.findByIdForUpdate(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found: " + pumpId));
        if (!req.isForceRegenerate()) {
            rejectDuplicateSheet(pumpId, reportDate, shiftDef);
        }

        BalanceSheet bs = balanceSheetRepository.save(buildSheet(pumpId, req, shiftDef, generatedBy,
                buildPeriodLabel(req, pumpId, shiftDef, isLiveDay, period.start(), period.end()),
                shifts, fuelSales, costOfGoods, deliveries, recoveries.creditRecovered(), recoveries.cashRecovery(),
                dipLosses, dipNetAmount, productSalesSummary, expenseSummary));

        List<BsFuelLine> fuelLines = BalanceSheetFuelLineBuilder.build(bs.getId(), fuelSales, costOfGoods, deliveries,
                stock, dipLosses, priceMap, creditByFuel, dipVarianceByFuel);
        bsFuelLineRepository.saveAll(fuelLines);

        List<BsShiftLine> shiftLines = buildShiftLines(bs.getId(), shifts, fuelSales.readingsByShift());
        bsShiftLineRepository.saveAll(shiftLines);

        List<MeterAmendmentLineResponse> amendmentLines = buildAmendmentLines(amendments);

        log.info("Balance sheet generated: pump={}, type={}, date={}, window={}, shifts={}, dipChecks={}, dipEntries={}, amendments={}, by={}",
                pumpId, req.getReportType(), reportDate, shiftDef != null ? shiftDef.getName() : "DAY",
                shifts.size(), dipChecks.size(), dipEntries.size(), amendmentLines.size(), generatedBy.getId());

        BalanceSheetDetailResponse response = detailAssembler.toDetailResponse(bs, fuelLines, shiftLines,
                amendmentLines, dipPlEntries, generatedBy.getFullName(), productSalesSummary, expenseSummary);

        if (!isShift) {
            response.setSettlementSummary(settlementSummary);
            response.setIncludedShiftNames(distinctShiftNames(shifts));
        }
        return response;
    }





    private record Recoveries(BigDecimal creditRecovered, BigDecimal cashRecovery) {
        static final Recoveries NONE = new Recoveries(BigDecimal.ZERO, BigDecimal.ZERO);
    }

    private Recoveries sumRecoveries(Long pumpId, LocalDate reportDate, boolean isLiveDay, ReportPeriod period) {
        BigDecimal creditRecovered = isLiveDay
                ? creditPaymentRepository.sumApprovedAmountByPumpIdRecordedBetween(pumpId, period.start(), period.end())
                : creditPaymentRepository.sumAmountByPumpIdAndDate(pumpId, reportDate);
        BigDecimal cashRecovery = supportService.orZero(isLiveDay
                ? shiftRepository.sumCashRecoveriesBetween(pumpId, period.start(), period.end())
                : shiftRepository.sumCashRecoveriesOnDate(pumpId, reportDate));
        return new Recoveries(creditRecovered, cashRecovery);
    }

    private void rejectDuplicateSheet(Long pumpId, LocalDate reportDate, PumpShiftDefinition shiftDef) {
        if (shiftDef != null) {
            balanceSheetRepository.findFirstByPumpIdAndReportDateAndShiftDefinitionId(pumpId, reportDate, shiftDef.getId())
                    .ifPresent(bs -> { throw new BusinessException(
                            "A balance sheet for \"" + shiftDef.getName() + "\" on " + reportDate +
                            " already exists (ID " + bs.getId() + "). Delete it first to regenerate."); });
        } else {
            balanceSheetRepository.findFirstByPumpIdAndReportDateAndReportType(pumpId, reportDate, BalanceSheetReportType.DAY)
                    .ifPresent(bs -> { throw new BusinessException(
                            "A day-end balance sheet for " + reportDate + " already exists (ID " + bs.getId() + "). Delete it first to regenerate."); });
        }
    }

    /**
     * Live DAY: shifts that ended in the rolling 24-hour window (captures cross-midnight shifts).
     * Historical DAY / SHIFT: by business date, or by shift definition.
     */
    private List<Shift> findClosedShiftsForReport(Long pumpId, LocalDate reportDate, PumpShiftDefinition shiftDef,
                                                  boolean isLiveDay, ReportPeriod period) {
        List<Shift> shifts = shiftDef != null
                ? shiftRepository.findClosedShiftsByDefinition(pumpId, reportDate, shiftDef.getId())
                : isLiveDay
                        ? shiftRepository.findClosedShiftsByEndTimeWindow(pumpId, period.start(), period.end())
                        : shiftRepository.findClosedShiftsByDate(pumpId, reportDate);

        if (shifts.isEmpty()) {
            String shiftLabel = shiftDef != null ? "\"" + shiftDef.getName() + "\" on " : "";
            String windowHint = isLiveDay
                    ? " (window: last 24 hrs ending now — ensure all shifts for this period are closed)"
                    : "";
            throw new BusinessException("No closed shifts found for " + shiftLabel + reportDate + windowHint + ". Close all shifts before generating a balance sheet.");
        }
        return shifts;
    }









    private BalanceSheet buildSheet(Long pumpId, GenerateBalanceSheetRequest req, PumpShiftDefinition shiftDef,
                                    User generatedBy, String periodLabel, List<Shift> shifts,
                                    FuelSales fuelSales, CostOfGoods costOfGoods, Deliveries deliveries,
                                    BigDecimal creditRecovered, BigDecimal totalCashRecovery,
                                    DipLosses dipLosses, BigDecimal dipNetAmount,
                                    BalanceSheetDetailResponse.ProductSalesSummary productSalesSummary,
                                    BalanceSheetDetailResponse.ExpenseSummary expenseSummary) {
        BigDecimal totalCash      = sumShiftAmounts(shifts, Shift::getCashCollected);
        BigDecimal totalUpi       = sumShiftAmounts(shifts, Shift::getUpiCollected);
        BigDecimal totalCard      = sumShiftAmounts(shifts, Shift::getCardCollected);
        BigDecimal totalFleetCard = sumShiftAmounts(shifts, Shift::getFleetCardCollected);
        BigDecimal totalCredit    = sumShiftAmounts(shifts, Shift::getCreditTotal);
        // Each shift's totalAmountDue was priced at close time, so this stays right after price changes.
        BigDecimal totalExpectedRevenue = sumShiftAmounts(shifts, Shift::getTotalAmountDue).setScale(2, RoundingMode.HALF_UP);

        // Collected − Expected: positive is OVER, negative is SHORT. Fleet card counts as collected.
        BigDecimal totalCollected = totalCash.add(totalUpi).add(totalCard).add(totalFleetCard).add(totalCredit);
        BigDecimal cashDiscrepancy = totalCollected.subtract(totalExpectedRevenue).setScale(2, RoundingMode.HALF_UP);

        BigDecimal totalLitresSold = fuelSales.litresByFuel().values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalDeliveredLitres = deliveries.litresByFuel().values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        return BalanceSheet.builder()
                .pumpId(pumpId)
                .reportType(req.getReportType())
                .reportDate(req.getReportDate())
                .shiftWindow(shiftDef != null ? shiftDef.getName() : null)
                .shiftDefinitionId(shiftDef != null ? shiftDef.getId() : null)
                .periodLabel(periodLabel)
                .generatedByUserId(generatedBy.getId())
                .generatedAt(businessClock.now())
                .notes(req.getNotes())
                .totalExpectedRevenue(totalExpectedRevenue)
                .totalCashCollected(totalCash)
                .totalUpiCollected(totalUpi)
                .totalCardCollected(totalCard)
                .totalFleetCardCollected(totalFleetCard)
                .totalCreditSold(totalCredit)
                .totalCreditRecovered(creditRecovered)
                .totalCashRecovery(totalCashRecovery.setScale(2, RoundingMode.HALF_UP))
                .cashDiscrepancy(cashDiscrepancy)
                .totalLitresSold(totalLitresSold.setScale(3, RoundingMode.HALF_UP))
                .totalLitresDelivered(totalDeliveredLitres.setScale(3, RoundingMode.HALF_UP))
                .totalCostOfGoods(costOfGoods.total())
                .totalGrossProfit(totalExpectedRevenue.subtract(costOfGoods.total()).setScale(2, RoundingMode.HALF_UP))
                .totalDipLossAmount(dipLosses.totalAmount())
                .totalDipNetAmount(dipNetAmount)
                .productSalesGrossProfit(productSalesSummary != null
                        ? supportService.orZero(productSalesSummary.getGrossProfit()) : BigDecimal.ZERO)
                .totalExpensesAmount(expenseSummary != null
                        ? supportService.orZero(expenseSummary.getTotalAmount()) : BigDecimal.ZERO)
                .build();
    }

    private BigDecimal sumShiftAmounts(List<Shift> shifts, Function<Shift, BigDecimal> amountOf) {
        return shifts.stream().map(s -> supportService.orZero(amountOf.apply(s))).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private List<BsShiftLine> buildShiftLines(Long balanceSheetId, List<Shift> shifts,
                                              Map<Long, List<ShiftFuelReading>> readingsByShift) {
        Set<Long> operatorIds = shifts.stream().map(Shift::getOperatorId).collect(Collectors.toSet());
        Map<Long, String> operatorNames = userRepository.findAllById(operatorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
        Set<Long> duIds = shifts.stream().map(Shift::getDuId).collect(Collectors.toSet());
        Map<Long, DispensaryUnit> duById = dispensaryUnitRepository.findAllById(duIds).stream()
                .collect(Collectors.toMap(DispensaryUnit::getId, Function.identity()));

        List<BsShiftLine> shiftLines = new ArrayList<>();
        for (Shift s : shifts) {
            List<ShiftFuelReading> readings = readingsByShift.getOrDefault(s.getId(), List.of());
            BigDecimal shiftLitres = readings.stream()
                    .map(r -> r.getUnitsSold() != null ? r.getUnitsSold() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            String fuelTypesSummary = readings.stream()
                    .filter(r -> r.getUnitsSold() != null && r.getUnitsSold().compareTo(BigDecimal.ZERO) > 0)
                    .map(r -> r.getFuelType().name())
                    .distinct()
                    .sorted()
                    .collect(Collectors.joining(", "));

            BigDecimal shiftExpected = supportService.orZero(s.getTotalAmountDue());
            BigDecimal shiftCollected = supportService.orZero(s.getCashCollected())
                    .add(supportService.orZero(s.getUpiCollected()))
                    .add(supportService.orZero(s.getCardCollected()))
                    .add(supportService.orZero(s.getFleetCardCollected()))
                    .add(supportService.orZero(s.getCreditTotal()));
            DispensaryUnit du = duById.get(s.getDuId());

            shiftLines.add(BsShiftLine.builder()
                    .balanceSheetId(balanceSheetId)
                    .shiftId(s.getId())
                    .operatorName(operatorNames.getOrDefault(s.getOperatorId(), "Unknown"))
                    .duNumber(du != null ? du.getDuNumber() : 0)
                    .duName(du != null ? du.getName() : "")
                    .fuelTypesSummary(fuelTypesSummary.isEmpty() ? "—" : fuelTypesSummary)
                    .litresSold(shiftLitres.setScale(3, RoundingMode.HALF_UP))
                    .expectedRevenue(shiftExpected)
                    .cashCollected(supportService.orZero(s.getCashCollected()))
                    .upiCollected(supportService.orZero(s.getUpiCollected()))
                    .cardCollected(supportService.orZero(s.getCardCollected()))
                    .fleetCardCollected(supportService.orZero(s.getFleetCardCollected()))
                    .creditAmount(supportService.orZero(s.getCreditTotal()))
                    .discrepancy(shiftCollected.subtract(shiftExpected).setScale(2, RoundingMode.HALF_UP))
                    .build());
        }
        return shiftLines;
    }

    private List<MeterAmendmentLineResponse> buildAmendmentLines(List<NozzleReadingAdjustment> amendments) {
        Set<Long> userIds = amendments.stream().map(NozzleReadingAdjustment::getRecordedByUserId).collect(Collectors.toSet());
        Map<Long, String> userNames = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
        return amendments.stream()
                .map(a -> MeterAmendmentLineResponse.builder()
                        .id(a.getId())
                        .fuelType(a.getFuelType())
                        .adjustmentType(a.getAdjustmentType())
                        .previousReading(a.getPreviousReading())
                        .newReading(a.getNewReading())
                        .delta(a.getNewReading().subtract(a.getPreviousReading()))
                        .reason(a.getReason())
                        .recordedByUserName(userNames.getOrDefault(a.getRecordedByUserId(), "Unknown"))
                        .createdAt(a.getCreatedAt())
                        .build())
                .toList();
    }

    private static List<String> distinctShiftNames(List<Shift> shifts) {
        return shifts.stream()
                .map(Shift::getShiftName)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<BalanceSheetSummaryResponse> list(Long pumpId, LocalDate from, LocalDate to, Pageable pageable) {
        Page<BalanceSheet> sheetsPage = (from != null && to != null)
                ? balanceSheetRepository.findByPumpIdAndReportDateBetweenOrderByReportDateDescGeneratedAtDesc(pumpId, from, to, pageable)
                : balanceSheetRepository.findByPumpIdOrderByReportDateDescGeneratedAtDesc(pumpId, pageable);

        // Batch-load generator names — avoids one DB query per balance sheet in the list
        Set<Long> generatorIds = sheetsPage.getContent().stream()
                .map(BalanceSheet::getGeneratedByUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> userNameMap = userRepository.findAllById(generatorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        // Batch-load shift counts — single query instead of one COUNT per balance sheet row
        Set<Long> bsIds = sheetsPage.getContent().stream()
                .map(BalanceSheet::getId)
                .collect(Collectors.toSet());
        Map<Long, Integer> shiftCountMap = bsIds.isEmpty()
                ? Collections.emptyMap()
                : bsShiftLineRepository.countGroupedByBalanceSheetIdIn(bsIds).stream()
                        .collect(Collectors.toMap(row -> (Long) row[0], row -> ((Long) row[1]).intValue()));

        Page<BalanceSheetSummaryResponse> mapped = sheetsPage.map(bs -> {
            int shiftCount = shiftCountMap.getOrDefault(bs.getId(), 0);
            String userName = bs.getGeneratedByUserId() != null
                    ? userNameMap.getOrDefault(bs.getGeneratedByUserId(), "Unknown")
                    : "System";
            return BalanceSheetSummaryResponse.builder()
                    .id(bs.getId())
                    .reportType(bs.getReportType().name())
                    .reportDate(bs.getReportDate())
                    .shiftWindow(bs.getShiftWindow())
                    .periodLabel(bs.getPeriodLabel())
                    .generatedByUserName(userName)
                    .generatedAt(bs.getGeneratedAt())
                    .shiftCount(shiftCount)
                    .totalLitresSold(bs.getTotalLitresSold())
                    .totalExpectedRevenue(bs.getTotalExpectedRevenue())
                    .totalGrossProfit(bs.getTotalGrossProfit())
                    .cashDiscrepancy(bs.getCashDiscrepancy())
                    .build();
        });

        return PagedResponse.of(mapped);
    }

    @Transactional(readOnly = true)
    public BalanceSheetDetailResponse getById(Long pumpId, Long id) {
        BalanceSheet bs = balanceSheetRepository.findById(id)
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Balance sheet not found"));
        List<BsFuelLine>  fuelLines  = bsFuelLineRepository.findByBalanceSheetIdOrderByFuelType(id);
        List<BsShiftLine> shiftLines = bsShiftLineRepository.findByBalanceSheetIdOrderByDuNumber(id);
        String userName = bs.getGeneratedByUserId() != null
                ? userRepository.findById(bs.getGeneratedByUserId()).map(User::getFullName).orElse("Unknown")
                : "System";

        // Amendments, dip checks and line items are re-read for the report's period; the totals that
        // feed net profit come from the values stored at generation. A live DAY report re-derives the
        // same 24-hour window anchored to generatedAt.
        LocalDate generatedDate = bs.getGeneratedAt().atZoneSameInstant(businessClock.zone()).toLocalDate();
        boolean isLiveDayReport = bs.getReportType() == BalanceSheetReportType.DAY
                && bs.getReportDate().equals(generatedDate);
        ReportPeriod period = isLiveDayReport
                ? livePeriod(bs.getReportDate(), bs.getGeneratedAt())
                : businessDayPeriod(bs.getReportDate());
        OffsetDateTime from = period.start();
        OffsetDateTime to   = period.end();

        List<NozzleReadingAdjustment> amendments =
                adjustmentRepository.findByPumpIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(pumpId, from, to);

        List<MeterAmendmentLineResponse> amendmentLines = buildAmendmentLines(amendments);

        List<FuelDipEntry> dipEntries = inputs.dipEntriesFor(pumpId, period);
        List<DipCheck> dipChecks =
                dipCheckRepository.findByPumpIdAndCheckedAtGreaterThanEqualAndCheckedAtLessThan(pumpId, from, to);

        Map<Long, FuelType> tankFuelTypeMap = inputs.tankFuelTypesFor(pumpId);

        List<DipPlLineResponse> dipPlEntries = supportService.buildDipPlEntries(pumpId, dipEntries, dipChecks, tankFuelTypeMap);

        boolean isDayReport = bs.getReportType() == BalanceSheetReportType.DAY;
        BalanceSheetDetailResponse.ProductSalesSummary productSalesSummary =
                isDayReport ? supportService.buildProductSalesSummary(bs.getPumpId(), period) : null;
        BalanceSheetDetailResponse.ExpenseSummary expenseSummary =
                isDayReport ? supportService.buildExpenseSummary(bs.getPumpId(), period) : null;

        BalanceSheetDetailResponse response = detailAssembler.toDetailResponse(bs, fuelLines, shiftLines,
                amendmentLines, dipPlEntries, userName, productSalesSummary, expenseSummary);

        if (isDayReport) {
            response.setSettlementSummary(supportService.buildSettlementSummary(bs.getPumpId(), period));
            List<Long> shiftIds = shiftLines.stream().map(BsShiftLine::getShiftId).toList();
            response.setIncludedShiftNames(distinctShiftNames(shiftRepository.findAllById(shiftIds)));
        }
        return response;
    }

    @Transactional
    public void delete(Long pumpId, Long id) {
        BalanceSheet bs = balanceSheetRepository.findById(id)
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Balance sheet not found"));
        balanceSheetRepository.delete(bs);
        log.info("Balance sheet deleted: id={}, pump={}", id, pumpId);
    }

    // ── Private helpers ───────────────────────────────────────────────────────


    private ReportPeriod livePeriod(LocalDate reportDate, OffsetDateTime end) {
        return new ReportPeriod(reportDate, end.minusHours(24), end, true);
    }

    private ReportPeriod businessDayPeriod(LocalDate reportDate) {
        return new ReportPeriod(reportDate, supportService.startOfBusinessDay(reportDate),
                supportService.startOfBusinessDay(reportDate.plusDays(1)), false);
    }





    private void validateRequest(GenerateBalanceSheetRequest req) {
        if (req.getReportType() == BalanceSheetReportType.SHIFT) {
            if (req.getShiftDefinitionId() == null) {
                throw new BusinessException("shiftDefinitionId is required for SHIFT reports. Select a shift from the dropdown.");
            }
        }
    }

    private String buildPeriodLabel(GenerateBalanceSheetRequest req, Long pumpId,
                                     com.ppms.pump.PumpShiftDefinition shiftDef,
                                     boolean isLiveDay, OffsetDateTime windowStart, OffsetDateTime windowEnd) {
        String base;
        if (isLiveDay) {
            // Show the actual 24-hour window so the label is unambiguous.
            // Example: "Day End · 21 Apr 15:05 → 22 Apr 15:05"
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd MMM HH:mm");
            String from = windowStart.atZoneSameInstant(businessClock.zone()).format(fmt);
            String to   = windowEnd.atZoneSameInstant(businessClock.zone()).format(fmt);
            base = "Day End · " + from + " → " + to;
        } else {
            base = req.getReportType() == BalanceSheetReportType.DAY
                    ? "Day End · " + req.getReportDate()
                    : shiftDef.getName() + " · " + req.getReportDate();
        }

        if (!req.isForceRegenerate()) return base;

        // Count existing reports for this period to determine the next revision number.
        long existing = req.getReportType() == BalanceSheetReportType.DAY
                ? balanceSheetRepository.countByPumpIdAndReportDateAndReportType(pumpId, req.getReportDate(), BalanceSheetReportType.DAY)
                : balanceSheetRepository.countByPumpIdAndReportDateAndShiftDefinitionId(pumpId, req.getReportDate(), req.getShiftDefinitionId());

        return base + " #" + (existing + 1);
    }

    /**
     * Returns individual Dip P/L entries for a pump over a date range.
     * Used by the Reports page "Dip P/L" tab to show a combined view of
     * maintenance removals (FuelDipEntry) and dipstick variances (DipCheck).
     */
    @Transactional(readOnly = true)
    public List<DipPlLineResponse> getDipPl(Long pumpId, LocalDate from, LocalDate to) {
        List<FuelDipEntry> dipEntries = fuelDipEntryRepository.findByPumpIdAndDipDateBetween(pumpId, from, to);

        OffsetDateTime periodStart = supportService.startOfBusinessDay(from);
        OffsetDateTime periodEnd   = supportService.startOfBusinessDay(to.plusDays(1));
        List<DipCheck> dipChecks = dipCheckRepository.findByPumpIdAndCheckedAtGreaterThanEqualAndCheckedAtLessThan(pumpId, periodStart, periodEnd);

        Map<Long, FuelType> tankFuelTypeMap = inputs.tankFuelTypesFor(pumpId);

        return supportService.buildDipPlEntries(pumpId, dipEntries, dipChecks, tankFuelTypeMap);
    }
}
