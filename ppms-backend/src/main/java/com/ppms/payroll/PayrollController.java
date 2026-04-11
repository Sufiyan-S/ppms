package com.ppms.payroll;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.planning.StaffLeaveRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasRole('OWNER')")
public class PayrollController {

    private final PayrollRepository    payrollRepository;
    private final UserRepository       userRepository;
    private final ShiftRepository      shiftRepository;
    private final StaffLeaveRepository staffLeaveRepository;
    private final AuditService         auditService;

    /**
     * GET /api/pumps/{pumpId}/payroll
     * Returns all payroll records for the pump, newest first.
     */
    @GetMapping("/{pumpId}/payroll")
    public List<PayrollRecord> getPayroll(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return payrollRepository.findByPumpIdOrderByPeriodFromDescCreatedAtDesc(pumpId);
    }

    /**
     * POST /api/pumps/{pumpId}/payroll/generate
     * Calculates payroll for a staff member based on their closed shift history.
     *
     * How it works:
     *   1. Fetch all CLOSED shifts for the user in the requested period.
     *   2. For each shift, calculate actual hours worked:
     *        hours = (actualEndTime − actualStartTime) in minutes / 60
     *   3. Partition shifts by window:
     *        SHIFT_1 (00:00–08:00) → night rate (shift1HourlyRate)
     *        SHIFT_2 + SHIFT_3     → standard day rate (standardHourlyRate)
     *   4. gross = (shift1_hours × shift1_hourly_rate) + (standard_hours × standard_hourly_rate)
     *   5. Creates a DRAFT record with a per-category breakdown for the Owner to review.
     *
     * Both shift1HourlyRate and standardHourlyRate must be configured in Setup → Staff
     * before payroll can be generated for that staff member.
     */
    @PostMapping("/{pumpId}/payroll/generate")
    @ResponseStatus(HttpStatus.CREATED)
    public PayrollRecord generatePayroll(
            @PathVariable Long pumpId,
            @Valid @RequestBody GeneratePayrollRequest req,
            @AuthenticationPrincipal User currentUser) {
        if (req.getPeriodTo().isBefore(req.getPeriodFrom())) {
            throw new BusinessException("periodTo must be on or after periodFrom");
        }

        User staff = userRepository.findById(req.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Staff member not found"));

        // Route to the appropriate calculation based on the staff member's role.
        // OPERATOR → hourly rates per shift window (SHIFT_1 = night, SHIFT_2/3 = standard)
        // MANAGER / ADMIN / ACCOUNTANT → flat daily rate minus recorded leave days
        boolean isOperator = staff.getRole() == UserRole.OPERATOR;

        PayrollRecord record = isOperator
                ? generateHourlyShiftPayroll(pumpId, req, staff)
                : generateDailyPayroll(pumpId, req, staff);

        PayrollRecord saved = payrollRepository.save(record);
        log.info("Payroll generated: pump={} user={} role={} type={} period={}/{} gross={} status=DRAFT",
                pumpId, req.getUserId(), staff.getRole(), record.getSalaryType(),
                req.getPeriodFrom(), req.getPeriodTo(), record.getGrossAmount());
        return saved;
    }

    /**
     * PATCH /api/pumps/{pumpId}/payroll/{recordId}/status
     * Advances the payroll record to the next lifecycle state.
     * DRAFT → APPROVED → PAID
     * Only OWNER can approve or mark as paid.
     */
    @PatchMapping("/{pumpId}/payroll/{recordId}/status")
    public PayrollRecord updateStatus(
            @PathVariable Long pumpId,
            @PathVariable Long recordId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal User currentUser) {
        String statusStr = body.get("status");
        if (statusStr == null) throw new BusinessException("status is required");

        PayrollStatus newStatus;
        try {
            newStatus = PayrollStatus.valueOf(statusStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Invalid status. Allowed: DRAFT, APPROVED, PAID");
        }

        PayrollRecord record = payrollRepository.findById(recordId)
                .orElseThrow(() -> new ResourceNotFoundException("Payroll record not found"));

        if (!record.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Payroll record not found");
        }

        // Enforce the allowed lifecycle transitions
        boolean valid = (record.getStatus() == PayrollStatus.DRAFT && newStatus == PayrollStatus.APPROVED)
                     || (record.getStatus() == PayrollStatus.APPROVED && newStatus == PayrollStatus.PAID)
                     || (record.getStatus() == PayrollStatus.APPROVED && newStatus == PayrollStatus.DRAFT);

        if (!valid) {
            throw new BusinessException(
                    "Invalid transition: " + record.getStatus() + " → " + newStatus);
        }

        record.setStatus(newStatus);
        if (newStatus == PayrollStatus.APPROVED) {
            record.setApprovedBy(currentUser.getId());
        }

        PayrollRecord saved = payrollRepository.save(record);

        if (newStatus == PayrollStatus.APPROVED) {
            auditService.log(pumpId, AuditAction.PAYROLL_APPROVED,
                    "PayrollRecord", recordId.toString(),
                    "Payroll approved: recordId=" + recordId + " grossAmount=₹" + record.getGrossAmount(),
                    currentUser);
        }

        return saved;
    }

    /**
     * DELETE /api/pumps/{pumpId}/payroll/{recordId}
     * Permanently removes a payroll record while it is still in DRAFT.
     * Once approved or paid, the record becomes part of the accounting trail and cannot be deleted.
     */
    @DeleteMapping("/{pumpId}/payroll/{recordId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePayroll(
            @PathVariable Long pumpId,
            @PathVariable Long recordId,
            @AuthenticationPrincipal User currentUser) {
        PayrollRecord record = payrollRepository.findById(recordId)
                .orElseThrow(() -> new ResourceNotFoundException("Payroll record not found"));

        if (!record.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Payroll record not found");
        }
        if (record.getStatus() != PayrollStatus.DRAFT) {
            throw new BusinessException("Only draft payroll records can be deleted.");
        }

        payrollRepository.delete(record);
        auditService.log(pumpId, AuditAction.PAYROLL_DELETED,
                "PayrollRecord", recordId.toString(),
                "Payroll draft deleted: recordId=" + recordId + " grossAmount=₹" + record.getGrossAmount(),
                currentUser);
    }

    /**
     * Hourly-shift calculation for OPERATOR role.
     * Actual hours worked per closed shift × shift-window hourly rate.
     */
    private PayrollRecord generateHourlyShiftPayroll(Long pumpId, GeneratePayrollRequest req, User staff) {
        if (staff.getShift1HourlyRate() == null || staff.getShift1HourlyRate().compareTo(BigDecimal.ZERO) <= 0
                || staff.getStandardHourlyRate() == null || staff.getStandardHourlyRate().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(
                    staff.getFullName() + " does not have hourly rates configured. " +
                    "Set their Shift 1 (night) and standard hourly rates in Setup → Staff before generating payroll.");
        }

        List<com.ppms.shift.Shift> closedShifts =
                shiftRepository.findByPumpIdAndOperatorIdAndDateRange(
                        pumpId, req.getUserId(), req.getPeriodFrom(), req.getPeriodTo())
                .stream()
                .filter(s -> s.getActualEndTime() != null)
                .toList();

        double shift1Minutes = 0, standardMinutes = 0;
        int    shift1Count   = 0, standardCount    = 0;

        for (com.ppms.shift.Shift shift : closedShifts) {
            long mins = Duration.between(shift.getActualStartTime(), shift.getActualEndTime()).toMinutes();
            if (Boolean.TRUE.equals(shift.getIsNightShift())) { shift1Minutes += mins; shift1Count++; }
            else                                               { standardMinutes += mins; standardCount++; }
        }

        BigDecimal shift1Hours   = BigDecimal.valueOf(shift1Minutes / 60.0).setScale(2, RoundingMode.HALF_UP);
        BigDecimal standardHours = BigDecimal.valueOf(standardMinutes / 60.0).setScale(2, RoundingMode.HALF_UP);
        BigDecimal shift1Rate    = staff.getShift1HourlyRate();
        BigDecimal standardRate  = staff.getStandardHourlyRate();

        BigDecimal gross = shift1Hours.multiply(shift1Rate)
                .add(standardHours.multiply(standardRate))
                .setScale(2, RoundingMode.HALF_UP);

        // Sum discrepancy_amount for all SALARY_DEDUCTION shifts in this period.
        // These are shortfall amounts the operator is responsible for, deducted from their pay.
        BigDecimal deductions = shiftRepository.findSalaryDeductionShifts(
                        pumpId, req.getUserId(), req.getPeriodFrom(), req.getPeriodTo())
                .stream()
                .map(s -> s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal netPay = gross.subtract(deductions).max(BigDecimal.ZERO);

        return PayrollRecord.builder()
                .salaryType("HOURLY_SHIFT")
                .pumpId(pumpId)
                .userId(req.getUserId())
                .periodFrom(req.getPeriodFrom())
                .periodTo(req.getPeriodTo())
                .totalShifts(shift1Count + standardCount)
                .shift1Shifts(shift1Count).shift1Hours(shift1Hours).shift1RateSnapshot(shift1Rate)
                .standardShifts(standardCount).standardHours(standardHours).standardRateSnapshot(standardRate)
                .grossAmount(gross)
                .deductions(deductions)
                .netPay(netPay)
                .notes(req.getNotes())
                .status(PayrollStatus.DRAFT)
                .build();
    }

    /**
     * Daily calculation for MANAGER / ADMIN / ACCOUNTANT roles.
     * gross = (total_calendar_days − leave_days) × daily_rate
     */
    private PayrollRecord generateDailyPayroll(Long pumpId, GeneratePayrollRequest req, User staff) {
        if (staff.getDailyRate() == null || staff.getDailyRate().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(
                    staff.getFullName() + " does not have a daily rate configured. " +
                    "Set their daily rate in Setup → Staff before generating payroll.");
        }

        int totalDays = (int) ChronoUnit.DAYS.between(req.getPeriodFrom(), req.getPeriodTo()) + 1;
        int leaveDays = (int) staffLeaveRepository.countByUserIdAndLeaveDateBetween(
                req.getUserId(), req.getPeriodFrom(), req.getPeriodTo());
        int daysWorked = Math.max(0, totalDays - leaveDays);

        BigDecimal dailyRate = staff.getDailyRate();
        BigDecimal gross     = dailyRate.multiply(BigDecimal.valueOf(daysWorked))
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal deductions = shiftRepository.findSalaryDeductionShifts(
                        pumpId, req.getUserId(), req.getPeriodFrom(), req.getPeriodTo())
                .stream()
                .map(s -> s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal netPay = gross.subtract(deductions).max(BigDecimal.ZERO);

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
                .grossAmount(gross)
                .deductions(deductions)
                .netPay(netPay)
                .notes(req.getNotes())
                .status(PayrollStatus.DRAFT)
                .build();
    }

}
