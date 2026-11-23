package com.ppms.settlement;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Consecutive collection days of one payment type whose money has not reached the bank yet.
 * {@code ageDays} counts from the oldest day; {@code overdue} is true once that day is past the T+2 settlement window.
 */
public record PendingSettlementRange(
        SettlementPaymentType paymentType,
        LocalDate fromDate,
        LocalDate toDate,
        BigDecimal amount,
        long ageDays,
        boolean overdue,
        List<Day> days
) {

    public record Day(LocalDate date, BigDecimal amount) {
    }
}
