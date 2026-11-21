package com.ppms.invoice;

import com.ppms.credit.BillingCycle;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class InvoicePeriodTest {

    @Test
    void weeklyCycleIsTheLastFullMondayToSundayWeek() {
        InvoicePeriod period = InvoicePeriod.lastCompletedCycle(BillingCycle.WEEKLY, LocalDate.of(2026, 11, 18));

        assertThat(period).isEqualTo(new InvoicePeriod(LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 15)));
    }

    @Test
    void onMondayTheWeekThatEndedYesterdayIsComplete() {
        InvoicePeriod period = InvoicePeriod.lastCompletedCycle(BillingCycle.WEEKLY, LocalDate.of(2026, 11, 16));

        assertThat(period).isEqualTo(new InvoicePeriod(LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 15)));
    }

    @Test
    void onSundayTheRunningWeekIsNotYetComplete() {
        InvoicePeriod period = InvoicePeriod.lastCompletedCycle(BillingCycle.WEEKLY, LocalDate.of(2026, 11, 22));

        assertThat(period).isEqualTo(new InvoicePeriod(LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 15)));
    }

    @Test
    void monthlyCycleIsThePreviousCalendarMonth() {
        InvoicePeriod period = InvoicePeriod.lastCompletedCycle(BillingCycle.MONTHLY, LocalDate.of(2026, 3, 1));

        assertThat(period).isEqualTo(new InvoicePeriod(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 28)));
    }

    @Test
    void monthlyCycleInJanuaryIsDecemberOfTheYearBefore() {
        InvoicePeriod period = InvoicePeriod.lastCompletedCycle(BillingCycle.MONTHLY, LocalDate.of(2027, 1, 20));

        assertThat(period).isEqualTo(new InvoicePeriod(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 31)));
    }
}
