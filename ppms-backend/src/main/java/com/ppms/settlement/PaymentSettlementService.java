package com.ppms.settlement;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentSettlementService {

    private static final SettlementPaymentType[] SETTLEMENT_TYPES = {
        SettlementPaymentType.UPI, SettlementPaymentType.CARD, SettlementPaymentType.FLEET_CARD
    };

    private final PaymentSettlementRepository    settlementRepository;
    private final PaymentSettlementConfigRepository configRepository;
    private final ShiftRepository                shiftRepository;
    private final UserRepository                 userRepository;
    private final AuditService                   auditService;

    // ── DTOs ─────────────────────────────────────────────────────────────────

    @Data @Builder
    public static class SettlementResponse {
        private Long   id;
        private Long   pumpId;
        private String paymentType;
        private String settlementDate;
        private BigDecimal amountReceived;
        private String notes;
        private String recordedByUserName;
        private String createdAt;
        /** Wallet balance for this payment type at the time of recording. Null for legacy entries. */
        private BigDecimal pendingAtRecordTime;
        /** True when amountReceived was less than the pending balance at record time (partial settlement). */
        private boolean isPartial;
    }

    @Data @Builder
    public static class ConfigResponse {
        private Long   id;
        private String paymentType;
        private String alertTime;   // HH:mm
        private boolean enabled;
    }

    @Data @Builder
    public static class WalletSummary {
        /** Running balance (all-time collected − all-time settled) per type. */
        private BigDecimal upiPending;
        private BigDecimal cardPending;
        private BigDecimal fleetCardPending;
        private BigDecimal totalPending;
    }

    @Data @Builder
    public static class RecordSettlementRequest {
        private String     paymentType;   // UPI | CARD | FLEET_CARD
        private String     settlementDate; // YYYY-MM-DD
        private BigDecimal amountReceived;
        private String     notes;
    }

    @Data @Builder
    public static class UpdateConfigRequest {
        private String  alertTime;  // HH:mm
        private boolean enabled;
    }

    /** One entry per date in the requested range. Combines shift collections and recorded settlements. */
    @Data @Builder
    public static class DailySummaryEntry {
        private String     date;               // YYYY-MM-DD
        private BigDecimal upiCollected;       // from closed shifts
        private BigDecimal cardCollected;
        private BigDecimal fleetCardCollected;
        private BigDecimal upiSettled;         // FIFO-allocated from recorded settlements
        private BigDecimal cardSettled;        // FIFO-allocated from recorded settlements
        private BigDecimal fleetCardSettled;   // FIFO-allocated from recorded settlements
        private List<SettlementResponse> settlements; // individual records for this date
    }

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
        String[] parts = req.getAlertTime().split(":");
        if (parts.length < 2) {
            throw new BusinessException("alertTime must be in HH:mm format.");
        }
        java.time.LocalTime alertTime;
        try {
            alertTime = java.time.LocalTime.of(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]));
        } catch (NumberFormatException | java.time.DateTimeException e) {
            throw new BusinessException("Invalid alertTime: " + req.getAlertTime());
        }

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
                .collect(Collectors.toMap(com.ppms.user.User::getId, com.ppms.user.User::getFullName));

        return PagedResponse.of(page.map(s -> toResponse(s, names)));
    }

    @Transactional
    public SettlementResponse record(Long pumpId, RecordSettlementRequest req, User currentUser) {
        SettlementPaymentType type = parsePaymentType(req.getPaymentType());

        if (req.getAmountReceived() == null || req.getAmountReceived().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("amountReceived must be a non-negative number.");
        }
        if (req.getSettlementDate() == null || req.getSettlementDate().isBlank()) {
            throw new BusinessException("settlementDate is required.");
        }

        LocalDate settlementDate;
        try {
            settlementDate = LocalDate.parse(req.getSettlementDate());
        } catch (Exception e) {
            throw new BusinessException("settlementDate must be in YYYY-MM-DD format.");
        }
        if (settlementDate.isAfter(LocalDate.now())) {
            throw new BusinessException("settlementDate cannot be in the future.");
        }

        BigDecimal amount = req.getAmountReceived().setScale(2, RoundingMode.HALF_UP);

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
        // Per-date shift collections within the requested window
        List<Object[]> rows = shiftRepository.collectionsGroupedByDate(pumpId, from, to);
        Map<LocalDate, BigDecimal[]> collections = new java.util.LinkedHashMap<>();
        for (Object[] row : rows) {
            LocalDate date = (LocalDate) row[0];
            collections.put(date, new BigDecimal[]{
                    orZero((BigDecimal) row[1]),
                    orZero((BigDecimal) row[2]),
                    orZero((BigDecimal) row[3])
            });
        }

        // All settlement records in the window
        List<PaymentSettlement> allSettlements =
                settlementRepository.findByPumpIdAndSettlementDateBetweenOrderBySettlementDateAscCreatedAtAsc(pumpId, from, to);

        java.util.Set<Long> recorderIds = allSettlements.stream().map(PaymentSettlement::getRecordedByUserId).collect(Collectors.toSet());
        Map<Long, String> names = recorderIds.isEmpty() ? Map.of()
                : userRepository.findAllById(recorderIds).stream()
                        .collect(Collectors.toMap(com.ppms.user.User::getId, com.ppms.user.User::getFullName));

        Map<LocalDate, List<PaymentSettlement>> settlementsByDate = allSettlements.stream()
                .collect(Collectors.groupingBy(PaymentSettlement::getSettlementDate));

        // Union of dates from both sides — TreeSet iterates ascending by default
        java.util.TreeSet<LocalDate> allDates = new java.util.TreeSet<>();
        allDates.addAll(collections.keySet());
        allDates.addAll(settlementsByDate.keySet());

        // ── FIFO baseline: cumulative state just before the window starts ─────────
        // pool[i]         = surplus settlement money carried in from before this window
        //                   (happens when prior settlements exceeded prior collections)
        // pendingCarry[i] = collections from before this window not yet covered by any settlement
        //                   (oldest debt — must be consumed before current dates are credited)
        // Indices: 0=UPI, 1=CARD, 2=FLEET_CARD
        LocalDate dayBefore = from.isAfter(LocalDate.MIN) ? from.minusDays(1) : LocalDate.MIN;
        BigDecimal prevCollectedUpi   = orZero(shiftRepository.sumUpiCollectedByPumpIdAsOf(pumpId, dayBefore));
        BigDecimal prevCollectedCard  = orZero(shiftRepository.sumCardCollectedByPumpIdAsOf(pumpId, dayBefore));
        BigDecimal prevCollectedFleet = orZero(shiftRepository.sumFleetCardCollectedByPumpIdAsOf(pumpId, dayBefore));
        BigDecimal prevSettledUpi     = orZero(settlementRepository.sumAmountByPumpIdAndPaymentTypeAsOf(pumpId, SettlementPaymentType.UPI,        dayBefore));
        BigDecimal prevSettledCard    = orZero(settlementRepository.sumAmountByPumpIdAndPaymentTypeAsOf(pumpId, SettlementPaymentType.CARD,       dayBefore));
        BigDecimal prevSettledFleet   = orZero(settlementRepository.sumAmountByPumpIdAndPaymentTypeAsOf(pumpId, SettlementPaymentType.FLEET_CARD, dayBefore));

        BigDecimal[] pool         = {
            prevSettledUpi  .subtract(prevCollectedUpi  ).max(BigDecimal.ZERO),
            prevSettledCard .subtract(prevCollectedCard ).max(BigDecimal.ZERO),
            prevSettledFleet.subtract(prevCollectedFleet).max(BigDecimal.ZERO)
        };
        BigDecimal[] pendingCarry = {
            prevCollectedUpi  .subtract(prevSettledUpi  ).max(BigDecimal.ZERO),
            prevCollectedCard .subtract(prevSettledCard ).max(BigDecimal.ZERO),
            prevCollectedFleet.subtract(prevSettledFleet).max(BigDecimal.ZERO)
        };

        // ── FIFO allocation: process each settlement record chronologically ─────────
        // For each settlement, first clear pre-window pending debt, then apply to the
        // oldest outstanding window collections. This means a settlement recorded on
        // May 4 will correctly show April 29's pending as cleared in April 29's row.
        Map<LocalDate, BigDecimal[]> fifoSettled = new java.util.LinkedHashMap<>();
        Map<LocalDate, BigDecimal[]> outstanding = new java.util.LinkedHashMap<>();
        for (LocalDate date : allDates) {
            BigDecimal[] col = collections.getOrDefault(date, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            outstanding.put(date, new BigDecimal[]{col[0], col[1], col[2]});
            fifoSettled.put(date, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
        }

        // Pre-window surplus (settled > collected before window) clears oldest dates first
        for (int i = 0; i < 3; i++) {
            BigDecimal surplus = pool[i];
            for (LocalDate date : allDates) {
                if (surplus.compareTo(BigDecimal.ZERO) <= 0) break;
                BigDecimal[] out = outstanding.get(date);
                BigDecimal applyAmt = out[i].min(surplus);
                if (applyAmt.compareTo(BigDecimal.ZERO) > 0) {
                    out[i] = out[i].subtract(applyAmt);
                    fifoSettled.get(date)[i] = fifoSettled.get(date)[i].add(applyAmt);
                    surplus = surplus.subtract(applyAmt);
                }
            }
        }

        // allSettlements is ordered settlementDate asc, createdAt asc — correct FIFO order
        for (PaymentSettlement s : allSettlements) {
            int typeIdx = typeIndex(s.getPaymentType());
            BigDecimal remaining = s.getAmountReceived();

            // Clear pre-window pending carry (oldest debt) before touching window dates
            BigDecimal drain = pendingCarry[typeIdx].min(remaining);
            remaining = remaining.subtract(drain);
            pendingCarry[typeIdx] = pendingCarry[typeIdx].subtract(drain);

            // Apply to oldest outstanding window collections
            for (LocalDate date : allDates) {
                if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
                BigDecimal[] out = outstanding.get(date);
                BigDecimal applyAmt = out[typeIdx].min(remaining);
                if (applyAmt.compareTo(BigDecimal.ZERO) > 0) {
                    out[typeIdx] = out[typeIdx].subtract(applyAmt);
                    fifoSettled.get(date)[typeIdx] = fifoSettled.get(date)[typeIdx].add(applyAmt);
                    remaining = remaining.subtract(applyAmt);
                }
            }
            // remaining > 0: over-settlement; wallet balance reflects this, no date allocated
        }

        // ── Build response (newest first for display) ─────────────────────────────
        List<DailySummaryEntry> result = new java.util.ArrayList<>();
        for (LocalDate date : allDates.descendingSet()) {
            BigDecimal[] col = collections.getOrDefault(date, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal[] fs  = fifoSettled.getOrDefault(date, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            List<PaymentSettlement> daySettlements = settlementsByDate.getOrDefault(date, List.of());

            result.add(DailySummaryEntry.builder()
                    .date(date.toString())
                    .upiCollected(col[0].setScale(2, RoundingMode.HALF_UP))
                    .cardCollected(col[1].setScale(2, RoundingMode.HALF_UP))
                    .fleetCardCollected(col[2].setScale(2, RoundingMode.HALF_UP))
                    .upiSettled(fs[0].setScale(2, RoundingMode.HALF_UP))
                    .cardSettled(fs[1].setScale(2, RoundingMode.HALF_UP))
                    .fleetCardSettled(fs[2].setScale(2, RoundingMode.HALF_UP))
                    .settlements(daySettlements.stream().map(s -> toResponse(s, names)).toList())
                    .build());
        }
        int total = result.size();
        int start = (int) pageable.getOffset();
        int end   = Math.min(start + pageable.getPageSize(), total);
        List<DailySummaryEntry> pageSlice = start >= total ? List.of() : result.subList(start, end);
        return PagedResponse.of(new org.springframework.data.domain.PageImpl<>(pageSlice, pageable, total));
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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

    private static int typeIndex(SettlementPaymentType type) {
        for (int i = 0; i < SETTLEMENT_TYPES.length; i++) {
            if (SETTLEMENT_TYPES[i] == type) return i;
        }
        throw new IllegalStateException("Unknown settlement type: " + type);
    }

    private BigDecimal orZero(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
