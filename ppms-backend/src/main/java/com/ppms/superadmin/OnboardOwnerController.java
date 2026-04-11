package com.ppms.superadmin;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Endpoints reserved for SUPER_ADMIN only.
 *
 * POST /api/super-admin/onboard-owner  — creates a new pump owner + their first pump
 * GET  /api/super-admin/owners         — lists all onboarded owners with their pumps
 */
@RestController
@RequestMapping("/api/super-admin")
@RequiredArgsConstructor
public class OnboardOwnerController {

    private final OnboardOwnerService onboardOwnerService;

    @PostMapping("/onboard-owner")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<OnboardOwnerResponse> onboardOwner(
            @Valid @RequestBody OnboardOwnerRequest request) {
        OnboardOwnerResponse response = onboardOwnerService.onboard(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/owners")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<OwnerSummaryResponse>> listOwners() {
        return ResponseEntity.ok(onboardOwnerService.listOwners());
    }

    /**
     * POST /api/super-admin/owners/{ownerId}/pumps
     * Adds a new pump to an existing owner. Returns the updated owner summary.
     */
    @PostMapping("/owners/{ownerId}/pumps")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<OwnerSummaryResponse> addPump(
            @PathVariable Long ownerId,
            @Valid @RequestBody AddPumpRequest request) {
        OwnerSummaryResponse updated = onboardOwnerService.addPump(ownerId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(updated);
    }

    /**
     * PATCH /api/super-admin/pumps/{pumpId}
     * Updates a pump's name, address, and enabled status.
     * Disabled pumps are hidden from the owner's dashboard but remain accessible to assigned staff.
     */
    @PatchMapping("/pumps/{pumpId}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<OwnerSummaryResponse> updatePump(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpdatePumpRequest request) {
        OwnerSummaryResponse updated = onboardOwnerService.updatePump(pumpId, request);
        return ResponseEntity.ok(updated);
    }
}
