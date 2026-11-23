package com.ppms.attention;

import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.text.CodedText;
import com.ppms.common.text.ServerTextCodes;
import com.ppms.common.time.BusinessClock;
import com.ppms.credit.CreditAgingResponse;
import com.ppms.credit.CreditAgingService;
import com.ppms.credit.CreditPayment;
import com.ppms.credit.CreditPaymentRepository;
import com.ppms.credit.CreditStatus;
import com.ppms.document.PumpDocument;
import com.ppms.document.PumpDocumentRepository;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.invoice.CreditInvoiceService;
import com.ppms.pump.NozzleCalibrationLog;
import com.ppms.pump.NozzleCalibrationLogRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.PumpService;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.report.BalanceSheet;
import com.ppms.report.BalanceSheetReportType;
import com.ppms.report.BalanceSheetRepository;
import com.ppms.settlement.PaymentSettlementRepository;
import com.ppms.settlement.SettlementPaymentType;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The ranked list of things an Owner, Admin or Accountant should act on today. Each check reads its records for the
 * whole pump in a fixed number of queries; Accountants see only the credit checks, the records their role can open.
 */
@Service
@RequiredArgsConstructor
public class AttentionService {

    static final int INVESTIGATION_DAYS = 7;
    static final int SETTLEMENT_GRACE_DAYS = 2;
    static final int BALANCE_SHEET_LOOKBACK_DAYS = 7;
    static final int STALE_SHEET_LOOKBACK_DAYS = 30;
    static final int DOCUMENT_WARNING_DAYS = 30;
    static final int CALIBRATION_WARNING_DAYS = 7;
    private static final int DOCUMENT_PAGE_SIZE = 500;

    private static final String APPROVALS_PATH = "/dashboard/approvals";
    private static final String DISCREPANCIES_PATH = "/dashboard/shifts?history=discrepancies";
    private static final String SHIFTS_PATH = "/dashboard/shifts?history=all";
    private static final String OVERDUE_CREDIT_PATH = "/dashboard/credit?tab=ledger&filter=overdue";
    private static final String OVER_LIMIT_CREDIT_PATH = "/dashboard/credit?tab=ledger&filter=over-limit";
    private static final String SETTLEMENTS_PATH = "/dashboard/settlements";
    private static final String BALANCE_SHEETS_PATH = "/dashboard/balance-sheets";
    private static final String DOCUMENTS_PATH = "/dashboard/documents";
    private static final String CALIBRATION_PATH = "/dashboard/calibration";
    private static final String SETUP_PATH = "/dashboard/setup";

    private static final Comparator<AttentionItem> MOST_URGENT_FIRST = Comparator
            .comparing(AttentionItem::severity)
            .thenComparing(AttentionItem::amount, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(AttentionItem::count, Comparator.reverseOrder());

    private final PumpService pumpService;
    private final PumpLocationRepository pumpLocationRepository;
    private final PumpExpenseRepository expenseRepository;
    private final CreditPaymentRepository creditPaymentRepository;
    private final CreditAgingService creditAgingService;
    private final ShiftRepository shiftRepository;
    private final PaymentSettlementRepository settlementRepository;
    private final BalanceSheetRepository balanceSheetRepository;
    private final PumpDocumentRepository documentRepository;
    private final NozzleCalibrationLogRepository calibrationLogRepository;
    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final UndergroundTankRepository tankRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;
    private final BusinessClock businessClock;

    @Transactional(readOnly = true)
    public List<AttentionItem> itemsForPump(Long pumpId, User currentUser) {
        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found"));
        List<AttentionItem> items = checksFor(pump, currentUser);
        items.sort(MOST_URGENT_FIRST);
        return items;
    }

    /** Every pump the user can open, the pump named on each item. */
    @Transactional(readOnly = true)
    public List<AttentionItem> itemsForMyPumps(User currentUser) {
        List<AttentionItem> items = new ArrayList<>();
        for (PumpLocation pump : pumpService.findMyPumps(currentUser)) {
            items.addAll(checksFor(pump, currentUser));
        }
        items.sort(MOST_URGENT_FIRST);
        return items;
    }

    private List<AttentionItem> checksFor(PumpLocation pump, User currentUser) {
        List<AttentionItem> items = new ArrayList<>();
        Item item = new Item(pump);
        addCreditItems(items, item, pump.getId());
        if (currentUser.getRole() == UserRole.ACCOUNTANT) {
            return items;
        }
        addPendingApprovals(items, item, pump.getId());
        addShortages(items, item, pump.getId());
        addUnsettledPayments(items, item, pump.getId());
        addBalanceSheets(items, item, pump.getId());
        addShifts(items, item, pump.getId());
        addDocuments(items, item, pump.getId());
        addCalibrations(items, item, pump.getId());
        addSetupAndPrices(items, item, pump);
        return items;
    }

    private void addCreditItems(List<AttentionItem> items, Item item, Long pumpId) {
        List<CreditAgingResponse.Row> rows = creditAgingService.agingOfPump(pumpId).clients();
        List<CreditAgingResponse.Row> overdue = rows.stream().filter(row -> row.daysOverdue() > 0).toList();
        if (!overdue.isEmpty()) {
            items.add(item.of(AttentionType.OVERDUE_CREDIT, AttentionSeverity.HIGH, overdue.size(),
                    sumOf(overdue.stream().map(CreditAgingResponse.Row::outstanding).toList()),
                    counted(ServerTextCodes.ATTENTION_OVERDUE_CREDIT, overdue.size(),
                            plural(overdue.size(), "credit client") + " past the billing cycle without paying"),
                    OVERDUE_CREDIT_PATH));
        }
        List<CreditAgingResponse.Row> overLimit = rows.stream()
                .filter(row -> row.creditStatus() == CreditStatus.OVER_LIMIT).toList();
        if (!overLimit.isEmpty()) {
            items.add(item.of(AttentionType.OVER_LIMIT_CREDIT, AttentionSeverity.MEDIUM, overLimit.size(),
                    sumOf(overLimit.stream().map(CreditAgingResponse.Row::outstanding).toList()),
                    counted(ServerTextCodes.ATTENTION_OVER_LIMIT_CREDIT, overLimit.size(),
                            plural(overLimit.size(), "credit client") + " at or over the credit limit"),
                    OVER_LIMIT_CREDIT_PATH));
        }
    }

    private void addPendingApprovals(List<AttentionItem> items, Item item, Long pumpId) {
        long expenseCount = expenseRepository.countByPumpIdAndApprovalStatus(pumpId, ExpenseApprovalStatus.PENDING_APPROVAL);
        BigDecimal expenseAmount = expenseRepository.sumAmountByPumpIdAndApprovalStatus(pumpId, ExpenseApprovalStatus.PENDING_APPROVAL);
        List<CreditPayment> payments = creditPaymentRepository.findPendingApprovalByPumpId(pumpId);
        long total = expenseCount + payments.size();
        if (total == 0) {
            return;
        }
        BigDecimal amount = sumOf(List.of(expenseAmount,
                sumOf(payments.stream().map(CreditPayment::getAmount).toList())));
        String waiting = " waiting for your approval";
        CodedText reason;
        if (payments.isEmpty()) {
            reason = counted(ServerTextCodes.ATTENTION_PENDING_EXPENSES, expenseCount, plural(expenseCount, "expense") + waiting);
        } else if (expenseCount == 0) {
            reason = counted(ServerTextCodes.ATTENTION_PENDING_CREDIT_PAYMENTS, payments.size(),
                    plural(payments.size(), "credit payment") + waiting);
        } else {
            reason = new CodedText(ServerTextCodes.ATTENTION_PENDING_EXPENSES_AND_CREDIT_PAYMENTS,
                    params("expenseCount", expenseCount, "paymentCount", payments.size()),
                    plural(expenseCount, "expense") + " and " + plural(payments.size(), "credit payment") + waiting);
        }
        items.add(item.of(AttentionType.PENDING_APPROVALS, AttentionSeverity.MEDIUM, total, amount, reason, APPROVALS_PATH));
    }

    private void addShortages(List<AttentionItem> items, Item item, Long pumpId) {
        List<Shift> shortages = shiftRepository.findUnresolvedShortagesByPumpId(pumpId);
        List<Shift> escalated = shortages.stream()
                .filter(shift -> shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING_APPROVAL)
                .toList();
        if (!escalated.isEmpty()) {
            items.add(item.of(AttentionType.ESCALATED_SHORTAGES, AttentionSeverity.HIGH, escalated.size(),
                    sumOf(escalated.stream().map(Shift::getDiscrepancyAmount).toList()),
                    counted(ServerTextCodes.ATTENTION_ESCALATED_SHORTAGES, escalated.size(),
                            plural(escalated.size(), "cash shortage") + " escalated to you for a decision"),
                    DISCREPANCIES_PATH));
        }
        var cutoff = businessClock.startOfDay(businessClock.today().minusDays(INVESTIGATION_DAYS));
        List<Shift> longInvestigations = shortages.stream()
                .filter(shift -> shift.getInvestigationStartedAt() != null && shift.getInvestigationStartedAt().isBefore(cutoff))
                .toList();
        if (!longInvestigations.isEmpty()) {
            items.add(item.of(AttentionType.LONG_INVESTIGATIONS, AttentionSeverity.MEDIUM, longInvestigations.size(),
                    sumOf(longInvestigations.stream().map(Shift::getDiscrepancyAmount).toList()),
                    new CodedText(ServerTextCodes.ATTENTION_LONG_INVESTIGATIONS,
                            params("count", longInvestigations.size(), "days", INVESTIGATION_DAYS),
                            plural(longInvestigations.size(), "cash shortage") + " under investigation for more than "
                                    + INVESTIGATION_DAYS + " days"),
                    DISCREPANCIES_PATH));
        }
    }

    /**
     * Settlements clear the oldest collections first, so what is still unsettled from collections dated before the
     * grace period is everything collected up to then less everything settled so far.
     */
    private void addUnsettledPayments(List<AttentionItem> items, Item item, Long pumpId) {
        LocalDate lastDueDate = businessClock.today().minusDays(SETTLEMENT_GRACE_DAYS + 1L);
        Map<SettlementPaymentType, BigDecimal> collected = Map.of(
                SettlementPaymentType.UPI, orZero(shiftRepository.sumUpiCollectedByPumpIdAsOf(pumpId, lastDueDate)),
                SettlementPaymentType.CARD, orZero(shiftRepository.sumCardCollectedByPumpIdAsOf(pumpId, lastDueDate)),
                SettlementPaymentType.FLEET_CARD, orZero(shiftRepository.sumFleetCardCollectedByPumpIdAsOf(pumpId, lastDueDate)));
        List<BigDecimal> late = new ArrayList<>();
        collected.forEach((type, amount) -> {
            BigDecimal unsettled = amount.subtract(orZero(settlementRepository.sumAmountByPumpIdAndPaymentType(pumpId, type)));
            if (unsettled.signum() > 0) {
                late.add(unsettled);
            }
        });
        if (!late.isEmpty()) {
            items.add(item.of(AttentionType.UNSETTLED_PAYMENTS, AttentionSeverity.MEDIUM, late.size(), sumOf(late),
                    CodedText.of(ServerTextCodes.ATTENTION_UNSETTLED_PAYMENTS, "days", SETTLEMENT_GRACE_DAYS,
                            "UPI, card or fleet card money not received in the bank more than "
                                    + SETTLEMENT_GRACE_DAYS + " days after collection"),
                    SETTLEMENTS_PATH));
        }
    }

    private void addBalanceSheets(List<AttentionItem> items, Item item, Long pumpId) {
        LocalDate today = businessClock.today();
        List<BalanceSheet> sheets = balanceSheetRepository.findByPumpIdAndReportDateBetweenOrderByReportDateDescGeneratedAtDesc(
                pumpId, today.minusDays(STALE_SHEET_LOOKBACK_DAYS), today);
        Set<LocalDate> daysWithDaySheet = sheets.stream()
                .filter(sheet -> sheet.getReportType() == BalanceSheetReportType.DAY)
                .map(BalanceSheet::getReportDate)
                .collect(Collectors.toSet());
        long missingDays = shiftRepository.collectionsGroupedByDate(pumpId, today.minusDays(BALANCE_SHEET_LOOKBACK_DAYS),
                        today.minusDays(1)).stream()
                .map(row -> (LocalDate) row[0])
                .filter(date -> !daysWithDaySheet.contains(date))
                .count();
        long staleSheets = sheets.stream().filter(BalanceSheet::isStale).count();
        if (missingDays + staleSheets == 0) {
            return;
        }
        String missingText = plural(missingDays, "recent day") + " with closed shifts but no day balance sheet";
        String staleText = plural(staleSheets, "balance sheet") + " out of date after later changes";
        CodedText reason;
        if (staleSheets == 0) {
            reason = counted(ServerTextCodes.ATTENTION_MISSING_DAY_SHEETS, missingDays, missingText);
        } else if (missingDays == 0) {
            reason = counted(ServerTextCodes.ATTENTION_STALE_SHEETS, staleSheets, staleText);
        } else {
            reason = new CodedText(ServerTextCodes.ATTENTION_MISSING_AND_STALE_SHEETS,
                    params("missingCount", missingDays, "staleCount", staleSheets), missingText + "; " + staleText);
        }
        items.add(item.of(AttentionType.BALANCE_SHEETS, staleSheets > 0 ? AttentionSeverity.MEDIUM : AttentionSeverity.LOW,
                missingDays + staleSheets, null, reason, BALANCE_SHEETS_PATH));
    }

    private void addShifts(List<AttentionItem> items, Item item, Long pumpId) {
        Map<ShiftStatus, Long> openByStatus = new HashMap<>();
        for (Object[] row : shiftRepository.countOpenShiftsByPumpAndStatus(List.of(pumpId))) {
            openByStatus.put((ShiftStatus) row[1], (Long) row[2]);
        }
        long autoClosed = openByStatus.getOrDefault(ShiftStatus.AUTO_CLOSED_OVERDUE, 0L);
        if (autoClosed > 0) {
            items.add(item.of(AttentionType.AUTO_CLOSED_SHIFTS, AttentionSeverity.HIGH, autoClosed, null,
                    counted(ServerTextCodes.ATTENTION_AUTO_CLOSED_SHIFTS, autoClosed,
                            plural(autoClosed, "shift") + " closed automatically without closing meter readings"),
                    SHIFTS_PATH));
        }
        long overdue = openByStatus.getOrDefault(ShiftStatus.OPEN_OVERDUE, 0L);
        if (overdue > 0) {
            items.add(item.of(AttentionType.OVERDUE_SHIFTS, AttentionSeverity.MEDIUM, overdue, null,
                    counted(ServerTextCodes.ATTENTION_OVERDUE_SHIFTS, overdue,
                            plural(overdue, "shift") + " still open past the scheduled end"),
                    SHIFTS_PATH));
        }
    }

    private void addDocuments(List<AttentionItem> items, Item item, Long pumpId) {
        LocalDate today = businessClock.today();
        List<PumpDocument> expiring = documentRepository
                .findByPumpIdOrderByExpiryDateAsc(pumpId, PageRequest.of(0, DOCUMENT_PAGE_SIZE)).stream()
                .filter(doc -> doc.getExpiryDate() != null && !doc.getExpiryDate().isAfter(today.plusDays(DOCUMENT_WARNING_DAYS)))
                .toList();
        if (expiring.isEmpty()) {
            return;
        }
        long expired = expiring.stream().filter(doc -> doc.getExpiryDate().isBefore(today)).count();
        long expiringSoon = expiring.size() - expired;
        String expiredText = plural(expired, "document") + " expired";
        String expiringText = plural(expiringSoon, "document") + " expiring within " + DOCUMENT_WARNING_DAYS + " days";
        CodedText reason;
        if (expiringSoon == 0) {
            reason = counted(ServerTextCodes.ATTENTION_EXPIRED_DOCUMENTS, expired, expiredText);
        } else if (expired == 0) {
            reason = new CodedText(ServerTextCodes.ATTENTION_EXPIRING_DOCUMENTS,
                    params("count", expiringSoon, "days", DOCUMENT_WARNING_DAYS), expiringText);
        } else {
            Map<String, Object> params = params("expiredCount", expired, "expiringCount", expiringSoon);
            params.put("days", DOCUMENT_WARNING_DAYS);
            reason = new CodedText(ServerTextCodes.ATTENTION_EXPIRED_AND_EXPIRING_DOCUMENTS, params,
                    expiredText + " and " + expiringText);
        }
        items.add(item.of(AttentionType.EXPIRING_DOCUMENTS, expired > 0 ? AttentionSeverity.HIGH : AttentionSeverity.MEDIUM,
                expiring.size(), null, reason, DOCUMENTS_PATH));
    }

    private void addCalibrations(List<AttentionItem> items, Item item, Long pumpId) {
        LocalDate today = businessClock.today();
        List<NozzleCalibrationLog> overdue = calibrationLogRepository.findOverdueCalibrations(pumpId, today);
        Set<Long> nozzleIds = new HashSet<>();
        overdue.forEach(calibration -> nozzleIds.add(calibration.getNozzleId()));
        boolean anyOverdue = !nozzleIds.isEmpty();
        calibrationLogRepository.findCalibrationsDueBetween(pumpId, today, today.plusDays(CALIBRATION_WARNING_DAYS))
                .forEach(calibration -> nozzleIds.add(calibration.getNozzleId()));
        if (nozzleIds.isEmpty()) {
            return;
        }
        items.add(item.of(AttentionType.CALIBRATIONS_DUE, anyOverdue ? AttentionSeverity.HIGH : AttentionSeverity.MEDIUM,
                nozzleIds.size(), null, calibrationReason(nozzleIds.size(), anyOverdue), CALIBRATION_PATH));
    }

    private static CodedText calibrationReason(int nozzleCount, boolean anyOverdue) {
        String nozzles = plural(nozzleCount, "nozzle");
        if (anyOverdue) {
            return counted(ServerTextCodes.ATTENTION_CALIBRATIONS_OVERDUE, nozzleCount, nozzles + " with calibration due or overdue");
        }
        return new CodedText(ServerTextCodes.ATTENTION_CALIBRATIONS_DUE_SOON,
                params("count", nozzleCount, "days", CALIBRATION_WARNING_DAYS),
                nozzles + " due for calibration within " + CALIBRATION_WARNING_DAYS + " days");
    }

    private void addSetupAndPrices(List<AttentionItem> items, Item item, PumpLocation pump) {
        LocalDate today = businessClock.today();
        List<GlobalFuelPrice> prices = fuelPriceRepository.findCurrentPricesForPump(pump.getId());
        Map<String, String> missing = new LinkedHashMap<>();
        if (!CreditInvoiceService.hasGstDetails(pump)) {
            missing.put("GST_DETAILS", "GST details");
        }
        if (tankRepository.findByPumpId(pump.getId()).stream().allMatch(tank -> tank.getStatus() == TankStatus.DECOMMISSIONED)) {
            missing.put("TANKS", "tanks");
        }
        if (prices.isEmpty()) {
            missing.put("FUEL_PRICES", "fuel prices");
        }
        if (shiftDefinitionRepository.findActiveForPumpOnDate(pump.getId(), today).isEmpty()) {
            missing.put("SHIFT_TIMINGS", "shift timings");
        }
        if (!missing.isEmpty()) {
            items.add(item.of(AttentionType.SETUP_INCOMPLETE, AttentionSeverity.MEDIUM, missing.size(), null,
                    CodedText.of(ServerTextCodes.ATTENTION_SETUP_INCOMPLETE, "missingCodes", List.copyOf(missing.keySet()),
                            "Setup is missing " + String.join(", ", missing.values())),
                    SETUP_PATH));
        }
        boolean pricesFromEarlierDay = prices.stream().anyMatch(price ->
                price.getEffectiveFrom().atZoneSameInstant(businessClock.zone()).toLocalDate().isBefore(today));
        if (pricesFromEarlierDay) {
            items.add(item.of(AttentionType.STALE_FUEL_PRICES, AttentionSeverity.LOW, 1, null,
                    CodedText.of(ServerTextCodes.ATTENTION_STALE_FUEL_PRICES,
                            "Fuel prices were last set before today — confirm or update them"),
                    SETUP_PATH));
        }
    }

    private static BigDecimal sumOf(List<BigDecimal> amounts) {
        return amounts.stream().filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal orZero(BigDecimal amount) {
        return amount != null ? amount : BigDecimal.ZERO;
    }

    private static String plural(long count, String noun) {
        return count + " " + noun + (count == 1 ? "" : "s");
    }

    private static CodedText counted(String code, long count, String text) {
        return CodedText.of(code, "count", count, text);
    }

    private static Map<String, Object> params(String firstName, long firstValue, String secondName, long secondValue) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put(firstName, firstValue);
        params.put(secondName, secondValue);
        return params;
    }

    private record Item(PumpLocation pump) {
        AttentionItem of(AttentionType type, AttentionSeverity severity, long count, BigDecimal amount,
                         CodedText reason, String targetPath) {
            return new AttentionItem(type, severity, pump.getId(), pump.getName(), count, amount,
                    reason.text(), reason.code(), reason.params(), targetPath);
        }
    }
}
