package com.ppms.pump;

import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Dispensary Unit (DU) and nozzle management. Base URL: /api/pumps/{pumpId}/dus
 */
@RestController
@RequestMapping("/api/pumps/{pumpId}/dus")
@RequiredArgsConstructor
public class DispensaryUnitController {

    private final DispensaryUnitService dispensaryUnitService;

    /** GET /api/pumps/{pumpId}/dus — all DUs (active and inactive) with their nozzles. */
    @GetMapping
    public ResponseEntity<List<DUResponse>> getDUs(@PathVariable Long pumpId) {
        return ResponseEntity.ok(dispensaryUnitService.getDUs(pumpId));
    }

    /** POST /api/pumps/{pumpId}/dus — creates a DU with its initial nozzles. */
    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> createDU(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateDURequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED).body(dispensaryUnitService.createDU(pumpId, request, currentUser));
    }

    /** PATCH /api/pumps/{pumpId}/dus/{duId}/status — enables or disables a DU. */
    @PatchMapping("/{duId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> updateDUStatus(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @Valid @RequestBody UpdateNozzleStatusRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(dispensaryUnitService.updateDUStatus(pumpId, duId, request.status(), currentUser));
    }

    /** POST /api/pumps/{pumpId}/dus/{duId}/nozzles — adds one nozzle to an existing DU. */
    @PostMapping("/{duId}/nozzles")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> addNozzle(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @Valid @RequestBody CreateDURequest.NozzleInput request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(dispensaryUnitService.addNozzle(pumpId, duId, request, currentUser));
    }

    /** PATCH /api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/status — enables or disables one nozzle. */
    @PatchMapping("/{duId}/nozzles/{nozzleId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> updateNozzleStatus(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @PathVariable Long nozzleId,
            @Valid @RequestBody UpdateNozzleStatusRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                dispensaryUnitService.updateNozzleStatus(pumpId, duId, nozzleId, request.status(), currentUser));
    }

    /** PATCH /api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/tank — maps a nozzle to a tank (null clears it). */
    @PatchMapping("/{duId}/nozzles/{nozzleId}/tank")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> mapNozzleToTank(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @PathVariable Long nozzleId,
            @RequestBody MapOutletToTankRequest request) {
        return ResponseEntity.ok(dispensaryUnitService.mapNozzleToTank(pumpId, duId, nozzleId, request.tankId()));
    }
}
