package com.ppms.settlement;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentSettlementService {

    private static final Duration DUPLICATE_WINDOW = Duration.ofMinutes(2);

     private final PaymentSettlementRepository    settlementRepository;
    private final PaymentSettlementConfigRepository configRepository;
    private final ShiftRepository                shiftRepository;
    private final UserRepository                 userRepository;
    private final PumpLocationRepository         pumpLocationRepository;
    private final AuditService                   auditService;
    private final BusinessClock businessClock;








    // ── Config endpoints ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ConfigResponse> getConfigs(Long pumpId) {
        // Return configs for all three types; create defaults for types not yet configured.
        Map<SettlementPaymentType, PaymentSettlementConfig> existing =
                configRepository.findByPumpIdOrderByPaymentType(pumpId)
                        .stream()
                        .collect(Collectors.toMap(PaymentSettlementConfig::getPaymentType, c -> c));

        return Arrays.stream(SettlementPaymentType.values())
                .map(type -> {
                    PaymentSettlementConfig cfg = existing.get(type);
                    if (cfg == null) {
                        // Not yet saved — return defaults without persisting
                        return ConfigResponse.builder()
                                .id(null)
                                .paymentType(type.name())
                                .alertTime("18:00")
                                .enabled(true)
                                .build();
                    }
                    return toConfigResponse(cfg);
                })
                .toList();
    }

    /**
     * Upserts the alert config for one payment type at a pump.
     * Creates the row if it doesn't exist yet (first time config).
     */
    @Transactional
    public ConfigResponse upsertConfig(Long pumpId, String paymentTypeStr,
                                       UpdateConfigRequest req, User currentUser) {
        SettlementPaymentType type = parsePaymentType(paymentTypeStr);
        LocalTime alertTime = req.getAlertTime();

        PaymentSettlementConfig cfg = configRepository
                .findByPumpIdAndPaymentType(pumpId, type)
                .orElseGet(() -> PaymentSettlementConfig.builder()
                        .pumpId(pumpId)
                        .paymentType(type)
                        .build());

        cfg.setAlertTime(alertTime);
        cfg.setEnabled(req.isEnabled());
        cfg = configRepository.save(cfg);

        auditService.log(pumpId, AuditAction.SETTLEMENT_CONFIG_UPDATED,
                "PaymentSettlementConfig", cfg.getId().toString(),
                "Updated " + type.name() + " settlement config: alertTime=" + alertTime + ", enabled=" + req.isEnabled(),
                currentUser);

        log.info("Settlement config updated: pump={} type={} alertTime={} enabled={}",
                pumpId, type, alertTime, req.isEnabled());
        return toConfigResponse(cfg);
    }

    // ── Settlement records ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<SettlementResponse> list(Long pumpId, String paymentTypeFilter, Pageable pageable) {
        Page<PaymentSettlement> page;
        if (paymentTypeFilter != null && !paymentTypeFilter.isBlank()) {
            SettlementPaymentType type = parsePaymentType(paymentTypeFilter);
            page = settlementRepository
                    .findByPumpIdAndPaymentTypeOrderBySettlementDateDescCreatedAtDesc(pumpId, type, pageable);
        } else {
            page = settlementRepository
                    .findByPumpIdOrderBySettlementDateDescCreatedAtDesc(pumpId, pageable);
        }

        // Batch-load recorder names to avoid N+1
        var userIds = page.getContent().stream()
                .map(PaymentSettlement::getRecordedByUserId)
                .collect(Collectors.toSet());
        Map<Long, String> names = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        return PagedResponse.of(page.map(s -> toResponse(s, names)));
    }

    @Transactional
    public SettlementResponse record(Long pumpId, RecordSettlementRequest req, User currentUser) {
        SettlementPaymentType type = req.getPaymentType();
        LocalDate settlementDate = req.getSettlementDate();
        if (settlementDate.isAfter(businessClock.today())) {
            throw new BusinessException("settlementDate cannot be in the future.");
        }

        BigDecimal amount = req.getAmountReceived().setScale(2, RoundingMode.HALF_UP);

        lockPump(pumpId);
        if (settlementRepository.existsRecentDuplicate(pumpId, type, settlementDate, amount,
                businessClock.now().minus(DUPLICATE_WINDOW))) {
            throw new BusinessException("An identical " + type.name() + " settlement of ₹" + amount + " for "
                    + settlementDate + " was recorded in the last 2 minutes. Refresh the list before recording it again.");
        }

        // Capture wallet balance BEFORE this settlement is saved — used to detect partial settlements.
        BigDecimal collected = type == SettlementPaymentType.UPI   ? orZero(shiftRepository.sumUpiCollectedByPumpId(pumpId))
                             : type == SettlementPaymentType.CARD  ? orZero(shiftRepository.sumCardCollectedByPumpId(pumpId))
                             : orZero(shiftRepository.sumFleetCardCollectedByPumpId(pumpId));
        BigDecimal alreadySettled = orZero(settlementRepository.sumAmountByPumpIdAndPaymentType(pumpId, type));
        BigDecimal pendingAtRecordTime = collected.subtract(alreadySettled).setScale(2, RoundingMode.HALF_UP);

        PaymentSettlement settlement = PaymentSettlement.builder()
                .pumpId(pumpId)
                .paymentType(type)
                .settlementDate(settlementDate)
                .amountReceived(amount)
                .notes(req.getNotes())
                .recordedByUserId(currentUser.getId())
                .pendingAtRecordTime(pendingAtRecordTime)
                .build();

        settlement = settlementRepository.save(settlement);

        auditService.log(pumpId, AuditAction.SETTLEMENT_RECORDED,
                "PaymentSettlement", settlement.getId().toString(),
                "Recorded " + type.name() + " settlement of ₹" + amount + " on " + settlementDate,
                currentUser);

        log.info("Settlement recorded: pump={} type={} amount={} date={} by={}",
                pumpId, type, amount, settlementDate, currentUser.getId());

        Map<Long, String> names = Map.of(currentUser.getId(), currentUser.getFullName());
        return toResponse(settlement, names);
    }

    /**
     * Voids a settlement entered by mistake. The record stays in history; every total
     * (wallet balance, daily FIFO allocation, balance sheet) is computed from ACTIVE rows only,
     * so voiding automatically re-opens the collections it had cleared.
     */
    @Transactional
    public SettlementResponse voidSettlement(Long pumpId, Long settlementId, VoidSettlementRequest req, User currentUser) {
        lockPump(pumpId);
        PaymentSettlement settlement = settlementRepository.findByIdAndPumpId(settlementId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Settlement not found"));
        if (PaymentSettlement.VOIDED.equals(settlement.getVoidStatus())) {
            throw new BusinessException("This settlement is already voided.");
        }

        settlement.setVoidStatus(PaymentSettlement.VOIDED);
        settlement.setVoidReason(req.getReason().trim());
        settlement.setVoidedByUserId(currentUser.getId());
        settlement.setVoidedAt(businessClock.now());
        settlement = settlementRepository.save(settlement);

        auditService.log(pumpId, AuditAction.SETTLEMENT_VOIDED,
                "PaymentSettlement", settlementId.toString(),
                "Voided " + settlement.getPaymentType().name() + " settlement of ₹" + settlement.getAmountReceived()
                        + " on " + settlement.getSettlementDate() + ". Reason: " + settlement.getVoidReason(),
                currentUser);
        log.info("Settlement voided: pump={} id={} type={} amount={} by={}",
                pumpId, settlementId, settlement.getPaymentType(), settlement.getAmountReceived(), currentUser.getId());

        Map<Long, String> names = userRepository.findAllById(Set.of(settlement.getRecordedByUserId())).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
        return toResponse(settlement, names);
    }

    // ── Wallet summary ────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public WalletSummary getWalletSummary(Long pumpId) {
        BigDecimal upiCollected    = shiftRepository.sumUpiCollectedByPumpId(pumpId);
        BigDecimal cardCollected   = shiftRepository.sumCardCollectedByPumpId(pumpId);
        BigDecimal fleetCollected  = shiftRepository.sumFleetCardCollectedByPumpId(pumpId);

        BigDecimal upiSettled      = settlementRepository.sumAmountByPumpIdAndPaymentType(pumpId, SettlementPaymentType.UPI);
        BigDecimal cardSettled     = settlementRepository.sumAmountByPumpIdAndPaymentType(pumpId, SettlementPaymentType.CARD);
        BigDecimal fleetSettled    = settlementRepository.sumAmountByPumpIdAndPaymentType(pumpId, SettlementPaymentType.FLEET_CARD);

        BigDecimal upiPending      = orZero(upiCollected).subtract(orZero(upiSettled)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal cardPending     = orZero(cardCollected).subtract(orZero(cardSettled)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal fleetPending    = orZero(fleetCollected).subtract(orZero(fleetSettled)).setScale(2, RoundingMode.HALF_UP);

        return WalletSummary.builder()
                .upiPending(upiPending)
                .cardPending(cardPending)
                .fleetCardPending(fleetPending)
                .totalPending(upiPending.add(cardPending).add(fleetPending).setScale(2, RoundingMode.HALF_UP))
                .build();
    }

    // ── Daily summary ─────────────────────────────────────────────────────────

    /**
     * Returns one DailySummaryEntry per date in [from, to], merging:
     *  - Shift collections (UPI/Card/Fleet grouped by shiftDate)
     *  - Recorded settlement entries (grouped by settlementDate)
     * Dates with no activity on either side are omitted.
     *
     * Settled amounts are computed using FIFO allocation: when a settlement is
     * received on date D it first clears the oldest outstanding pending amounts
     * before being credited to D's own collections. This means a ₹79K settlement
     * received on May 4 will show May 3's pending as cleared, not just May 4's.
     */
    @Transactional(readOnly = true)
    public PagedResponse<DailySummaryEntry> getDailySummary(Long pumpId, LocalDate from, LocalDate to, Pageable pageable) {
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collected = collectionsByDate(pumpId, from, to);

        // Every settlement record in the window is listed; only ACTIVE ones count towards settled amounts.
        List<PaymentSettlement> allSettlements =
                settlementRepository.findAllByPumpIdAndSettlementDateBetween(pumpId, from, to);
        Map<LocalDate, List<PaymentSettlement>> settlementsByDate = allSettlements.stream()
                .collect(Collectors.groupingBy(PaymentSettlement::getSettlementDate));

        TreeSet<LocalDate> allDates = new TreeSet<>(collected.keySet());
        allDates.addAll(settlementsByDate.keySet());

        // The repository returns settlements by settlement date then creation time, which is FIFO order.
        List<SettlementFifoAllocator.Settlement> activeSettlements = allSettlements.stream()
                .filter(s -> PaymentSettlement.ACTIVE.equals(s.getVoidStatus()))
                .map(s -> new SettlementFifoAllocator.Settlement(s.getPaymentType(), s.getAmountReceived()))
                .toList();
        LocalDate dayBefore = from.isAfter(LocalDate.MIN) ? from.minusDays(1) : LocalDate.MIN;
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> settled = SettlementFifoAllocator.allocate(
                allDates, collected, collectedAsOf(pumpId, dayBefore), settledAsOf(pumpId, dayBefore), activeSettlements);

        Map<Long, String> names = recorderNames(allSettlements);
        List<DailySummaryEntry> newestFirst = new ArrayList<>();
        for (LocalDate date : allDates.descendingSet()) {
            Map<SettlementPaymentType, BigDecimal> dayCollected =
                    collected.getOrDefault(date, SettlementFifoAllocator.zeros());
            Map<SettlementPaymentType, BigDecimal> daySettled = settled.get(date);
            newestFirst.add(DailySummaryEntry.builder()
                    .date(date.toString())
                    .upiCollected(money(dayCollected.get(SettlementPaymentType.UPI)))
                    .cardCollected(money(dayCollected.get(SettlementPaymentType.CARD)))
                    .fleetCardCollected(money(dayCollected.get(SettlementPaymentType.FLEET_CARD)))
                    .upiSettled(money(daySettled.get(SettlementPaymentType.UPI)))
                    .cardSettled(money(daySettled.get(SettlementPaymentType.CARD)))
                    .fleetCardSettled(money(daySettled.get(SettlementPaymentType.FLEET_CARD)))
                    .settlements(settlementsByDate.getOrDefault(date, List.of()).stream()
                            .map(s -> toResponse(s, names))
                            .toList())
                    .build());
        }

        int total = newestFirst.size();
        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), total);
        List<DailySummaryEntry> pageSlice = start >= total ? List.of() : newestFirst.subList(start, end);
        return PagedResponse.of(new PageImpl<>(pageSlice, pageable, total));
    }

    private Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collectionsByDate(Long pumpId, LocalDate from, LocalDate to) {
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collected = new LinkedHashMap<>();
        for (Object[] row : shiftRepository.collectionsGroupedByDate(pumpId, from, to)) {
            Map<SettlementPaymentType, BigDecimal> day = SettlementFifoAllocator.zeros();
            day.put(SettlementPaymentType.UPI, orZero((BigDecimal) row[1]));
            day.put(SettlementPaymentType.CARD, orZero((BigDecimal) row[2]));
            day.put(SettlementPaymentType.FLEET_CARD, orZero((BigDecimal) row[3]));
            collected.put((LocalDate) row[0], day);
        }
        return collected;
    }

    private Map<SettlementPaymentType, BigDecimal> collectedAsOf(Long pumpId, LocalDate date) {
        Map<SettlementPaymentType, BigDecimal> collected = new EnumMap<>(SettlementPaymentType.class);
        collected.put(SettlementPaymentType.UPI, orZero(shiftRepository.sumUpiCollectedByPumpIdAsOf(pumpId, date)));
        collected.put(SettlementPaymentType.CARD, orZero(shiftRepository.sumCardCollectedByPumpIdAsOf(pumpId, date)));
        collected.put(SettlementPaymentType.FLEET_CARD, orZero(shiftRepository.sumFleetCardCollectedByPumpIdAsOf(pumpId, date)));
        return collected;
    }

    private Map<SettlementPaymentType, BigDecimal> settledAsOf(Long pumpId, LocalDate date) {
        Map<SettlementPaymentType, BigDecimal> settled = new EnumMap<>(SettlementPaymentType.class);
        for (SettlementPaymentType type : SettlementPaymentType.values()) {
            settled.put(type, orZero(settlementRepository.sumAmountByPumpIdAndPaymentTypeAsOf(pumpId, type, date)));
        }
        return settled;
    }

    private Map<Long, String> recorderNames(List<PaymentSettlement> settlements) {
        Set<Long> recorderIds = settlements.stream().map(PaymentSettlement::getRecordedByUserId).collect(Collectors.toSet());
        return recorderIds.isEmpty() ? Map.of()
                : userRepository.findAllById(recorderIds).stream()
                        .collect(Collectors.toMap(User::getId, User::getFullName));
    }

    private BigDecimal money(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.HALF_UP);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Serialises settlement writes per pump so duplicate detection and voiding see each other's results. */
    private void lockPump(Long pumpId) {
        pumpLocationRepository.findByIdForUpdate(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found: " + pumpId));
    }

    private SettlementPaymentType parsePaymentType(String value) {
        try {
            return SettlementPaymentType.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Invalid paymentType '" + value + "'. Must be UPI, CARD, or FLEET_CARD.");
        }
    }

    private SettlementResponse toResponse(PaymentSettlement s, Map<Long, String> userNames) {
        boolean partial = s.getPendingAtRecordTime() != null
                && s.getAmountReceived().compareTo(s.getPendingAtRecordTime()) < 0;
        return SettlementResponse.builder()
                .id(s.getId())
                .pumpId(s.getPumpId())
                .paymentType(s.getPaymentType().name())
                .settlementDate(s.getSettlementDate().toString())
                .amountReceived(s.getAmountReceived())
                .notes(s.getNotes())
                .recordedByUserName(userNames.getOrDefault(s.getRecordedByUserId(), "Unknown"))
                .createdAt(s.getCreatedAt() != null ? s.getCreatedAt().toString() : null)
                .pendingAtRecordTime(s.getPendingAtRecordTime())
                .isPartial(partial)
                .voidStatus(s.getVoidStatus())
                .voidReason(s.getVoidReason())
                .voidedAt(s.getVoidedAt() != null ? s.getVoidedAt().toString() : null)
                .build();
    }

    private ConfigResponse toConfigResponse(PaymentSettlementConfig cfg) {
        return ConfigResponse.builder()
                .id(cfg.getId())
                .paymentType(cfg.getPaymentType().name())
                .alertTime(String.format("%02d:%02d", cfg.getAlertTime().getHour(), cfg.getAlertTime().getMinute()))
                .enabled(cfg.isEnabled())
                .build();
    }

    private BigDecimal orZero(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
