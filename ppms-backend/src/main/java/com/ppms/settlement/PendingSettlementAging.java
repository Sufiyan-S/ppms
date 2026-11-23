package com.ppms.settlement;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Works out which collection days are still unsettled, clearing the oldest days first with everything settled so far,
 * and groups what is left into runs of consecutive days per payment type.
 */
final class PendingSettlementAging {

    /** Card and UPI money is due in the bank within two days of collection (T+2). */
    static final int SETTLEMENT_WINDOW_DAYS = 2;

    private PendingSettlementAging() {
    }

    /**
     * @param collected    collected amount per day and type, for every day that collected anything
     * @param totalSettled all active settlements so far per type
     * @param today        the business date the ages are counted to
     * @return unsettled runs ordered by payment type, then oldest first
     */
    static List<PendingSettlementRange> unsettledRanges(Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collected,
                                                        Map<SettlementPaymentType, BigDecimal> totalSettled,
                                                        LocalDate today) {
        TreeSet<LocalDate> days = new TreeSet<>(collected.keySet());
        List<SettlementFifoAllocator.Settlement> settlements = totalSettled.entrySet().stream()
                .map(entry -> new SettlementFifoAllocator.Settlement(entry.getKey(), entry.getValue()))
                .toList();
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> settled = SettlementFifoAllocator.allocate(
                days, collected, SettlementFifoAllocator.zeros(), SettlementFifoAllocator.zeros(), settlements);

        List<PendingSettlementRange> ranges = new ArrayList<>();
        for (SettlementPaymentType type : SettlementPaymentType.values()) {
            List<PendingSettlementRange.Day> run = new ArrayList<>();
            for (LocalDate day : days) {
                BigDecimal unsettled = collected.get(day).getOrDefault(type, BigDecimal.ZERO)
                        .subtract(settled.get(day).get(type));
                if (unsettled.signum() <= 0) {
                    continue;
                }
                if (!run.isEmpty() && !continuesRun(run.getLast().date(), day, today)) {
                    ranges.add(toRange(type, run, today));
                    run = new ArrayList<>();
                }
                run.add(new PendingSettlementRange.Day(day, unsettled.setScale(2, RoundingMode.HALF_UP)));
            }
            if (!run.isEmpty()) {
                ranges.add(toRange(type, run, today));
            }
        }
        return ranges;
    }

    private static boolean continuesRun(LocalDate previous, LocalDate day, LocalDate today) {
        return previous.plusDays(1).equals(day) && isOverdue(previous, today) == isOverdue(day, today);
    }

    private static boolean isOverdue(LocalDate collectionDate, LocalDate today) {
        return ChronoUnit.DAYS.between(collectionDate, today) > SETTLEMENT_WINDOW_DAYS;
    }

    private static PendingSettlementRange toRange(SettlementPaymentType type, List<PendingSettlementRange.Day> run,
                                                  LocalDate today) {
        LocalDate oldest = run.getFirst().date();
        BigDecimal amount = run.stream().map(PendingSettlementRange.Day::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new PendingSettlementRange(type, oldest, run.getLast().date(), amount,
                ChronoUnit.DAYS.between(oldest, today), isOverdue(oldest, today), List.copyOf(run));
    }
}
