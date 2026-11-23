package com.ppms.settlement;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.ppms.settlement.SettlementPaymentType.CARD;
import static com.ppms.settlement.SettlementPaymentType.UPI;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class PendingSettlementAgingTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 23);

    @Test
    void settledMoneyClearsTheOldestDaysAndConsecutiveUnsettledDaysFormOneRange() {
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collected = new HashMap<>();
        collected.put(TODAY.minusDays(6), amounts(UPI, "1000"));
        collected.put(TODAY.minusDays(5), amounts(UPI, "800"));
        collected.put(TODAY.minusDays(4), amounts(UPI, "700"));
        collected.put(TODAY.minusDays(3), amounts(UPI, "600"));

        List<PendingSettlementRange> ranges = PendingSettlementAging.unsettledRanges(collected, amounts(UPI, "1300"), TODAY);

        assertThat(ranges).hasSize(1);
        PendingSettlementRange range = ranges.getFirst();
        assertThat(range.paymentType()).isEqualTo(UPI);
        assertThat(range.fromDate()).isEqualTo(TODAY.minusDays(5));
        assertThat(range.toDate()).isEqualTo(TODAY.minusDays(3));
        assertThat(range.amount()).isEqualByComparingTo("1800.00");
        assertThat(range.days().getFirst().amount()).isEqualByComparingTo("500.00");
        assertThat(range.ageDays()).isEqualTo(5);
        assertThat(range.overdue()).isTrue();
    }

    @Test
    void daysStillInsideTheTPlusTwoWindowAreSplitFromOverdueOnes() {
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collected = new HashMap<>();
        collected.put(TODAY.minusDays(3), amounts(UPI, "300"));
        collected.put(TODAY.minusDays(2), amounts(UPI, "200"));
        collected.put(TODAY, amounts(UPI, "100"));

        List<PendingSettlementRange> ranges = PendingSettlementAging.unsettledRanges(collected, Map.of(), TODAY);

        assertThat(ranges).extracting(PendingSettlementRange::fromDate, PendingSettlementRange::overdue)
                .containsExactly(
                        tuple(TODAY.minusDays(3), true),
                        tuple(TODAY.minusDays(2), false),
                        tuple(TODAY, false));
        assertThat(ranges.get(1).ageDays()).isEqualTo(2);
    }

    @Test
    void eachPaymentTypeIsAgedSeparatelyAndFullySettledTypesAreLeftOut() {
        Map<SettlementPaymentType, BigDecimal> day = new EnumMap<>(SettlementPaymentType.class);
        day.put(UPI, new BigDecimal("500"));
        day.put(CARD, new BigDecimal("400"));
        Map<LocalDate, Map<SettlementPaymentType, BigDecimal>> collected = Map.of(TODAY.minusDays(1), day);

        List<PendingSettlementRange> ranges = PendingSettlementAging.unsettledRanges(collected, amounts(UPI, "500"), TODAY);

        assertThat(ranges).singleElement().satisfies(range -> {
            assertThat(range.paymentType()).isEqualTo(CARD);
            assertThat(range.amount()).isEqualByComparingTo("400.00");
        });
    }

    @Test
    void nothingCollectedMeansNothingPending() {
        assertThat(PendingSettlementAging.unsettledRanges(Map.of(), Map.of(), TODAY)).isEmpty();
    }

    private static Map<SettlementPaymentType, BigDecimal> amounts(SettlementPaymentType type, String amount) {
        Map<SettlementPaymentType, BigDecimal> amounts = new EnumMap<>(SettlementPaymentType.class);
        amounts.put(type, new BigDecimal(amount));
        return amounts;
    }
}
