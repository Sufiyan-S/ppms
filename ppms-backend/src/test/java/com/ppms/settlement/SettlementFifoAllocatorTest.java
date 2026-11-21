package com.ppms.settlement;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

import static com.ppms.settlement.SettlementPaymentType.CARD;
import static com.ppms.settlement.SettlementPaymentType.UPI;
import static org.assertj.core.api.Assertions.assertThat;

class SettlementFifoAllocatorTest {

    private static final LocalDate DAY_1 = LocalDate.of(2026, 4, 29);
    private static final LocalDate DAY_2 = LocalDate.of(2026, 4, 30);

    @Test
    void settlementClearsTheOldestDayFirst() {
        var settled = SettlementFifoAllocator.allocate(days(DAY_1, DAY_2),
                Map.of(DAY_1, amounts(UPI, "1000"), DAY_2, amounts(UPI, "500")),
                Map.of(), Map.of(),
                List.of(new SettlementFifoAllocator.Settlement(UPI, new BigDecimal("1200"))));

        assertThat(settled.get(DAY_1).get(UPI)).isEqualByComparingTo("1000");
        assertThat(settled.get(DAY_2).get(UPI)).isEqualByComparingTo("200");
    }

    @Test
    void settlementFirstPaysOffWhatWasUnsettledBeforeTheWindow() {
        var settled = SettlementFifoAllocator.allocate(days(DAY_1),
                Map.of(DAY_1, amounts(UPI, "1000")),
                Map.of(UPI, new BigDecimal("700")), Map.of(UPI, new BigDecimal("300")),
                List.of(new SettlementFifoAllocator.Settlement(UPI, new BigDecimal("900"))));

        assertThat(settled.get(DAY_1).get(UPI)).isEqualByComparingTo("500");
    }

    @Test
    void moneySettledInAdvanceBeforeTheWindowCoversTheFirstDays() {
        var settled = SettlementFifoAllocator.allocate(days(DAY_1, DAY_2),
                Map.of(DAY_1, amounts(UPI, "400"), DAY_2, amounts(UPI, "400")),
                Map.of(UPI, new BigDecimal("100")), Map.of(UPI, new BigDecimal("600")),
                List.of());

        assertThat(settled.get(DAY_1).get(UPI)).isEqualByComparingTo("400");
        assertThat(settled.get(DAY_2).get(UPI)).isEqualByComparingTo("100");
    }

    @Test
    void eachPaymentTypeIsSettledOnlyByItsOwnSettlements() {
        var settled = SettlementFifoAllocator.allocate(days(DAY_1),
                Map.of(DAY_1, amounts(UPI, "1000")),
                Map.of(), Map.of(),
                List.of(new SettlementFifoAllocator.Settlement(CARD, new BigDecimal("1000"))));

        assertThat(settled.get(DAY_1).get(UPI)).isEqualByComparingTo("0");
        assertThat(settled.get(DAY_1).get(CARD)).isEqualByComparingTo("0");
    }

    @Test
    void moneyBeyondEverythingCollectedIsNotPlacedOnAnyDay() {
        var settled = SettlementFifoAllocator.allocate(days(DAY_1),
                Map.of(DAY_1, amounts(UPI, "300")),
                Map.of(), Map.of(),
                List.of(new SettlementFifoAllocator.Settlement(UPI, new BigDecimal("1000"))));

        assertThat(settled.get(DAY_1).get(UPI)).isEqualByComparingTo("300");
    }

    private static TreeSet<LocalDate> days(LocalDate... dates) {
        return new TreeSet<>(List.of(dates));
    }

    private static Map<SettlementPaymentType, BigDecimal> amounts(SettlementPaymentType type, String amount) {
        Map<SettlementPaymentType, BigDecimal> amounts = new EnumMap<>(SettlementPaymentType.class);
        amounts.put(type, new BigDecimal(amount));
        return amounts;
    }
}
