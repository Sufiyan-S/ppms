package com.ppms.superadmin;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.ppms.user.User;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
            @Valid @RequestBody OnboardOwnerRequest request,
            @AuthenticationPrincipal User currentUser) {
        OnboardOwnerResponse response = onboardOwnerService.onboard(request, currentUser);
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
            @Valid @RequestBody AddPumpRequest request,
            @AuthenticationPrincipal User currentUser) {
        OwnerSummaryResponse updated = onboardOwnerService.addPump(ownerId, request, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(updated);
    }

    /**
     * PATCH /api/super-admin/pumps/{pumpId}
     * Updates a pump's name, address, and enabled status.
     * A suspended pump is hidden from its owner and refused to its staff; it cannot be suspended mid-shift.
     */
    @PatchMapping("/pumps/{pumpId}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<OwnerSummaryResponse> updatePump(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpdatePumpRequest request,
            @AuthenticationPrincipal User currentUser) {
        OwnerSummaryResponse updated = onboardOwnerService.updatePump(pumpId, request, currentUser);
        return ResponseEntity.ok(updated);
    }
}
