package com.ppms.adjustment;

import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class NozzleAdjustmentController {

    private final NozzleAdjustmentService adjustmentService;

    // ── Meter reading adjustments ─────────────────────────────────────────────

    @PostMapping("/{pumpId}/outlets/{outletId}/reading-adjustments")
    @ResponseStatus(HttpStatus.CREATED)
    public NozzleReadingAdjustment recordAdjustment(
            @PathVariable Long pumpId,
            @PathVariable Long outletId,
            @Valid @RequestBody RecordAdjustmentRequest req,
            @AuthenticationPrincipal User currentUser) {
        requireOwnerOrAdmin(currentUser);
        return adjustmentService.recordReadingAdjustment(pumpId, outletId, req, currentUser);
    }

    @GetMapping("/{pumpId}/outlets/{outletId}/reading-adjustments")
    public List<NozzleReadingAdjustment> getAdjustments(
            @PathVariable Long pumpId,
            @PathVariable Long outletId,
            @AuthenticationPrincipal User currentUser) {
        requireOwnerOrAdmin(currentUser);
        return adjustmentService.getAdjustments(outletId);
    }

    // ── Fuel dip entries ──────────────────────────────────────────────────────

    @PostMapping("/{pumpId}/fuel-dips")
    @ResponseStatus(HttpStatus.CREATED)
    public FuelDipEntry recordDip(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordDipRequest req,
            @AuthenticationPrincipal User currentUser) {
        requireOwnerOrAdmin(currentUser);
        return adjustmentService.recordDip(pumpId, req, currentUser);
    }

    @GetMapping("/{pumpId}/fuel-dips")
    public List<FuelDipEntry> getDips(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        requireOwnerOrAdmin(currentUser);
        return adjustmentService.getDips(pumpId);
    }

    // ── Guard ─────────────────────────────────────────────────────────────────

    private void requireOwnerOrAdmin(User user) {
        if (user.getRole() != UserRole.OWNER && user.getRole() != UserRole.ADMIN) {
            throw new com.ppms.common.exception.BusinessException(
                    "Only Owner or Admin can record reading adjustments and dip entries.");
        }
    }
}
