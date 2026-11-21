package com.ppms.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record OperatorDiscrepancyReport(
        Long pumpId,
        LocalDate from,
        LocalDate to,
        int totalDiscrepancyShifts,
        List<OperatorSummary> operators) {

    public record OperatorSummary(
            Long operatorId,
            String operatorName,
            int discrepancyShiftCount,
            BigDecimal totalShortAmount,
            BigDecimal totalOverAmount,
            long unresolvedCount,
            List<DiscrepancyLine> shifts) {}

    public record DiscrepancyLine(
            Long shiftId,
            LocalDate shiftDate,
            String shiftWindow,
            String discrepancyType,
            BigDecimal discrepancyAmount,
            String discrepancyReason,
            String status,
            String resolution) {}
}
