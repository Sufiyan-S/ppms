package com.ppms.pump;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.fuel.FuelType;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
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
import java.util.List;

/**
 * REST controller for Dispensary Unit (DU) and Nozzle management.
 *
 * A DU is the physical dispensing machine (MPD). Each DU has 1–9 nozzles,
 * each carrying exactly one fuel type. CNG nozzles can only appear on a CNG-only DU.
 *
 * Base URL: /api/pumps/{pumpId}/dus
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/dus")
@RequiredArgsConstructor
public class DispensaryUnitController {

    private final DispensaryUnitRepository duRepository;
    private final NozzleRepository nozzleRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final UndergroundTankRepository tankRepository;
    private final ShiftRepository shiftRepository;
    private final AuditService auditService;

    // ─────────────────────────────────────────────────────────────────────────
    // DISPENSARY UNITS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/dus
     * Returns all DUs for the pump with their nozzles (ACTIVE and INACTIVE DUs).
     */
    @GetMapping
    public ResponseEntity<List<DUResponse>> getDUs(@PathVariable Long pumpId) {
        List<DispensaryUnit> dus = duRepository.findByPumpIdOrderByDuNumberAsc(pumpId);
        List<DUResponse> responses = dus.stream().map(this::toDUResponse).toList();
        return ResponseEntity.ok(responses);
    }

    /**
     * POST /api/pumps/{pumpId}/dus
     * Creates a new Dispensary Unit with its initial nozzles.
     *
     * Rules:
     * - Pump must not exceed its max_du_count
     * - DU name must be unique per pump
     * - CNG nozzles cannot be mixed with non-CNG nozzles on the same DU
     * - Nozzle numbers must be unique within the DU (1–9)
     * - Fuel types must be unique within the DU
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    @Transactional
    public ResponseEntity<DUResponse> createDU(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateDURequest request,
            @AuthenticationPrincipal User currentUser) {

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        long existingCount = duRepository.countByPumpId(pumpId);
        if (existingCount >= pump.getMaxDuCount()) {
            throw new BusinessException(
                    "Pump already has the maximum number of Dispensary Units (" + pump.getMaxDuCount() + "). " +
                    "Increase the limit in Setup → Pump Settings if needed.");
        }

        if (duRepository.existsByPumpIdAndName(pumpId, request.getName().trim())) {
            throw new BusinessException(
                    "A Dispensary Unit named '" + request.getName() + "' already exists on this pump.");
        }

        validateNozzleInputs(request.getNozzles());

        int nextDuNumber = duRepository.findMaxDuNumberByPumpId(pumpId) + 1;

        DispensaryUnit du = DispensaryUnit.builder()
                .pumpId(pumpId)
                .duNumber(nextDuNumber)
                .name(request.getName().trim())
                .status(NozzleStatus.ACTIVE)
                .build();
        du = duRepository.save(du);
        final Long duId = du.getId();

        for (CreateDURequest.NozzleInput input : request.getNozzles()) {
            BigDecimal initialReading = input.getInitialReading() != null
                    ? input.getInitialReading()
                    : BigDecimal.ZERO;
            nozzleRepository.save(Nozzle.builder()
                    .duId(duId)
                    .nozzleNumber(input.getNozzleNumber())
                    .fuelType(input.getFuelType())
                    .lastReading(initialReading)
                    .status(NozzleStatus.ACTIVE)
                    .build());
        }

        auditService.log(pumpId, AuditAction.NOZZLE_ADDED,
                "DispensaryUnit", du.getId().toString(),
                "DU '" + du.getName() + "' (#" + du.getDuNumber() + ") created with " +
                request.getNozzles().size() + " nozzle(s)",
                currentUser);

        log.info("DU {} '{}' created for pump {} with {} nozzles by user={}",
                du.getId(), du.getName(), pumpId, request.getNozzles().size(), currentUser.getId());

        return ResponseEntity.status(HttpStatus.CREATED).body(toDUResponse(du));
    }

    /**
     * PATCH /api/pumps/{pumpId}/dus/{duId}/status
     * Enables or disables a DU. Owner/Admin only.
     * Disabling a DU is blocked if any of its nozzles have an open shift.
     */
    @PatchMapping("/{duId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> updateDUStatus(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @Valid @RequestBody UpdateNozzleStatusRequest request,
            @AuthenticationPrincipal User currentUser) {

        DispensaryUnit du = duRepository.findById(duId)
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found"));

        if (!du.getPumpId().equals(pumpId)) {
            throw new BusinessException("Dispensary Unit does not belong to this pump.");
        }

        if (du.getStatus() == request.status()) {
            throw new BusinessException("Dispensary Unit is already " + request.status().name().toLowerCase() + ".");
        }

        if (request.status() == NozzleStatus.INACTIVE) {
            List<Nozzle> nozzles = nozzleRepository.findByDuIdOrderByNozzleNumberAsc(duId);
            for (Nozzle nozzle : nozzles) {
                shiftRepository.findOpenShiftByNozzle(nozzle.getId()).ifPresent(shift -> {
                    throw new BusinessException(
                            "Cannot disable DU '" + du.getName() + "' — Nozzle #" + nozzle.getNozzleNumber() +
                            " has an active shift (Shift #" + shift.getId() + "). Close all shifts first.");
                });
            }
        }

        du.setStatus(request.status());
        duRepository.save(du);

        log.info("DU {} status changed to {} by user={}", duId, request.status(), currentUser.getId());

        return ResponseEntity.ok(toDUResponse(du));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NOZZLES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/pumps/{pumpId}/dus/{duId}/nozzles
     * Adds a single nozzle to an existing DU.
     */
    @PostMapping("/{duId}/nozzles")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> addNozzle(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @Valid @RequestBody CreateDURequest.NozzleInput request,
            @AuthenticationPrincipal User currentUser) {

        DispensaryUnit du = duRepository.findById(duId)
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found"));

        if (!du.getPumpId().equals(pumpId)) {
            throw new BusinessException("Dispensary Unit does not belong to this pump.");
        }

        if (nozzleRepository.existsByDuIdAndNozzleNumber(duId, request.getNozzleNumber())) {
            throw new BusinessException(
                    "Nozzle #" + request.getNozzleNumber() + " already exists on this DU.");
        }

        // CNG mixing check: if adding a non-CNG nozzle to a DU that already has CNG, or vice versa
        boolean addingCng = request.getFuelType() == FuelType.CNG;
        boolean duHasCng = nozzleRepository.existsByDuIdAndFuelType(duId, FuelType.CNG);
        long existingNozzleCount = nozzleRepository.countByDuId(duId);

        if (addingCng && existingNozzleCount > 0 && !duHasCng) {
            throw new BusinessException("Cannot add CNG to a DU that already has non-CNG nozzles.");
        }
        if (!addingCng && duHasCng) {
            throw new BusinessException("Cannot add non-CNG fuel to a CNG-only DU.");
        }

        if (existingNozzleCount >= 9) {
            throw new BusinessException("A DU can have at most 9 nozzles.");
        }

        BigDecimal initialReading = request.getInitialReading() != null
                ? request.getInitialReading()
                : BigDecimal.ZERO;

        nozzleRepository.save(Nozzle.builder()
                .duId(duId)
                .nozzleNumber(request.getNozzleNumber())
                .fuelType(request.getFuelType())
                .lastReading(initialReading)
                .status(NozzleStatus.ACTIVE)
                .build());

        auditService.log(pumpId, AuditAction.NOZZLE_ADDED,
                "Nozzle", duId.toString(),
                "Nozzle #" + request.getNozzleNumber() + " (" + request.getFuelType() + ") added to DU '" + du.getName() + "'",
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(toDUResponse(du));
    }

    /**
     * PATCH /api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/status
     * Enables or disables a single nozzle. Owner/Admin only.
     */
    @PatchMapping("/{duId}/nozzles/{nozzleId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> updateNozzleStatus(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @PathVariable Long nozzleId,
            @Valid @RequestBody UpdateNozzleStatusRequest request,
            @AuthenticationPrincipal User currentUser) {

        DispensaryUnit du = duRepository.findById(duId)
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found"));
        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        if (!nozzle.getDuId().equals(duId)) {
            throw new BusinessException("Nozzle does not belong to this DU.");
        }

        if (nozzle.getStatus() == request.status()) {
            throw new BusinessException("Nozzle #" + nozzle.getNozzleNumber() +
                    " is already " + request.status().name().toLowerCase() + ".");
        }

        if (request.status() == NozzleStatus.INACTIVE) {
            shiftRepository.findOpenShiftByNozzle(nozzleId).ifPresent(shift -> {
                throw new BusinessException(
                        "Nozzle #" + nozzle.getNozzleNumber() + " has an active shift (Shift #" + shift.getId() + "). " +
                        "The operator must close the shift before this nozzle can be disabled.");
            });
        }

        nozzle.setStatus(request.status());
        nozzleRepository.save(nozzle);

        log.info("Nozzle {} (#{}) status changed to {} by user={}",
                nozzleId, nozzle.getNozzleNumber(), request.status(), currentUser.getId());

        return ResponseEntity.ok(toDUResponse(du));
    }

    /**
     * PATCH /api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/tank
     * Maps a nozzle to an underground tank. Owner/Admin only.
     *
     * Rules:
     * - Tank must belong to the same pump
     * - Tank fuel type must match the nozzle's fuel type
     * - Pass tankId = null to clear the mapping
     */
    @PatchMapping("/{duId}/nozzles/{nozzleId}/tank")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> mapNozzleToTank(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @PathVariable Long nozzleId,
            @RequestBody MapOutletToTankRequest request) {

        DispensaryUnit du = duRepository.findById(duId)
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found"));
        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        if (!nozzle.getDuId().equals(duId)) {
            throw new BusinessException("Nozzle does not belong to this DU.");
        }

        if (request.tankId() != null) {
            UndergroundTank tank = tankRepository.findById(request.tankId())
                    .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));

            if (!tank.getPumpId().equals(pumpId)) {
                throw new BusinessException("Tank does not belong to the same pump as this nozzle.");
            }
            if (tank.getFuelType() != nozzle.getFuelType()) {
                throw new BusinessException(
                        "Fuel type mismatch: nozzle dispenses " + nozzle.getFuelType() +
                        " but tank '" + tank.getTankIdentifier() + "' holds " + tank.getFuelType() +
                        ". Map this nozzle to a " + nozzle.getFuelType() + " tank.");
            }

            log.info("Nozzle {} ({}) mapped to tank {} ('{}') on DU {} by admin",
                    nozzleId, nozzle.getFuelType(), tank.getId(), tank.getTankIdentifier(), duId);
        } else {
            log.info("Nozzle {} ({}) tank mapping cleared on DU {} by admin",
                    nozzleId, nozzle.getFuelType(), duId);
        }

        nozzle.setTankId(request.tankId());
        nozzleRepository.save(nozzle);

        return ResponseEntity.ok(toDUResponse(du));
    }

    /**
     * PUT /api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/reading
     * Manually corrects the last known reading for a nozzle.
     * Used when a meter is physically replaced or reset.
     */
    @PutMapping("/{duId}/nozzles/{nozzleId}/reading")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<DUResponse> updateNozzleReading(
            @PathVariable Long pumpId,
            @PathVariable Long duId,
            @PathVariable Long nozzleId,
            @RequestBody UpdateNozzleReadingRequest request) {

        DispensaryUnit du = duRepository.findById(duId)
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found"));
        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        if (!nozzle.getDuId().equals(duId)) {
            throw new BusinessException("Nozzle does not belong to this DU.");
        }

        if (request.getReading() != null) {
            nozzle.setLastReading(request.getReading());
            nozzleRepository.save(nozzle);
        }

        return ResponseEntity.ok(toDUResponse(du));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private DUResponse toDUResponse(DispensaryUnit du) {
        List<Nozzle> nozzles = nozzleRepository.findByDuIdOrderByNozzleNumberAsc(du.getId());
        List<DUResponse.NozzleDetail> nozzleDetails = nozzles.stream()
                .map(n -> new DUResponse.NozzleDetail(
                        n.getId(),
                        n.getNozzleNumber(),
                        n.getFuelType(),
                        n.getLastReading(),
                        n.getMaxMeterValue(),
                        n.getTankId(),
                        n.getStatus().name()))
                .toList();

        return DUResponse.builder()
                .id(du.getId())
                .pumpId(du.getPumpId())
                .duNumber(du.getDuNumber())
                .name(du.getName())
                .status(du.getStatus().name())
                .nozzles(nozzleDetails)
                .build();
    }

    /**
     * Validates nozzle inputs for a new DU creation request.
     * Enforces: no duplicate nozzle numbers, no duplicate fuel types, CNG-only rule.
     */
    private void validateNozzleInputs(List<CreateDURequest.NozzleInput> nozzles) {
        List<Integer> numbers = nozzles.stream().map(CreateDURequest.NozzleInput::getNozzleNumber).toList();
        if (numbers.size() != numbers.stream().distinct().count()) {
            throw new BusinessException("Duplicate nozzle numbers in the request.");
        }

        List<FuelType> fuelTypes = nozzles.stream().map(CreateDURequest.NozzleInput::getFuelType).toList();

        boolean hasCng = fuelTypes.contains(FuelType.CNG);
        boolean hasNonCng = fuelTypes.stream().anyMatch(f -> f != FuelType.CNG);
        if (hasCng && hasNonCng) {
            throw new BusinessException("CNG cannot be mixed with other fuel types on the same DU.");
        }

        if (nozzles.size() > 9) {
            throw new BusinessException("A DU can have at most 9 nozzles.");
        }
    }
}
