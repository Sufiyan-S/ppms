package com.ppms.pump;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class PumpController {

    private final PumpLocationRepository pumpLocationRepository;
    private final DispensaryUnitRepository duRepository;
    private final NozzleRepository nozzleRepository;
    private final UndergroundTankRepository tankRepository;
    private final ShiftRepository shiftRepository;
    private final AuditService auditService;
    private final PumpShiftDefinitionService shiftDefinitionService;

    // ─────────────────────────────────────────────────────────────────────────
    // PUMPS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/pumps
     * Returns pumps visible to the current user with their active DUs and nozzles.
     *   - OWNER     → all enabled pumps they own
     *   - ADMIN / MANAGER / OPERATOR → the single pump they are assigned to
     */
    @GetMapping
    public ResponseEntity<List<PumpResponse>> getMyPumps(@AuthenticationPrincipal User currentUser) {
        List<PumpResponse> pumps;

        if (currentUser.getRole() == UserRole.OWNER) {
            pumps = pumpLocationRepository.findByOwnerIdAndEnabledTrue(currentUser.getId())
                    .stream()
                    .map(this::toPumpResponse)
                    .toList();
        } else if (currentUser.getAssignedPumpId() != null) {
            pumps = pumpLocationRepository.findById(currentUser.getAssignedPumpId())
                    .map(p -> List.of(toPumpResponse(p)))
                    .orElse(List.of());
        } else {
            pumps = List.of();
        }

        return ResponseEntity.ok(pumps);
    }

    /**
     * POST /api/pumps
     * Creates a new pump location. SUPER_ADMIN only.
     */
    @PostMapping
    public ResponseEntity<PumpResponse> createPump(
            @Valid @RequestBody CreatePumpRequest request,
            @AuthenticationPrincipal User currentUser) {

        if (currentUser.getRole() != UserRole.SUPER_ADMIN) {
            throw new BusinessException(
                    "Only the Super Admin can create new pump locations. " +
                    "Please contact support to add a pump to your subscription.");
        }

        if (pumpLocationRepository.existsByOwnerIdAndName(currentUser.getId(), request.getName())) {
            throw new BusinessException(
                    "A pump named '" + request.getName() + "' already exists. Please use a different name.");
        }

        PumpLocation pump = PumpLocation.builder()
                .ownerId(currentUser.getId())
                .name(request.getName())
                .address(request.getAddress())
                .maxDuCount(request.getMaxDuCount())
                .build();

        pump = pumpLocationRepository.save(pump);

        auditService.log(pump.getId(), AuditAction.PUMP_CREATED,
                "PumpLocation", pump.getId().toString(),
                "Pump created: " + pump.getName() + " (ownerId=" + pump.getOwnerId() + ")",
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(toPumpResponse(pump));
    }

    /**
     * DELETE /api/pumps/{pumpId}
     * Owner only. Blocked if the pump has any shifts on record.
     */
    @DeleteMapping("/{pumpId}")
    @Transactional
    public ResponseEntity<Void> deletePump(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {

        if (currentUser.getRole() != UserRole.OWNER) {
            throw new BusinessException("Only the Owner can delete a pump.");
        }

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        if (!pump.getOwnerId().equals(currentUser.getId())) {
            throw new BusinessException("You do not own this pump.");
        }

        // Delete in FK-safe order: nozzles → DUs → tanks → pump
        List<DispensaryUnit> dus = duRepository.findByPumpIdOrderByDuNumberAsc(pumpId);
        for (DispensaryUnit du : dus) {
            nozzleRepository.findByDuIdOrderByNozzleNumberAsc(du.getId())
                    .forEach(n -> nozzleRepository.deleteById(n.getId()));
            duRepository.deleteById(du.getId());
        }
        tankRepository.findByPumpId(pumpId).forEach(t -> tankRepository.deleteById(t.getId()));
        pumpLocationRepository.deleteById(pumpId);

        return ResponseEntity.noContent().build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UNDERGROUND TANKS
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping("/{pumpId}/tanks")
    public ResponseEntity<List<TankResponse>> getTanks(@PathVariable Long pumpId) {
        List<TankResponse> tanks = tankRepository.findByPumpId(pumpId)
                .stream()
                .filter(t -> t.getStatus() != TankStatus.DECOMMISSIONED)
                .map(this::toTankResponse)
                .toList();
        return ResponseEntity.ok(tanks);
    }

    @PostMapping("/{pumpId}/tanks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<TankResponse> createTank(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateTankRequest request,
            @AuthenticationPrincipal User currentUser) {

        pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        if (tankRepository.existsByPumpIdAndTankIdentifier(pumpId, request.getTankIdentifier().trim())) {
            throw new BusinessException(
                    "A tank named '" + request.getTankIdentifier() + "' already exists on this pump.");
        }

        BigDecimal tolerance = request.getDipTolerance() != null
                ? request.getDipTolerance()
                : new BigDecimal("20.000");

        UndergroundTank tank = UndergroundTank.builder()
                .pumpId(pumpId)
                .tankIdentifier(request.getTankIdentifier().trim())
                .fuelType(request.getFuelType())
                .capacity(request.getCapacity())
                .currentStock(BigDecimal.ZERO)
                .dipTolerance(tolerance)
                .status(TankStatus.ACTIVE)
                .build();

        tank = tankRepository.save(tank);

        auditService.log(pumpId, AuditAction.TANK_ADDED,
                "UndergroundTank", tank.getId().toString(),
                "Tank added: " + tank.getTankIdentifier() + " (" + tank.getFuelType() + ", " + tank.getCapacity() + "L)",
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(toTankResponse(tank));
    }

    @PatchMapping("/tanks/{tankId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<TankResponse> updateTank(
            @PathVariable Long tankId,
            @Valid @RequestBody UpdateTankRequest request) {

        UndergroundTank tank = tankRepository.findById(tankId)
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));

        tank.setCapacity(request.getCapacity());
        if (request.getTankIdentifier() != null && !request.getTankIdentifier().isBlank()) {
            tank.setTankIdentifier(request.getTankIdentifier().trim());
        }
        tank = tankRepository.save(tank);
        return ResponseEntity.ok(toTankResponse(tank));
    }

    @PatchMapping("/tanks/{tankId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<TankResponse> updateTankStatus(
            @PathVariable Long tankId,
            @Valid @RequestBody UpdateTankStatusRequest request,
            @AuthenticationPrincipal User currentUser) {

        UndergroundTank tank = tankRepository.findById(tankId)
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));

        if (request.status() == TankStatus.DECOMMISSIONED) {
            throw new BusinessException("Use the decommission endpoint to permanently remove a tank.");
        }
        if (tank.getStatus() == request.status()) {
            throw new BusinessException("Tank is already " + request.status().name().toLowerCase() + ".");
        }

        tank.setStatus(request.status());
        tank = tankRepository.save(tank);

        log.info("Tank {} status changed to {} by user={}", tankId, request.status(), currentUser.getId());

        if (request.status() == TankStatus.INACTIVE && tank.getCapacity().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal stockPct = tank.getCurrentStock()
                    .multiply(new BigDecimal("100"))
                    .divide(tank.getCapacity(), 1, RoundingMode.HALF_UP);
            if (stockPct.compareTo(new BigDecimal("5")) > 0) {
                log.warn("Tank {} disabled with {}% stock remaining ({} L/kg). Stock is now frozen.",
                        tankId, stockPct, tank.getCurrentStock());
            }
        }

        return ResponseEntity.ok(toTankResponse(tank));
    }

    /**
     * PATCH /api/pumps/{pumpId}/max-dus
     * Increases the maximum DU count for a pump. Owner/Admin only.
     */
    @PatchMapping("/{pumpId}/max-dus")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<PumpResponse> updateMaxDuCount(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpdateMaxNozzleCountRequest request,
            @AuthenticationPrincipal User currentUser) {

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        long currentDuCount = duRepository.countByPumpId(pumpId);
        if (request.maxDuCount() < currentDuCount) {
            throw new BusinessException(
                    "Cannot set max DUs to " + request.maxDuCount() +
                    " — the pump already has " + currentDuCount + " DUs configured. " +
                    "The new limit must be at least " + currentDuCount + ".");
        }

        pump.setMaxDuCount(request.maxDuCount());
        pumpLocationRepository.save(pump);

        log.info("Max DU count for pump {} updated to {} by user={}", pumpId, request.maxDuCount(), currentUser.getId());

        return ResponseEntity.ok(toPumpResponse(pump));
    }

    /**
     * PATCH /api/pumps/{pumpId}/settings
     * Updates configurable pump thresholds (discrepancy escalation, expense approval).
     * Owner/Admin only.
     */
    @PatchMapping("/{pumpId}/settings")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    @Transactional
    public ResponseEntity<PumpResponse> updatePumpSettings(
            @PathVariable Long pumpId,
            @RequestBody UpdatePumpSettingsRequest request,
            @AuthenticationPrincipal User currentUser) {

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        if (request.discrepancyEscalationThreshold() != null) {
            if (request.discrepancyEscalationThreshold().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessException("Discrepancy escalation threshold cannot be negative.");
            }
            pump.setDiscrepancyEscalationThreshold(
                    request.discrepancyEscalationThreshold().compareTo(BigDecimal.ZERO) == 0
                    ? null
                    : request.discrepancyEscalationThreshold().setScale(2, RoundingMode.HALF_UP));
        }

        if (request.expenseApprovalThreshold() != null) {
            if (request.expenseApprovalThreshold().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessException("Expense approval threshold cannot be negative.");
            }
            pump.setExpenseApprovalThreshold(
                    request.expenseApprovalThreshold().compareTo(BigDecimal.ZERO) == 0
                    ? null
                    : request.expenseApprovalThreshold().setScale(2, RoundingMode.HALF_UP));
        }

        pumpLocationRepository.save(pump);
        log.info("Pump {} settings updated by user={}: escalationThreshold={}, expenseApprovalThreshold={}",
                pumpId, currentUser.getId(),
                pump.getDiscrepancyEscalationThreshold(), pump.getExpenseApprovalThreshold());

        return ResponseEntity.ok(toPumpResponse(pump));
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

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private PumpResponse toPumpResponse(PumpLocation pump) {
        List<DUResponse> activeDUs = duRepository.findByPumpIdAndStatus(pump.getId(), NozzleStatus.ACTIVE)
                .stream()
                .map(du -> {
                    List<Nozzle> nozzles = nozzleRepository.findByDuIdOrderByNozzleNumberAsc(du.getId());
                    List<DUResponse.NozzleDetail> details = nozzles.stream()
                            .map(n -> new DUResponse.NozzleDetail(
                                    n.getId(), n.getNozzleNumber(), n.getFuelType(),
                                    n.getLastReading(), n.getMaxMeterValue(), n.getTankId(), n.getStatus().name()))
                            .toList();
                    return DUResponse.builder()
                            .id(du.getId())
                            .pumpId(du.getPumpId())
                            .duNumber(du.getDuNumber())
                            .name(du.getName())
                            .status(du.getStatus().name())
                            .nozzles(details)
                            .build();
                })
                .toList();

        return PumpResponse.builder()
                .id(pump.getId())
                .name(pump.getName())
                .address(pump.getAddress())
                .maxDuCount(pump.getMaxDuCount())
                .ownerId(pump.getOwnerId())
                .createdAt(pump.getCreatedAt())
                .discrepancyEscalationThreshold(pump.getDiscrepancyEscalationThreshold())
                .expenseApprovalThreshold(pump.getExpenseApprovalThreshold())
                .dus(activeDUs)
                .build();
    }

    private TankResponse toTankResponse(UndergroundTank t) {
        return TankResponse.builder()
                .id(t.getId())
                .pumpId(t.getPumpId())
                .tankIdentifier(t.getTankIdentifier())
                .fuelType(t.getFuelType().name())
                .capacity(t.getCapacity())
                .currentStock(t.getCurrentStock())
                .dipTolerance(t.getDipTolerance())
                .status(t.getStatus().name())
                .createdAt(t.getCreatedAt())
                .build();
    }
}
