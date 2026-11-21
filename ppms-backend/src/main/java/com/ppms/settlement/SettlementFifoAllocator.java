package com.ppms.settlement;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.SortedSet;

/**
 * Spreads settlement money over the days that collected it, oldest day first. Money first clears
 * what was still unsettled before the window, so a settlement recorded on 4 May shows 29 April's
 * collection as settled on the 29 April row.
 */
final class SettlementFifoAllocator {

    private SettlementFifoAllocator() {
    }

    record Settlement(SettlementPaymentType type, BigDecimal amount) {
    }

    /**
     * @param dates             every day of the window that has a collection or a settlement, ascending
     * @param collected         collected amount per day and type inside the window
     * @param collectedBefore   total collected per type before the window
     * @param settledBefore     total settled per type before the window
     * @param activeSettlements active settlements of the window in the order they were made
     * @return settled amount per day and type; money beyond everything collected is not placed on any day
     */
    static Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> allocate(
            SortedSet<LocalDate> dates,
            Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collected,
            Map<SettlementPaymentType, BigDecimal> collectedBefore,
            Map<SettlementPaymentType, BigDecimal> settledBefore,
            List<Settlement> activeSettlements) {

        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> outstanding = new LinkedHashMap<>();
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> settled = new LinkedHashMap<>();
        for (LocalDate date : dates) {
            outstanding.put(date, zeros());
            outstanding.get(date).putAll(collected.getOrDefault(date, Map.of()));
            settled.put(date, zeros());
        }

        Map<SettlementPaymentType, BigDecimal> unsettledBefore = zeros();
        for (SettlementPaymentType type : SettlementPaymentType.values()) {
            BigDecimal collectedEarlier = collectedBefore.getOrDefault(type, BigDecimal.ZERO);
            BigDecimal settledEarlier = settledBefore.getOrDefault(type, BigDecimal.ZERO);
            unsettledBefore.put(type, collectedEarlier.subtract(settledEarlier).max(BigDecimal.ZERO));

            BigDecimal surplusBefore = settledEarlier.subtract(collectedEarlier).max(BigDecimal.ZERO);
            applyToOldestDays(type, surplusBefore, outstanding, settled);
        }

        for (Settlement settlement : activeSettlements) {
            SettlementPaymentType type = settlement.type();
            BigDecimal clearsEarlierDebt = unsettledBefore.get(type).min(settlement.amount());
            unsettledBefore.put(type, unsettledBefore.get(type).subtract(clearsEarlierDebt));
            applyToOldestDays(type, settlement.amount().subtract(clearsEarlierDebt), outstanding, settled);
        }
        return settled;
    }

    private static void applyToOldestDays(SettlementPaymentType type, BigDecimal amount,
                                          Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> outstanding,
                                          Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> settled) {
        BigDecimal remaining = amount;
        for (Map.Entry<LocalDate, Map<SettlementPaymentType, BigDecimal>> day : outstanding.entrySet()) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                return;
            }
            BigDecimal applied = day.getValue().get(type).min(remaining);
            if (applied.compareTo(BigDecimal.ZERO) > 0) {
                day.getValue().merge(type, applied, BigDecimal::subtract);
                settled.get(day.getKey()).merge(type, applied, BigDecimal::add);
                remaining = remaining.subtract(applied);
            }
        }
    }

    static Map<SettlementPaymentType, BigDecimal> zeros() {
        Map<SettlementPaymentType, BigDecimal> amounts = new EnumMap<>(SettlementPaymentType.class);
        for (SettlementPaymentType type : SettlementPaymentType.values()) {
            amounts.put(type, BigDecimal.ZERO);
        }
        return amounts;
    }
}
