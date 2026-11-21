package com.ppms.invoice;

import com.ppms.credit.BillingCycle;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

/**
 * A billing period, both dates inclusive. The last completed cycle follows the interest staging job:
 * a weekly cycle is the Monday–Sunday week that has ended, a monthly cycle the calendar month that has ended.
 */
public record InvoicePeriod(LocalDate periodFrom, LocalDate periodTo) {

    public static InvoicePeriod lastCompletedCycle(BillingCycle billingCycle, LocalDate today) {
        if (billingCycle == BillingCycle.WEEKLY) {
            LocalDate lastSunday = today.with(TemporalAdjusters.previous(DayOfWeek.SUNDAY));
            return new InvoicePeriod(lastSunday.minusDays(6), lastSunday);
        }
        LocalDate firstOfLastMonth = today.minusMonths(1).withDayOfMonth(1);
        return new InvoicePeriod(firstOfLastMonth, firstOfLastMonth.with(TemporalAdjusters.lastDayOfMonth()));
    }
}
