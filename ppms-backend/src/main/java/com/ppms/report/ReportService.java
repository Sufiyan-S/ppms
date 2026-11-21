package com.ppms.report;

import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientRepository;
import com.ppms.credit.CreditInterestCharge;
import com.ppms.credit.CreditInterestChargeRepository;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ShiftRepository shiftRepository;
    private final UserRepository userRepository;
    private final PumpExpenseRepository expenseRepository;
    private final CreditInterestChargeRepository interestChargeRepository;
    private final CreditClientRepository creditClientRepository;


    // ── Operator Duty Report ──────────────────────────────────────────────────

    /**
     * Lists all shifts for a specific operator on a pump within the date range.
     * Includes a summary of totals across the period.
     */
    public OperatorDutyReport buildOperatorDutyReport(Long pumpId, Long operatorId, LocalDate from, LocalDate to) {
        List<Shift> shifts = shiftRepository.findByPumpIdAndOperatorIdAndDateRange(pumpId, operatorId, from, to);

        String operatorName = userRepository.findById(operatorId)
                .filter(operator -> !shifts.isEmpty() || pumpId.equals(operator.getAssignedPumpId()))
                .map(User::getFullName)
                .orElse("Unknown");

        List<OperatorDutyReport.ShiftLine> lines = shifts.stream().map(s -> new OperatorDutyReport.ShiftLine(
                s.getId(),
                s.getShiftDate(),
                s.getShiftName(),
                s.getActualStartTime(),
                s.getActualEndTime(),
                s.getTotalAmountDue() != null ? s.getTotalAmountDue() : BigDecimal.ZERO,
                s.getCashCollected() != null ? s.getCashCollected() : BigDecimal.ZERO,
                s.getUpiCollected() != null ? s.getUpiCollected() : BigDecimal.ZERO,
                s.getCardCollected() != null ? s.getCardCollected() : BigDecimal.ZERO,
                s.getCreditTotal() != null ? s.getCreditTotal() : BigDecimal.ZERO,
                s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO,
                s.getDiscrepancyType() != null ? s.getDiscrepancyType().name() : null,
                s.getStatus().name()
        )).toList();

        BigDecimal totalDue          = lines.stream().map(OperatorDutyReport.ShiftLine::totalAmountDue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalDiscrepancy  = lines.stream().map(OperatorDutyReport.ShiftLine::discrepancyAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        return new OperatorDutyReport(pumpId, operatorId, operatorName, from, to,
                lines.size(), totalDue.setScale(2, RoundingMode.HALF_UP),
                totalDiscrepancy.setScale(2, RoundingMode.HALF_UP), lines);
    }

    // ── Operator Discrepancy Report ───────────────────────────────────────────

    /**
     * Aggregates discrepancy shifts for all operators at a pump over the date range.
     * Only includes shifts that have a discrepancy (SHORT or OVER).
     * Grouped by operator for easy review.
     */
    public OperatorDiscrepancyReport buildOperatorDiscrepancyReport(Long pumpId, LocalDate from, LocalDate to) {
        List<Shift> shifts = shiftRepository.findClosedShiftsByDateRange(pumpId, from, to).stream()
                .filter(s -> s.getDiscrepancyType() != null)
                .toList();

        Map<Long, List<Shift>> byOperator = shifts.stream()
                .collect(Collectors.groupingBy(Shift::getOperatorId, LinkedHashMap::new, Collectors.toList()));

        Map<Long, String> nameById = userRepository.findAllById(byOperator.keySet()).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
        List<OperatorDiscrepancyReport.OperatorSummary> summaries = new ArrayList<>();

        for (Map.Entry<Long, List<Shift>> entry : byOperator.entrySet()) {
            Long opId = entry.getKey();
            String opName = nameById.getOrDefault(opId, "Unknown");

            List<Shift> opShifts = entry.getValue();
            BigDecimal totalShort = opShifts.stream()
                    .filter(s -> s.getDiscrepancyType() != null && s.getDiscrepancyType().name().equals("SHORT"))
                    .map(s -> s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal totalOver = opShifts.stream()
                    .filter(s -> s.getDiscrepancyType() != null && s.getDiscrepancyType().name().equals("OVER"))
                    .map(s -> s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            long unresolvedCount = opShifts.stream()
                    .filter(s -> s.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING)
                    .count();

            List<OperatorDiscrepancyReport.DiscrepancyLine> lines = opShifts.stream()
                    .sorted(Comparator.comparing(Shift::getShiftDate))
                    .map(s -> new OperatorDiscrepancyReport.DiscrepancyLine(
                            s.getId(),
                            s.getShiftDate(),
                            s.getShiftName(),
                            s.getDiscrepancyType().name(),
                            s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO,
                            s.getDiscrepancyReason(),
                            s.getStatus().name(),
                            s.getDiscrepancyResolution() != null ? s.getDiscrepancyResolution().name() : null
                    )).toList();

            summaries.add(new OperatorDiscrepancyReport.OperatorSummary(
                    opId, opName, opShifts.size(),
                    totalShort.setScale(2, RoundingMode.HALF_UP),
                    totalOver.setScale(2, RoundingMode.HALF_UP),
                    unresolvedCount, lines));
        }

        return new OperatorDiscrepancyReport(pumpId, from, to, shifts.size(), summaries);
    }



    public List<ReportController.ShiftReportLine> buildShiftReportLines(Long pumpId, LocalDate from, LocalDate to) {
        return shiftRepository.findClosedShiftsByDateRange(pumpId, from, to).stream()
                .map(shift -> new ReportController.ShiftReportLine(
                        shift.getId(),
                        shift.getShiftDate(),
                        shift.getShiftName(),
                        shift.getStatus() != null ? shift.getStatus().name() : null,
                        shift.getTotalAmountDue(),
                        shift.getCashCollected(),
                        shift.getUpiCollected(),
                        shift.getCardCollected(),
                        shift.getCreditTotal(),
                        shift.getDiscrepancyAmount(),
                        shift.getDiscrepancyType() != null ? shift.getDiscrepancyType().name() : null
                ))
                .toList();
    }

    public List<ReportController.ExpenseReportLine> buildExpenseReportLines(Long pumpId, LocalDate from, LocalDate to) {
        return expenseRepository.findByPumpIdAndExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(pumpId, from, to).stream()
                .map(expense -> new ReportController.ExpenseReportLine(
                        expense.getId(),
                        expense.getExpenseDate(),
                        expense.getCategory() != null ? expense.getCategory().name() : null,
                        expense.getAmount(),
                        expense.getDescription(),
                        expense.getApprovalStatus() != null ? expense.getApprovalStatus().name() : null
                ))
                .toList();
    }

    // ── Interest Accrual Report ───────────────────────────────────────────────

    /**
     * Builds the Interest Accrual Report for a pump over a date range.
     *
     * Lists all interest charges whose period_from falls within [from, to], grouped by client.
     * Each client line shows: client name, number of charges, total interest accrued.
     * The report total is the sum across all clients.
     *
     * Client names are batch-loaded to avoid N+1 queries.
     */
    public InterestAccrualReport buildInterestAccrualReport(Long pumpId, LocalDate from, LocalDate to) {
        List<CreditInterestCharge> charges = interestChargeRepository.findByPumpIdAndPeriodFromBetween(pumpId, from, to);

        // Batch-load client names — one query instead of one per charge
        Set<Long> clientIds = charges.stream().map(CreditInterestCharge::getClientId).collect(Collectors.toSet());
        Map<Long, String> clientNames = creditClientRepository.findAllById(clientIds).stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));

        // Group by client and build per-client lines
        Map<Long, List<CreditInterestCharge>> byClient = charges.stream()
                .collect(Collectors.groupingBy(CreditInterestCharge::getClientId, LinkedHashMap::new, Collectors.toList()));

        List<InterestAccrualReport.ClientLine> clientLines = byClient.entrySet().stream()
                .map(entry -> {
                    Long clientId = entry.getKey();
                    List<CreditInterestCharge> clientCharges = entry.getValue();
                    BigDecimal totalInterest = clientCharges.stream()
                            .map(CreditInterestCharge::getAmount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                            .setScale(2, RoundingMode.HALF_UP);
                    List<InterestAccrualReport.ChargeLine> chargeLines = clientCharges.stream()
                            .map(c -> new InterestAccrualReport.ChargeLine(
                                    c.getId(), c.getPeriodFrom(), c.getPeriodTo(),
                                    c.getOutstandingBalance(), c.getRateApplied(),
                                    c.getDaysApplied(), c.getAmount(), c.getSource()))
                            .toList();
                    return new InterestAccrualReport.ClientLine(
                            clientId, clientNames.getOrDefault(clientId, "Unknown"),
                            clientCharges.size(), totalInterest, chargeLines);
                })
                .toList();

        BigDecimal totalInterest = clientLines.stream()
                .map(InterestAccrualReport.ClientLine::totalInterest)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        return new InterestAccrualReport(pumpId, from, to, charges.size(), totalInterest, clientLines);
    }






}
