package com.ppms.shift;

import com.ppms.fuel.FuelType;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.idempotency.IdempotencyService;
import com.ppms.common.idempotency.IdempotentRequest;
import com.ppms.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
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
    private final ShiftBackfillService shiftBackfillService;
    private final AuditService auditService;
    private final IdempotencyService idempotencyService;

    /**
     * GET /api/pumps/{pumpId}/shifts/active
     * Returns all currently open shifts for a pump (OPEN or OPEN_OVERDUE); an operator gets only their own.
     */
    @GetMapping("/active")
    public ResponseEntity<List<ShiftResponse>> getActiveShifts(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(shiftService.getActiveShifts(pumpId, currentUser));
    }

    /**
     * GET /api/pumps/{pumpId}/shifts/history?page=0&size=50[&from=&to=][&discrepanciesOnly=true[&discrepancyType=SHORT]][&fuelType=PETROL]
     * Returns paginated shift history for a pump, newest first. Default page size 50.
     * from/to filter on the shift's business date (inclusive); fuelType keeps shifts that sold that fuel and
     * cannot be combined with discrepanciesOnly. An operator gets only their own shifts.
     */
    @GetMapping("/history")
    public ResponseEntity<Page<ShiftResponse>> getShiftHistory(
            @PathVariable Long pumpId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "false") boolean discrepanciesOnly,
            @RequestParam(required = false) DiscrepancyType discrepancyType,
            @RequestParam(required = false) FuelType fuelType,
            @PageableDefault(size = 50) Pageable pageable,
            @AuthenticationPrincipal User currentUser) {
        ShiftHistoryFilter filter = new ShiftHistoryFilter(from, to, discrepanciesOnly, discrepancyType, fuelType);
        return ResponseEntity.ok(shiftService.getShiftHistory(pumpId, filter, pageable, currentUser));
    }

    /**
     * GET /api/pumps/{pumpId}/shifts/{id}
     * Returns a single shift by ID. Validates the shift belongs to the requested pump,
     * and answers 404 to an operator asking for another operator's shift.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ShiftResponse> getShift(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(shiftService.getShiftById(pumpId, id, currentUser));
    }

    /**
     * POST /api/pumps/{pumpId}/shifts/backfill
     * Enters a historical closed shift for a pump. Admin and Owner only.
     *
     * Used when a pump is onboarded and the owner wants to enter past shift data.
     * The resulting shift is stored as CLOSED_BALANCED or CLOSED_DISCREPANCY_PENDING
     * with isBackfilled=true. The shift date must be within the last 365 days.
     *
     * Prerequisite: historical tanker deliveries must be recorded in Inventory first,
     * as the FIFO deduction runs exactly as it does during a normal shift close.
     */
    @PostMapping("/backfill")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<ShiftResponse> backfillShift(
            @PathVariable Long pumpId,
            @Valid @RequestBody BackfillShiftRequest request,
            @AuthenticationPrincipal User currentUser) {
        ShiftResponse response = shiftBackfillService.backfillShift(pumpId, request, currentUser);
        auditService.log(response.getPumpId(), AuditAction.SHIFT_BACKFILLED,
                "Shift", response.getId().toString(),
                "Historical shift backfilled for " + response.getShiftDate() + " (" + response.getShiftWindow() +
                ") by " + currentUser.getFullName(),
                currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
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
        ShiftResponse response = shiftService.openShift(pumpId, request, currentUser);
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
     * An Idempotency-Key header makes a resend after a timeout return the first result instead of adding twice.
     */
    @PostMapping("/{id}/credit-entries")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    public ResponseEntity<?> addCreditEntry(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @Valid @RequestBody AddCreditEntryRequest request,
            @RequestHeader(value = IdempotencyService.HEADER, required = false) String idempotencyKey,
            HttpServletRequest httpRequest,
            @AuthenticationPrincipal User currentUser) {
        return idempotencyService.runOnce(
                IdempotentRequest.of(currentUser.getId(), idempotencyKey, httpRequest, request),
                () -> ResponseEntity.status(HttpStatus.CREATED)
                        .body(shiftService.addCreditEntry(pumpId, id, request, currentUser)));
    }

    /**
     * POST /api/pumps/{pumpId}/shifts/{id}/close
     * Closes a shift. Triggers FIFO inventory deduction and discrepancy calculation.
     * An Idempotency-Key header makes a resend after a timeout return the first result.
     */
    @PostMapping("/{id}/close")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<?> closeShift(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @Valid @RequestBody CloseShiftRequest request,
            @RequestHeader(value = IdempotencyService.HEADER, required = false) String idempotencyKey,
            HttpServletRequest httpRequest,
            @AuthenticationPrincipal User currentUser) {
        return idempotencyService.runOnce(
                IdempotentRequest.of(currentUser.getId(), idempotencyKey, httpRequest, request),
                () -> {
                    ShiftResponse response = shiftService.closeShift(pumpId, id, request, currentUser);
                    auditService.log(response.getPumpId(), AuditAction.SHIFT_CLOSED,
                            "Shift", response.getId().toString(),
                            "Shift closed: status=" + response.getStatus() + " totalAmountDue=₹" + response.getTotalAmountDue(),
                            currentUser);
                    return ResponseEntity.ok(response);
                });
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
        ShiftResponse response = shiftService.resolveDiscrepancy(pumpId, id, request, currentUser);
        if (request.resolutionAction() == DiscrepancyResolution.PENDING_INVESTIGATION) {
            auditService.log(response.getPumpId(), AuditAction.DISCREPANCY_INVESTIGATION_STARTED,
                    "Shift", response.getId().toString(),
                    "Discrepancy under investigation: note=" + response.getInvestigationNote(),
                    currentUser);
            return ResponseEntity.ok(response);
        }
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
            @Valid @RequestBody VoidCreditEntryRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(shiftService.voidCreditEntry(pumpId, shiftId, entryId, request.voidReason(), currentUser));
    }
}
