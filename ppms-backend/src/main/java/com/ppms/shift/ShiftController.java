package com.ppms.shift;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * All endpoints are under /api/pumps/{pumpId}/shifts/** so the PumpAccessInterceptor
 * automatically enforces pump-level ownership and assignment checks on every request.
 * The pumpId path variable is the authoritative scope for all shift operations.
 */
@RestController
@RequestMapping("/api/pumps/{pumpId}/shifts")
@RequiredArgsConstructor
public class ShiftController {

    private final ShiftService shiftService;
    private final AuditService auditService;

    /**
     * GET /api/pumps/{pumpId}/shifts/active
     * Returns all currently open shifts for a pump (OPEN or OPEN_OVERDUE).
     */
    @GetMapping("/active")
    public ResponseEntity<List<ShiftResponse>> getActiveShifts(@PathVariable Long pumpId) {
        return ResponseEntity.ok(shiftService.getActiveShifts(pumpId));
    }

    /**
     * GET /api/pumps/{pumpId}/shifts/history?page=0&size=50
     * Returns paginated shift history for a pump, newest first. Default page size 50.
     */
    @GetMapping("/history")
    public ResponseEntity<Page<ShiftResponse>> getShiftHistory(
            @PathVariable Long pumpId,
            @PageableDefault(size = 50) Pageable pageable) {
        return ResponseEntity.ok(shiftService.getShiftHistory(pumpId, pageable));
    }

    /**
     * GET /api/pumps/{pumpId}/shifts/{id}
     * Returns a single shift by ID. Validates the shift belongs to the requested pump.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ShiftResponse> getShift(
            @PathVariable Long pumpId,
            @PathVariable Long id) {
        ShiftResponse response = shiftService.getShiftById(id);
        if (!response.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift does not belong to this pump");
        }
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/pumps/{pumpId}/shifts/open
     * Opens a new shift. The authenticated user becomes the "opened by" user.
     */
    @PostMapping("/open")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<ShiftResponse> openShift(
            @PathVariable Long pumpId,
            @Valid @RequestBody OpenShiftRequest request,
            @AuthenticationPrincipal User currentUser) {
        ShiftResponse response = shiftService.openShift(request, currentUser);
        auditService.log(response.getPumpId(), AuditAction.SHIFT_OPENED,
                "Shift", response.getId().toString(),
                "Shift opened on DU #" + response.getDuNumber() + " by operator " + response.getOperatorName(),
                currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * POST /api/pumps/{pumpId}/shifts/{id}/credit-entries
     * Adds a credit entry to an open shift mid-shift.
     * Operators can record credit sales as they happen rather than at shift close.
     * Service layer enforces that OPERATOR role can only add entries to their own active shift.
     */
    @PostMapping("/{id}/credit-entries")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    public ResponseEntity<ShiftResponse> addCreditEntry(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @Valid @RequestBody AddCreditEntryRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(shiftService.addCreditEntry(id, request, currentUser));
    }

    /**
     * POST /api/pumps/{pumpId}/shifts/{id}/close
     * Closes a shift. Triggers FIFO inventory deduction and discrepancy calculation.
     */
    @PostMapping("/{id}/close")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<ShiftResponse> closeShift(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @Valid @RequestBody CloseShiftRequest request,
            @AuthenticationPrincipal User currentUser) {
        ShiftResponse response = shiftService.closeShift(id, request, currentUser);
        auditService.log(response.getPumpId(), AuditAction.SHIFT_CLOSED,
                "Shift", response.getId().toString(),
                "Shift closed: status=" + response.getStatus() + " totalAmountDue=₹" + response.getTotalAmountDue(),
                currentUser);
        return ResponseEntity.ok(response);
    }

    /**
     * PATCH /api/pumps/{pumpId}/shifts/{id}/discrepancy-resolution
     * Sets or updates the resolution action for a CLOSED_DISCREPANCY_PENDING shift.
     * Accessible by MANAGER and ADMIN (spec Section 4.10).
     * WAIVED requires a non-blank resolutionNote (Business Rule 19).
     */
    @PatchMapping("/{id}/discrepancy-resolution")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<ShiftResponse> resolveDiscrepancy(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @Valid @RequestBody ResolveDiscrepancyRequest request,
            @AuthenticationPrincipal User currentUser) {
        ShiftResponse response = shiftService.resolveDiscrepancy(id, request, currentUser);
        auditService.log(response.getPumpId(), AuditAction.DISCREPANCY_RESOLVED,
                "Shift", response.getId().toString(),
                "Discrepancy resolved: resolution=" + request.resolutionAction()
                        + (request.resolutionNote() != null ? ", note=" + request.resolutionNote() : ""),
                currentUser);
        return ResponseEntity.ok(response);
    }

    /**
     * PATCH /api/pumps/{pumpId}/shifts/{shiftId}/credit-entries/{entryId}/void
     * Voids a credit entry on an open shift. Requires a mandatory reason.
     * Only allowed while the shift is OPEN (spec Business Rule 7).
     */
    @PatchMapping("/{shiftId}/credit-entries/{entryId}/void")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<ShiftResponse> voidCreditEntry(
            @PathVariable Long pumpId,
            @PathVariable Long shiftId,
            @PathVariable Long entryId,
            @RequestParam String voidReason,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(shiftService.voidCreditEntry(shiftId, entryId, voidReason, currentUser));
    }
}
