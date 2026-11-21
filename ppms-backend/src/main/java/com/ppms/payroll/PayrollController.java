package com.ppms.payroll;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasRole('OWNER')")
public class PayrollController {

    private final PayrollRepository        payrollRepository;
    private final PayrollService           payrollService;
    private final ShiftRepository          shiftRepository;
    private final DispensaryUnitRepository duRepository;
    private final AuditService             auditService;

    /** Lightweight summary of a shift with an unresolved discrepancy, returned to the payroll UI. */
    public record PendingDiscrepancy(
            Long    id,
            String  shiftDate,
            Integer duNumber,
            String  duName,
            String  discrepancyType,
            BigDecimal discrepancyAmount,
            String  discrepancyReason
    ) {}

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
     * GET /api/pumps/{pumpId}/payroll/pending-discrepancies?userId={userId}
     * Returns all unresolved discrepancy shifts for a user on this pump.
     * Called by the payroll UI before generating a payroll draft so the owner can choose
     * which discrepancies to resolve as SALARY_DEDUCTION in the current pay run.
     */
    @GetMapping("/{pumpId}/payroll/pending-discrepancies")
    public List<PendingDiscrepancy> getPendingDiscrepancies(
            @PathVariable Long pumpId,
            @RequestParam Long userId,
            @AuthenticationPrincipal User currentUser) {
        List<Shift> pending = shiftRepository.findPendingDiscrepanciesByPumpAndOperator(pumpId, userId);

        Set<Long> duIds = new java.util.HashSet<>();
        pending.forEach(s -> duIds.add(s.getDuId()));
        Map<Long, com.ppms.pump.DispensaryUnit> duById = duIds.isEmpty()
                ? Map.of()
                : duRepository.findAllById(duIds).stream()
                        .collect(java.util.stream.Collectors.toMap(
                                com.ppms.pump.DispensaryUnit::getId, du -> du));

        return pending.stream().map(s -> {
            com.ppms.pump.DispensaryUnit du = duById.get(s.getDuId());
            return new PendingDiscrepancy(
                    s.getId(),
                    s.getShiftDate().toString(),
                    du != null ? du.getDuNumber() : null,
                    du != null ? du.getName()     : null,
                    s.getDiscrepancyType() != null ? s.getDiscrepancyType().name() : null,
                    s.getDiscrepancyAmount(),
                    s.getDiscrepancyReason()
            );
        }).toList();
    }

    /**
     * POST /api/pumps/{pumpId}/payroll/generate
     * Calculates payroll for a staff member based on their closed shift history.
     *
     * How it works:
     *   1. Fetch all CLOSED shifts for the user in the requested period.
     *   2. Sum worked minutes per window: night shifts (shift1HourlyRate) and day shifts (standardHourlyRate).
     *   3. gross = (night_minutes × shift1_rate + day_minutes × standard_rate) / 60, rounded once.
     *   4. Selected pending discrepancies are resolved as SALARY_DEDUCTION in the same transaction.
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
        return payrollService.generate(pumpId, req, currentUser);
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
     * Permanently removes a payroll record while it is still in DRAFT and restores the discrepancies
     * it resolved as salary deductions. Approved or paid records are part of the accounting trail.
     */
    @DeleteMapping("/{pumpId}/payroll/{recordId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePayroll(
            @PathVariable Long pumpId,
            @PathVariable Long recordId,
            @AuthenticationPrincipal User currentUser) {
        payrollService.deleteDraft(pumpId, recordId, currentUser);
    }
}
