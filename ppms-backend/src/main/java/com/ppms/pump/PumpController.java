package com.ppms.pump;

import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class PumpController {

    private final PumpShiftDefinitionService shiftDefinitionService;
    private final TankService tankService;
    private final PumpService pumpService;
    private final PumpOverviewService pumpOverviewService;

    // ─────────────────────────────────────────────────────────────────────────
    // PUMPS
    // ─────────────────────────────────────────────────────────────────────────

    /** Pumps visible to the current user, with their active DUs and nozzles. */
    @GetMapping
    public ResponseEntity<List<PumpResponse>> getMyPumps(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(pumpService.getMyPumps(currentUser));
    }

    /** Today's sales, open shifts, low tanks and price status for each of the current user's pumps. */
    @GetMapping("/overview")
    public ResponseEntity<PumpOverviewResponse> getMyPumpsOverview(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(pumpOverviewService.getOverview(currentUser));
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<PumpResponse> createPump(
            @Valid @RequestBody CreatePumpRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED).body(pumpService.createPump(request, currentUser));
    }

    /**
     * DELETE /api/pumps/{pumpId}
     * Owner only; refused once the pump has shifts, staff or other recorded data.
     */
    @DeleteMapping("/{pumpId}")
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<Void> deletePump(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        pumpService.deletePump(pumpId, currentUser);
        return ResponseEntity.noContent().build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UNDERGROUND TANKS
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping("/{pumpId}/tanks")
    public ResponseEntity<List<TankResponse>> getTanks(@PathVariable Long pumpId) {
        return ResponseEntity.ok(tankService.getTanks(pumpId));
    }

    @PostMapping("/{pumpId}/tanks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<TankResponse> createTank(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateTankRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tankService.createTank(pumpId, request, currentUser));
    }

    @PatchMapping("/{pumpId}/tanks/{tankId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<TankResponse> updateTank(
            @PathVariable Long pumpId,
            @PathVariable Long tankId,
            @Valid @RequestBody UpdateTankRequest request) {
        return ResponseEntity.ok(tankService.updateTank(pumpId, tankId, request));
    }

    @PatchMapping("/{pumpId}/tanks/{tankId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<TankResponse> updateTankStatus(
            @PathVariable Long pumpId,
            @PathVariable Long tankId,
            @Valid @RequestBody UpdateTankStatusRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(tankService.updateTankStatus(pumpId, tankId, request.status(), currentUser));
    }

    @PatchMapping("/{pumpId}/max-dus")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<PumpResponse> updateMaxDuCount(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpdateMaxNozzleCountRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(pumpService.updateMaxDuCount(pumpId, request.maxDuCount(), currentUser));
    }

    /** Discrepancy escalation and expense approval thresholds, and the GST details used on invoices. */
    @PatchMapping("/{pumpId}/settings")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<PumpResponse> updatePumpSettings(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpdatePumpSettingsRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(pumpService.updatePumpSettings(pumpId, request, currentUser));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHIFT DEFINITIONS
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping("/{pumpId}/shift-definitions")
    public ResponseEntity<List<ShiftDefinitionResponse>> getShiftDefinitions(@PathVariable Long pumpId) {
        return ResponseEntity.ok(shiftDefinitionService.getForPump(pumpId));
    }

    @GetMapping("/{pumpId}/shift-definitions/active")
    public ResponseEntity<List<ShiftDefinitionResponse>> getActiveShiftDefinitions(@PathVariable Long pumpId) {
        return ResponseEntity.ok(shiftDefinitionService.getActiveForPump(pumpId));
    }

    /**
     * GET /api/pumps/{pumpId}/shift-definitions/for-date?date=YYYY-MM-DD
     * Returns the shift definitions that were active for a pump on a given historical date.
     * Used by the backfill modal to populate the shift window selector.
     */
    @GetMapping("/{pumpId}/shift-definitions/for-date")
    public ResponseEntity<List<ShiftDefinitionResponse>> getShiftDefinitionsForDate(
            @PathVariable Long pumpId,
            @RequestParam LocalDate date) {
        return ResponseEntity.ok(shiftDefinitionService.getForPumpOnDate(pumpId, date));
    }

    @PostMapping("/{pumpId}/shift-definitions")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<List<ShiftDefinitionResponse>> createShiftDefinitions(
            @PathVariable Long pumpId,
            @RequestBody List<@Valid CreateShiftDefinitionRequest> requests,
            @AuthenticationPrincipal User currentUser) {
        List<ShiftDefinitionResponse> created =
                shiftDefinitionService.createBatch(pumpId, requests, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @DeleteMapping("/{pumpId}/shift-definitions")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<Void> deleteShiftDefinitionGroup(
            @PathVariable Long pumpId,
            @RequestParam LocalDate effectiveFrom,
            @RequestParam(required = false) LocalDate effectiveTo) {
        shiftDefinitionService.deleteGroup(pumpId, effectiveFrom, effectiveTo);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{pumpId}/shift-definitions/disable")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<List<ShiftDefinitionResponse>> disableShiftDefinitionGroup(
            @PathVariable Long pumpId,
            @RequestParam LocalDate effectiveFrom,
            @Valid @RequestBody DisableShiftGroupRequest req) {
        List<ShiftDefinitionResponse> updated =
                shiftDefinitionService.disableGroup(pumpId, effectiveFrom, req.getDisableDate());
        return ResponseEntity.ok(updated);
    }

}
