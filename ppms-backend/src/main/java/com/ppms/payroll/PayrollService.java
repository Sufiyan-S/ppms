package com.ppms.payroll;

import com.ppms.common.time.BusinessClock;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.planning.StaffLeaveRepository;
import com.ppms.shift.DiscrepancyResolution;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PayrollService {

    private static final BigDecimal MINUTES_PER_HOUR = BigDecimal.valueOf(60);

    private final PayrollRepository              payrollRepository;
    private final PayrollResolvedShiftRepository resolvedShiftRepository;
    private final UserRepository                 userRepository;
    private final ShiftRepository                shiftRepository;
    private final StaffLeaveRepository           staffLeaveRepository;
    private final AuditService                   auditService;
    private final BusinessClock businessClock;

    private record ResolvedShifts(BigDecimal outOfPeriodDeductions, List<PayrollResolvedShift> links) {}

    /**
     * Resolves the selected discrepancies, computes the draft and saves it in one transaction,
     * so a failure (e.g. a duplicate period) leaves no shift resolved without a payroll record.
     */
    @Transactional
    public PayrollRecord generate(Long pumpId, GeneratePayrollRequest req, User currentUser) {
        if (req.getPeriodTo().isBefore(req.getPeriodFrom())) {
            throw new BusinessException("periodTo must be on or after periodFrom");
        }

        // The staff row lock serialises payroll generation per person, so two overlapping runs cannot both pass the check.
        User staff = userRepository.findByIdForUpdate(req.getUserId())
                .filter(found -> pumpId.equals(found.getAssignedPumpId()))
                .orElseThrow(() -> new ResourceNotFoundException("Staff member not found"));

        payrollRepository.findFirstByPumpIdAndUserIdAndPeriodFromLessThanEqualAndPeriodToGreaterThanEqual(
                        pumpId, req.getUserId(), req.getPeriodTo(), req.getPeriodFrom())
                .ifPresent(existing -> {
                    throw new BusinessException("A payroll record for " + staff.getFullName() + " already covers "
                            + existing.getPeriodFrom() + " to " + existing.getPeriodTo()
                            + ", which overlaps " + req.getPeriodFrom() + " to " + req.getPeriodTo() + ".");
                });

        ResolvedShifts resolved = resolveSelectedDiscrepancies(pumpId, req, currentUser);

        PayrollRecord record = staff.getRole() == UserRole.OPERATOR
                ? buildHourlyShiftPayroll(pumpId, req, staff)
                : buildDailyPayroll(pumpId, req, staff);
        applyDeductions(record, pumpId, req, resolved.outOfPeriodDeductions());

        PayrollRecord saved = payrollRepository.save(record);
        resolved.links().forEach(link -> link.setPayrollId(saved.getId()));
        resolvedShiftRepository.saveAll(resolved.links());

        log.info("Payroll generated: pump={} user={} role={} type={} period={}/{} gross={} status=DRAFT",
                pumpId, req.getUserId(), staff.getRole(), saved.getSalaryType(),
                req.getPeriodFrom(), req.getPeriodTo(), saved.getGrossAmount());
        return saved;
    }

    /**
     * Deletes a DRAFT payroll and restores the discrepancies it resolved to their earlier pending status,
     * so the deduction can be taken again in a later pay run.
     */
    @Transactional
    public void deleteDraft(Long pumpId, Long recordId, User currentUser) {
        PayrollRecord record = payrollRepository.findById(recordId)
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Payroll record not found"));
        if (record.getStatus() != PayrollStatus.DRAFT) {
            throw new BusinessException("Only draft payroll records can be deleted.");
        }

        for (PayrollResolvedShift link : resolvedShiftRepository.findByPayrollId(recordId)) {
            restoreDiscrepancy(link);
        }

        payrollRepository.delete(record);
        auditService.log(pumpId, AuditAction.PAYROLL_DELETED,
                "PayrollRecord", recordId.toString(),
                "Payroll draft deleted: recordId=" + recordId + " grossAmount=₹" + record.getGrossAmount(),
                currentUser);
    }

    private void restoreDiscrepancy(PayrollResolvedShift link) {
        Shift shift = shiftRepository.findByIdForUpdate(link.getShiftId())
                .orElseThrow(() -> new ResourceNotFoundException("Shift #" + link.getShiftId() + " not found"));
        boolean stillResolvedByPayroll = shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_RESOLVED
                && shift.getDiscrepancyResolution() == DiscrepancyResolution.SALARY_DEDUCTION;
        if (!stillResolvedByPayroll) {
            throw new BusinessException("Shift #" + shift.getId() + " was changed after this payroll was generated ("
                    + shift.getStatus() + "); resolve it manually before deleting the draft.");
        }
        shift.setStatus(link.getPreviousStatus());
        shift.setDiscrepancyResolution(null);
        shift.setDiscrepancyResolvedById(null);
        shift.setDiscrepancyResolvedAt(null);
        shiftRepository.save(shift);
    }

    /**
     * Returns the deduction for selected shifts OUTSIDE the period only; shifts inside the period
     * are picked up by findSalaryDeductionShifts after resolution and must not be counted twice.
     */
    private ResolvedShifts resolveSelectedDiscrepancies(Long pumpId, GeneratePayrollRequest req, User resolvedBy) {
        List<Long> ids = req.getDeductFromSalaryShiftIds();
        if (ids == null || ids.isEmpty()) {
            return new ResolvedShifts(BigDecimal.ZERO, List.of());
        }

        BigDecimal outOfPeriod = BigDecimal.ZERO;
        List<PayrollResolvedShift> links = new ArrayList<>();
        for (Long shiftId : ids.stream().distinct().sorted().toList()) {
            Shift shift = shiftRepository.findByIdForUpdate(shiftId)
                    .filter(found -> found.getPumpId().equals(pumpId) && found.getOperatorId().equals(req.getUserId()))
                    .orElseThrow(() -> new BusinessException(
                            "Shift #" + shiftId + " does not belong to this pump / operator."));
            boolean isPending = shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING
                    || shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING_APPROVAL;
            if (!isPending) {
                throw new BusinessException("Shift #" + shiftId + " is not in a pending discrepancy state.");
            }

            links.add(PayrollResolvedShift.builder()
                    .shiftId(shiftId)
                    .previousStatus(shift.getStatus())
                    .build());

            shift.setDiscrepancyResolution(DiscrepancyResolution.SALARY_DEDUCTION);
            shift.setDiscrepancyResolvedById(resolvedBy.getId());
            shift.setDiscrepancyResolvedAt(businessClock.now());
            shift.setStatus(ShiftStatus.CLOSED_DISCREPANCY_RESOLVED);
            shiftRepository.save(shift);

            boolean outsidePeriod = shift.getShiftDate().isBefore(req.getPeriodFrom())
                    || shift.getShiftDate().isAfter(req.getPeriodTo());
            if (outsidePeriod) {
                outOfPeriod = outOfPeriod.add(amountOrZero(shift.getDiscrepancyAmount()));
            }
        }
        shiftRepository.flush();
        return new ResolvedShifts(outOfPeriod, links);
    }

    /** Hourly pay for OPERATOR: worked minutes × shift-window hourly rate, rounded once. */
    private PayrollRecord buildHourlyShiftPayroll(Long pumpId, GeneratePayrollRequest req, User staff) {
        BigDecimal shift1Rate = staff.getShift1HourlyRate();
        BigDecimal standardRate = staff.getStandardHourlyRate();
        if (shift1Rate == null || shift1Rate.compareTo(BigDecimal.ZERO) <= 0
                || standardRate == null || standardRate.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(
                    staff.getFullName() + " does not have hourly rates configured. " +
                    "Set their Shift 1 (night) and standard hourly rates in Setup → Staff before generating payroll.");
        }

        List<Shift> closedShifts = shiftRepository.findByPumpIdAndOperatorIdAndDateRange(
                        pumpId, req.getUserId(), req.getPeriodFrom(), req.getPeriodTo())
                .stream()
                .filter(shift -> shift.getActualEndTime() != null)
                .toList();

        long shift1Minutes = 0;
        long standardMinutes = 0;
        int shift1Count = 0;
        int standardCount = 0;
        for (Shift shift : closedShifts) {
            long minutes = Duration.between(shift.getActualStartTime(), shift.getActualEndTime()).toMinutes();
            if (Boolean.TRUE.equals(shift.getIsNightShift())) {
                shift1Minutes += minutes;
                shift1Count++;
            } else {
                standardMinutes += minutes;
                standardCount++;
            }
        }

        BigDecimal gross = BigDecimal.valueOf(shift1Minutes).multiply(shift1Rate)
                .add(BigDecimal.valueOf(standardMinutes).multiply(standardRate))
                .divide(MINUTES_PER_HOUR, 2, RoundingMode.HALF_UP);

        return PayrollRecord.builder()
                .salaryType("HOURLY_SHIFT")
                .pumpId(pumpId)
                .userId(req.getUserId())
                .periodFrom(req.getPeriodFrom())
                .periodTo(req.getPeriodTo())
                .totalShifts(shift1Count + standardCount)
                .shift1Shifts(shift1Count).shift1Hours(toHours(shift1Minutes)).shift1RateSnapshot(shift1Rate)
                .standardShifts(standardCount).standardHours(toHours(standardMinutes)).standardRateSnapshot(standardRate)
                .grossAmount(gross)
                .notes(req.getNotes())
                .status(PayrollStatus.DRAFT)
                .build();
    }

    /** Daily pay for MANAGER / ADMIN / ACCOUNTANT: (calendar days − leave days) × daily rate. */
    private PayrollRecord buildDailyPayroll(Long pumpId, GeneratePayrollRequest req, User staff) {
        BigDecimal dailyRate = staff.getDailyRate();
        if (dailyRate == null || dailyRate.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(
                    staff.getFullName() + " does not have a daily rate configured. " +
                    "Set their daily rate in Setup → Staff before generating payroll.");
        }

        int totalDays = (int) ChronoUnit.DAYS.between(req.getPeriodFrom(), req.getPeriodTo()) + 1;
        int leaveDays = (int) staffLeaveRepository.countByUserIdAndLeaveDateBetween(
                req.getUserId(), req.getPeriodFrom(), req.getPeriodTo());
        int daysWorked = Math.max(0, totalDays - leaveDays);

        return PayrollRecord.builder()
                .salaryType("DAILY")
                .pumpId(pumpId)
                .userId(req.getUserId())
                .periodFrom(req.getPeriodFrom())
                .periodTo(req.getPeriodTo())
                .totalShifts(0)
                .shift1Shifts(0).shift1Hours(BigDecimal.ZERO)
                .standardShifts(0).standardHours(BigDecimal.ZERO)
                .totalDays(totalDays)
                .leaveDays(leaveDays)
                .daysWorked(daysWorked)
                .dailyRateSnapshot(dailyRate)
                .grossAmount(dailyRate.multiply(BigDecimal.valueOf(daysWorked)).setScale(2, RoundingMode.HALF_UP))
                .notes(req.getNotes())
                .status(PayrollStatus.DRAFT)
                .build();
    }

    private void applyDeductions(PayrollRecord record, Long pumpId, GeneratePayrollRequest req,
                                 BigDecimal outOfPeriodDeductions) {
        BigDecimal periodDeductions = shiftRepository.findSalaryDeductionShifts(
                        pumpId, req.getUserId(), req.getPeriodFrom(), req.getPeriodTo())
                .stream()
                .map(shift -> amountOrZero(shift.getDiscrepancyAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal deductions = periodDeductions.add(outOfPeriodDeductions).setScale(2, RoundingMode.HALF_UP);
        BigDecimal netBeforeFloor = record.getGrossAmount().subtract(deductions);

        record.setDeductions(deductions);
        record.setNetPay(netBeforeFloor.max(BigDecimal.ZERO));
        record.setUncoveredDeductions(netBeforeFloor.negate().max(BigDecimal.ZERO));

        if (record.getUncoveredDeductions().signum() > 0) {
            log.warn("Payroll deductions exceed gross pay: pump={} user={} period={}/{} gross={} deductions={} uncovered={}",
                    pumpId, req.getUserId(), req.getPeriodFrom(), req.getPeriodTo(),
                    record.getGrossAmount(), deductions, record.getUncoveredDeductions());
        }
    }

    private static BigDecimal toHours(long minutes) {
        return BigDecimal.valueOf(minutes).divide(MINUTES_PER_HOUR, 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal amountOrZero(BigDecimal amount) {
        return amount != null ? amount : BigDecimal.ZERO;
    }
}
