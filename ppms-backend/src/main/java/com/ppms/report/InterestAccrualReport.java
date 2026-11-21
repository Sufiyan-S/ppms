package com.ppms.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record InterestAccrualReport(
        Long pumpId,
        LocalDate from,
        LocalDate to,
        int totalCharges,
        BigDecimal totalInterest,
        List<ClientLine> clients) {

    public record ClientLine(
            Long clientId,
            String clientName,
            int chargeCount,
            BigDecimal totalInterest,
            List<ChargeLine> charges) {}

    public record ChargeLine(
            Long id,
            LocalDate periodFrom,
            LocalDate periodTo,
            BigDecimal outstandingBalance,
            BigDecimal rateApplied,
            Integer daysApplied,
            BigDecimal amount,
            String source) {}
}
