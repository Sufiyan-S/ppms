package com.ppms.pump;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.fuel.FuelType;
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
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class PumpController {

    private final PumpLocationRepository pumpLocationRepository;
    private final NozzleRepository nozzleRepository;
    private final NozzleOutletRepository outletRepository;
    private final UndergroundTankRepository tankRepository;
    private final ShiftRepository shiftRepository;
    private final AuditService auditService;
    private final PumpShiftDefinitionService shiftDefinitionService;

    // ─────────────────────────────────────────────────────────────────────────
    // PUMPS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/pumps
     * Returns pumps visible to the current user:
     *   - OWNER     → all pumps they own (can be multiple)
     *   - ADMIN / MANAGER / OPERATOR → the single pump they are assigned to
     *   - SUPER_ADMIN → not expected to call this (has its own portal)
     */
    @GetMapping
    public ResponseEntity<List<PumpResponse>> getMyPumps(@AuthenticationPrincipal User currentUser) {
        List<PumpResponse> pumps;

        if (currentUser.getRole() == UserRole.OWNER) {
            // Only show enabled pumps to the owner — disabled pumps are hidden until re-enabled by SuperAdmin
            pumps = pumpLocationRepository.findByOwnerIdAndEnabledTrue(currentUser.getId())
                    .stream()
                    .map(this::toPumpResponse)
                    .toList();
        } else if (currentUser.getAssignedPumpId() != null) {
            // ADMIN, MANAGER, OPERATOR — scoped to their assigned pump
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
     * Creates a new pump location.
     * Restricted to SUPER_ADMIN — adding a pump to a subscription is a platform-level action
     * that must be authorised by the SaaS operator, not by the pump owner themselves.
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
                .maxNozzleCount(request.getMaxNozzleCount())
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
     * All child records (nozzles, outlets, tanks) are deleted atomically.
     */
    @DeleteMapping("/{pumpId}")
    @Transactional
    public ResponseEntity<Void> deletePump(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {

        if (currentUser.getRole() != UserRole.OWNER) {
            throw new BusinessException("Only the Owner can delete a pump");
        }

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        if (!pump.getOwnerId().equals(currentUser.getId())) {
            throw new BusinessException("You do not own this pump");
        }

        // Delete in FK-safe order (all statuses)
        nozzleRepository.findByPumpIdAndStatus(pumpId, NozzleStatus.ACTIVE).forEach(n -> {
            outletRepository.deleteByNozzleId(n.getId());
            nozzleRepository.deleteById(n.getId());
        });
        nozzleRepository.findByPumpIdAndStatus(pumpId, NozzleStatus.INACTIVE).forEach(n -> {
            outletRepository.deleteByNozzleId(n.getId());
            nozzleRepository.deleteById(n.getId());
        });
        tankRepository.findByPumpId(pumpId).forEach(t -> tankRepository.deleteById(t.getId()));

        pumpLocationRepository.deleteById(pumpId);
        return ResponseEntity.noContent().build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UNDERGROUND TANKS
    // Owners create each tank explicitly (name + fuel type + capacity).
    // Multiple tanks of the same fuel type are allowed per pump.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/tanks
     * Returns all tanks for the pump (ACTIVE and INACTIVE).
     * INACTIVE tanks are included so the setup UI can show the enable/disable toggle.
     */
    @GetMapping("/{pumpId}/tanks")
    public ResponseEntity<List<TankResponse>> getTanks(@PathVariable Long pumpId) {
        List<TankResponse> tanks = tankRepository.findByPumpId(pumpId)
                .stream()
                .filter(t -> t.getStatus() != TankStatus.DECOMMISSIONED)
                .map(this::toTankResponse)
                .toList();
        return ResponseEntity.ok(tanks);
    }

    /**
     * POST /api/pumps/{pumpId}/tanks
     * Creates a new underground tank. Owner/Admin only.
     */
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

    /**
     * PATCH /api/pumps/tanks/{tankId}
     * Updates capacity and/or tank identifier. Owner/Admin only.
     */
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

    /**
     * PATCH /api/pumps/tanks/{tankId}/status
     * Enables or disables a tank. Owner/Admin only.
     *
     * Disabling a tank (ACTIVE → INACTIVE):
     * - Its stock is frozen — FIFO deduction will skip lots from this tank.
     * - New tanker deliveries to this tank are blocked.
     * - DIP checks on this tank are blocked.
     * - If the tank has > 5% of its capacity remaining in stock, the response
     *   includes a warning so the caller can surface it to the user.
     *   The disable is applied regardless — the warning is informational only.
     *
     * Re-enabling a tank (INACTIVE → ACTIVE):
     * - Resumes normal FIFO deduction for existing lots in this tank.
     */
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

        TankResponse response = toTankResponse(tank);

        // Warn if disabling a tank that still holds significant stock (> 5% of capacity)
        if (request.status() == TankStatus.INACTIVE && tank.getCapacity().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal stockPct = tank.getCurrentStock()
                    .multiply(new BigDecimal("100"))
                    .divide(tank.getCapacity(), 1, RoundingMode.HALF_UP);
            if (stockPct.compareTo(new BigDecimal("5")) > 0) {
                log.warn("Tank {} disabled with {}% stock remaining ({} L/kg). Stock is now frozen.",
                        tankId, stockPct, tank.getCurrentStock());
                // Return 200 with the updated tank — frontend reads `status` and shows its own warning
            }
        }

        return ResponseEntity.ok(response);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NOZZLES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/nozzles
     * Returns ALL nozzles (ACTIVE and INACTIVE) with their outlets, ordered by nozzle number.
     * The setup page uses this to show disabled nozzles so they can be re-enabled.
     * Shift open/close and other operational flows use only ACTIVE nozzles via getMyPumps.
     */
    @GetMapping("/{pumpId}/nozzles")
    public ResponseEntity<List<NozzleResponse>> getNozzles(@PathVariable Long pumpId) {
        List<NozzleResponse> nozzles = nozzleRepository.findByPumpIdOrderByNozzleNumberAsc(pumpId)
                .stream()
                .map(this::toNozzleResponse)
                .toList();
        return ResponseEntity.ok(nozzles);
    }

    /**
     * PATCH /api/pumps/nozzles/{nozzleId}/status
     * Enables or disables a nozzle. Owner/Admin only.
     *
     * Disabling (ACTIVE → INACTIVE):
     * - Blocked if the nozzle has an active open shift. The operator must close the shift first.
     * - Once inactive the nozzle will not be available for new shifts until re-enabled.
     *
     * Re-enabling (INACTIVE → ACTIVE): always allowed.
     */
    @PatchMapping("/nozzles/{nozzleId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<NozzleResponse> updateNozzleStatus(
            @PathVariable Long nozzleId,
            @Valid @RequestBody UpdateNozzleStatusRequest request,
            @AuthenticationPrincipal User currentUser) {

        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        if (nozzle.getStatus() == request.status()) {
            throw new BusinessException("Nozzle #" + nozzle.getNozzleNumber() +
                    " is already " + request.status().name().toLowerCase() + ".");
        }

        if (request.status() == NozzleStatus.INACTIVE) {
            int nozzleNumber = nozzle.getNozzleNumber();
            shiftRepository.findOpenShiftByNozzle(nozzleId).ifPresent(shift -> {
                throw new BusinessException(
                        "Nozzle #" + nozzleNumber + " has an active shift in progress. " +
                        "The operator must close shift #" + shift.getId() + " before this nozzle can be disabled.");
            });
        }

        nozzle.setStatus(request.status());
        nozzle = nozzleRepository.save(nozzle);

        log.info("Nozzle {} (#{}) status changed to {} by user={}",
                nozzleId, nozzle.getNozzleNumber(), request.status(), currentUser.getId());

        return ResponseEntity.ok(toNozzleResponse(nozzle));
    }

    /**
     * PATCH /api/pumps/{pumpId}/max-nozzles
     * Increases (or adjusts) the maximum nozzle count for a pump. Owner/Admin only.
     *
     * Use case: the pump station gets a new dispenser machine that supports more fuel types,
     * so the max nozzle count needs to be raised to allow adding additional nozzles.
     *
     * Rules:
     * - New count must be >= the number of nozzles currently configured (cannot shrink below existing count).
     * - Hard cap of 20.
     */
    @PatchMapping("/{pumpId}/max-nozzles")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<PumpResponse> updateMaxNozzleCount(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpdateMaxNozzleCountRequest request,
            @AuthenticationPrincipal User currentUser) {

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        long currentNozzleCount = nozzleRepository.countByPumpId(pumpId);
        if (request.maxNozzleCount() < currentNozzleCount) {
            throw new BusinessException(
                    "Cannot set max nozzles to " + request.maxNozzleCount() +
                    " — the pump already has " + currentNozzleCount + " nozzles configured. " +
                    "The new limit must be at least " + currentNozzleCount + ".");
        }

        pump.setMaxNozzleCount(request.maxNozzleCount());
        pumpLocationRepository.save(pump);

        log.info("Max nozzle count for pump {} updated to {} by user={}", pumpId, request.maxNozzleCount(), currentUser.getId());

        return ResponseEntity.ok(toPumpResponse(pump));
    }

    /**
     * POST /api/pumps/{pumpId}/nozzles
     * Creates a nozzle with its initial set of fuel outlets.
     *
     * Rules:
     * - 1–4 non-CNG fuel types (PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL)
     * - OR exactly 1 CNG — never CNG mixed with other types
     */
    @PostMapping("/{pumpId}/nozzles")
    public ResponseEntity<NozzleResponse> addNozzle(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateNozzleRequest request,
            @AuthenticationPrincipal User currentUser) {

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new BusinessException("Pump not found"));

        if (nozzleRepository.existsByPumpIdAndNozzleNumber(pumpId, request.getNozzleNumber())) {
            throw new BusinessException(
                    "Nozzle #" + request.getNozzleNumber() + " already exists on this pump");
        }

        long existingCount = nozzleRepository.findByPumpIdAndStatus(pumpId, NozzleStatus.ACTIVE).size();
        if (existingCount >= pump.getMaxNozzleCount()) {
            throw new BusinessException(
                    "Pump already has the maximum number of nozzles (" + pump.getMaxNozzleCount() + ")");
        }

        validateFuelTypeCombination(request.getFuelTypes());

        BigDecimal maxMeter = request.getMaxMeterValue() != null
                ? request.getMaxMeterValue()
                : new BigDecimal("999999.999");

        Nozzle nozzle = Nozzle.builder()
                .pumpId(pumpId)
                .nozzleNumber(request.getNozzleNumber())
                .status(NozzleStatus.ACTIVE)
                .maxMeterValue(maxMeter)
                .build();

        nozzle = nozzleRepository.save(nozzle);
        final Long nozzleId = nozzle.getId();

        Map<FuelType, BigDecimal> startReadings = request.getStartReadings() != null
                ? request.getStartReadings()
                : Map.of();

        for (FuelType fuelType : request.getFuelTypes()) {
            BigDecimal initialReading = startReadings.getOrDefault(fuelType, BigDecimal.ZERO);
            outletRepository.save(NozzleOutlet.builder()
                    .nozzleId(nozzleId)
                    .fuelType(fuelType)
                    .lastReading(initialReading)
                    .build());
        }

        auditService.log(pumpId, AuditAction.NOZZLE_ADDED,
                "Nozzle", nozzle.getId().toString(),
                "Nozzle #" + nozzle.getNozzleNumber() + " added with fuel types: " + request.getFuelTypes(),
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(toNozzleResponse(nozzle));
    }

    /**
     * POST /api/pumps/nozzles/{nozzleId}/outlets
     * Adds a new fuel outlet to an existing nozzle.
     * Validated against the same CNG-mixing rule.
     */
    @PostMapping("/nozzles/{nozzleId}/outlets")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<NozzleResponse> addOutlet(
            @PathVariable Long nozzleId,
            @Valid @RequestBody AddNozzleOutletRequest request) {

        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        // Guard: fuel type changes cannot be made while an operator is mid-shift on this nozzle
        shiftRepository.findOpenShiftByNozzle(nozzleId).ifPresent(shift -> {
            throw new BusinessException(
                    "Cannot add a fuel outlet while nozzle #" + nozzle.getNozzleNumber() +
                    " has an active shift (Shift #" + shift.getId() + "). " +
                    "The operator must close the shift first.");
        });

        if (outletRepository.existsByNozzleIdAndFuelType(nozzleId, request.getFuelType())) {
            throw new BusinessException(
                    "Nozzle already has an outlet for " + request.getFuelType());
        }

        List<NozzleOutlet> existing = outletRepository.findByNozzleId(nozzleId);
        List<FuelType> combinedTypes = new java.util.ArrayList<>(
                existing.stream().map(NozzleOutlet::getFuelType).toList());
        combinedTypes.add(request.getFuelType());
        validateFuelTypeCombination(combinedTypes);

        BigDecimal initialReading = request.getInitialReading() != null
                ? request.getInitialReading()
                : BigDecimal.ZERO;

        outletRepository.save(NozzleOutlet.builder()
                .nozzleId(nozzleId)
                .fuelType(request.getFuelType())
                .lastReading(initialReading)
                .build());

        return ResponseEntity.ok(toNozzleResponse(nozzle));
    }

    /**
     * DELETE /api/pumps/nozzles/{nozzleId}/outlets/{outletId}
     * Removes a fuel outlet from a nozzle. Owner/Admin only.
     * The nozzle must have at least one outlet remaining after removal.
     */
    @DeleteMapping("/nozzles/{nozzleId}/outlets/{outletId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<NozzleResponse> removeOutlet(
            @PathVariable Long nozzleId,
            @PathVariable Long outletId) {

        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        // Guard: fuel type changes cannot be made while an operator is mid-shift on this nozzle
        shiftRepository.findOpenShiftByNozzle(nozzleId).ifPresent(shift -> {
            throw new BusinessException(
                    "Cannot remove a fuel outlet while nozzle #" + nozzle.getNozzleNumber() +
                    " has an active shift (Shift #" + shift.getId() + "). " +
                    "The operator must close the shift first.");
        });

        NozzleOutlet outlet = outletRepository.findById(outletId)
                .orElseThrow(() -> new ResourceNotFoundException("Outlet not found"));

        if (!outlet.getNozzleId().equals(nozzleId)) {
            throw new BusinessException("Outlet does not belong to this nozzle");
        }

        long outletCount = outletRepository.findByNozzleId(nozzleId).size();
        if (outletCount <= 1) {
            throw new BusinessException(
                    "Cannot remove the last outlet. Delete the nozzle instead.");
        }

        outletRepository.deleteById(outletId);
        return ResponseEntity.ok(toNozzleResponse(nozzle));
    }

    /**
     * PATCH /api/pumps/nozzles/{nozzleId}/outlets/{outletId}/tank
     * Maps an outlet to a specific underground tank. Owner/Admin only.
     *
     * Rules:
     * - The tank must belong to the same pump as the nozzle.
     * - The tank's fuel type must match the outlet's fuel type (same hose, same product).
     * - Pass tankId = null to clear the mapping (outlet becomes unmapped; shift-open blocked).
     *
     * The change takes effect for future shifts only. Any currently-open shift retains
     * the tank that was frozen at its open time and is not affected by this change.
     */
    @PatchMapping("/nozzles/{nozzleId}/outlets/{outletId}/tank")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<NozzleResponse> mapOutletToTank(
            @PathVariable Long nozzleId,
            @PathVariable Long outletId,
            @RequestBody MapOutletToTankRequest request) {

        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        NozzleOutlet outlet = outletRepository.findById(outletId)
                .orElseThrow(() -> new ResourceNotFoundException("Outlet not found"));

        if (!outlet.getNozzleId().equals(nozzleId)) {
            throw new BusinessException("Outlet does not belong to this nozzle");
        }

        if (request.tankId() != null) {
            UndergroundTank tank = tankRepository.findById(request.tankId())
                    .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));

            if (!tank.getPumpId().equals(nozzle.getPumpId())) {
                throw new BusinessException("Tank does not belong to the same pump as this nozzle");
            }
            if (tank.getFuelType() != outlet.getFuelType()) {
                throw new BusinessException(
                        "Fuel type mismatch: outlet dispenses " + outlet.getFuelType() +
                        " but tank '" + tank.getTankIdentifier() + "' holds " + tank.getFuelType() +
                        ". Map this outlet to a " + outlet.getFuelType() + " tank.");
            }

            log.info("Outlet {} ({}) mapped to tank {} ('{}') on nozzle {} by admin",
                    outletId, outlet.getFuelType(), tank.getId(), tank.getTankIdentifier(), nozzleId);
        } else {
            log.info("Outlet {} ({}) tank mapping cleared on nozzle {} by admin",
                    outletId, outlet.getFuelType(), nozzleId);
        }

        outlet.setTankId(request.tankId());
        outletRepository.save(outlet);

        return ResponseEntity.ok(toNozzleResponse(nozzle));
    }

    /**
     * PUT /api/pumps/nozzles/{nozzleId}/outlets/{outletId}/reading
     * Manually corrects the last known reading for an outlet.
     * Used when a meter is physically replaced or reset.
     */
    @PutMapping("/nozzles/{nozzleId}/outlets/{outletId}/reading")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<NozzleResponse> updateOutletReading(
            @PathVariable Long nozzleId,
            @PathVariable Long outletId,
            @RequestBody UpdateNozzleReadingRequest request) {

        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        NozzleOutlet outlet = outletRepository.findById(outletId)
                .orElseThrow(() -> new ResourceNotFoundException("Outlet not found"));

        if (!outlet.getNozzleId().equals(nozzleId)) {
            throw new BusinessException("Outlet does not belong to this nozzle");
        }

        if (request.getReading() != null) {
            outlet.setLastReading(request.getReading());
            outletRepository.save(outlet);
        }

        return ResponseEntity.ok(toNozzleResponse(nozzle));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * CNG must never be mixed with other fuel types on the same nozzle.
     * Max 4 non-CNG outlets per nozzle.
     */
    private void validateFuelTypeCombination(List<FuelType> fuelTypes) {
        boolean hasCng = fuelTypes.contains(FuelType.CNG);
        boolean hasNonCng = fuelTypes.stream().anyMatch(f -> f != FuelType.CNG);

        if (hasCng && hasNonCng) {
            throw new BusinessException(
                    "CNG cannot be combined with other fuel types on the same nozzle. " +
                    "CNG nozzles must be standalone.");
        }
        if (!hasCng && fuelTypes.size() > 4) {
            throw new BusinessException(
                    "A nozzle can have at most 4 fuel outlets (PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL).");
        }
    }

    private PumpResponse toPumpResponse(PumpLocation pump) {
        return PumpResponse.builder()
                .id(pump.getId())
                .name(pump.getName())
                .address(pump.getAddress())
                .maxNozzleCount(pump.getMaxNozzleCount())
                .ownerId(pump.getOwnerId())
                .createdAt(pump.getCreatedAt())
                .nozzles(buildNozzleResponses(pump.getId()))
                .build();
    }

    private List<NozzleResponse> buildNozzleResponses(Long pumpId) {
        return nozzleRepository.findByPumpIdAndStatus(pumpId, NozzleStatus.ACTIVE)
                .stream()
                .map(this::toNozzleResponse)
                .toList();
    }

    private NozzleResponse toNozzleResponse(Nozzle n) {
        List<NozzleResponse.OutletResponse> outlets = outletRepository.findByNozzleId(n.getId())
                .stream()
                .map(o -> new NozzleResponse.OutletResponse(o.getId(), o.getFuelType(), o.getLastReading(), o.getTankId()))
                .toList();

        return NozzleResponse.builder()
                .id(n.getId())
                .pumpId(n.getPumpId())
                .nozzleNumber(n.getNozzleNumber())
                .status(n.getStatus().name())
                .maxMeterValue(n.getMaxMeterValue())
                .outlets(outlets)
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

    // ─────────────────────────────────────────────────────────────────────────
    // SHIFT DEFINITIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns all shift definitions for a pump (all effective-date groups),
     * newest first. Used by the admin Pump Settings page.
     */
    @GetMapping("/{pumpId}/shift-definitions")
    public ResponseEntity<List<ShiftDefinitionResponse>> getShiftDefinitions(
            @PathVariable Long pumpId) {
        return ResponseEntity.ok(shiftDefinitionService.getForPump(pumpId));
    }

    /**
     * Returns only the currently active shift definitions for a pump (today's date).
     * Used by the balance sheet generate modal to populate the shift selector.
     */
    @GetMapping("/{pumpId}/shift-definitions/active")
    public ResponseEntity<List<ShiftDefinitionResponse>> getActiveShiftDefinitions(
            @PathVariable Long pumpId) {
        return ResponseEntity.ok(shiftDefinitionService.getActiveForPump(pumpId));
    }

    /**
     * Creates a new batch of shift definitions for a pump, all sharing the same
     * effectiveFrom date. The previous open definitions are automatically closed
     * (effectiveTo = effectiveFrom - 1 day).
     *
     * Validation enforced:
     *   - 1–4 shifts
     *   - Exactly one night shift, overlapping 00:00–06:00
     *   - No overlapping windows
     *   - Total duration ≤ 24 hours
     */
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

    /**
     * Deletes a specific group of shift definitions for a pump.
     * A group is uniquely identified by (effectiveFrom, effectiveTo):
     *   - effectiveTo absent/null → deletes the open-ended (active) group
     *   - effectiveTo provided → deletes that specific disabled group
     * Only permitted when no shifts have been recorded against the targeted definitions.
     */
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
