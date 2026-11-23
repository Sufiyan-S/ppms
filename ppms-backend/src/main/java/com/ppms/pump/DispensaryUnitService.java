package com.ppms.pump;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.fuel.FuelType;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Dispensary Units (the physical dispensing machines) and their nozzles. Each DU has 1–9 nozzles,
 * each carrying one fuel type; CNG nozzles can only appear on a CNG-only DU.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispensaryUnitService {

    private static final int MAX_NOZZLES_PER_DU = 9;

    private final DispensaryUnitRepository duRepository;
    private final NozzleRepository nozzleRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final UndergroundTankRepository tankRepository;
    private final ShiftRepository shiftRepository;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<DUResponse> getDUs(Long pumpId) {
        return toDUResponses(duRepository.findByPumpIdOrderByDuNumberAsc(pumpId));
    }

    @Transactional(readOnly = true)
    public List<DUResponse> getActiveDUs(Long pumpId) {
        return toDUResponses(duRepository.findByPumpIdAndStatus(pumpId, NozzleStatus.ACTIVE));
    }

    /**
     * Creates a DU with its initial nozzles, within the pump's max DU count. The DU name must be unique
     * per pump; nozzle numbers must be unique on the DU and CNG cannot be mixed with other fuels.
     */
    @Transactional
    public DUResponse createDU(Long pumpId, CreateDURequest request, User currentUser) {
        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found"));

        long existingCount = duRepository.countByPumpId(pumpId);
        if (existingCount >= pump.getMaxDuCount()) {
            throw new BusinessException(ErrorCodes.DU_LIMIT_REACHED,
                    Map.of("maxDuCount", String.valueOf(pump.getMaxDuCount())),
                    "Pump already has the maximum number of Dispensary Units (" + pump.getMaxDuCount() + "). " +
                    "Increase the limit in Setup → Pump Settings if needed.");
        }
        if (duRepository.existsByPumpIdAndName(pumpId, request.getName().trim())) {
            throw new BusinessException(ErrorCodes.DU_NAME_ALREADY_EXISTS,
                    Map.of("duName", String.valueOf(request.getName())),
                    "A Dispensary Unit named '" + request.getName() + "' already exists on this pump.");
        }
        validateNozzleInputs(request.getNozzles());

        DispensaryUnit du = duRepository.save(DispensaryUnit.builder()
                .pumpId(pumpId)
                .duNumber(duRepository.findMaxDuNumberByPumpId(pumpId) + 1)
                .name(request.getName().trim())
                .status(NozzleStatus.ACTIVE)
                .build());

        for (CreateDURequest.NozzleInput input : request.getNozzles()) {
            saveNewNozzle(du.getId(), input);
        }

        auditService.log(pumpId, AuditAction.NOZZLE_ADDED,
                "DispensaryUnit", du.getId().toString(),
                "DU '" + du.getName() + "' (#" + du.getDuNumber() + ") created with " +
                request.getNozzles().size() + " nozzle(s)",
                currentUser);
        log.info("DU {} '{}' created for pump {} with {} nozzles by user={}",
                du.getId(), du.getName(), pumpId, request.getNozzles().size(), currentUser.getId());

        return toDUResponse(du);
    }

    /** Enables or disables a DU; disabling is refused while any of its nozzles is on an open shift. */
    @Transactional
    public DUResponse updateDUStatus(Long pumpId, Long duId, NozzleStatus status, User currentUser) {
        DispensaryUnit du = findDuForPump(pumpId, duId);
        if (du.getStatus() == status) {
            throw new BusinessException(ErrorCodes.DU_ALREADY_IN_STATUS, Map.of("statusCode", status.name()),
                    "Dispensary Unit is already " + status.name().toLowerCase() + ".");
        }

        if (status == NozzleStatus.INACTIVE) {
            for (Nozzle nozzle : nozzleRepository.findByDuIdOrderByNozzleNumberAsc(duId)) {
                shiftRepository.findOpenShiftByNozzle(nozzle.getId()).ifPresent(shift -> {
                    throw new BusinessException(ErrorCodes.DU_DISABLE_BLOCKED_BY_OPEN_SHIFT,
                            Map.of("duName", du.getName(),
                                   "nozzleNumber", nozzle.getNozzleNumber(),
                                   "shiftId", shift.getId()),
                            "Cannot disable DU '" + du.getName() + "' — Nozzle #" + nozzle.getNozzleNumber() +
                            " has an active shift (Shift #" + shift.getId() + "). Close all shifts first.");
                });
            }
        }

        du.setStatus(status);
        duRepository.save(du);
        log.info("DU {} status changed to {} by user={}", duId, status, currentUser.getId());
        return toDUResponse(du);
    }

    @Transactional
    public DUResponse addNozzle(Long pumpId, Long duId, CreateDURequest.NozzleInput request, User currentUser) {
        DispensaryUnit du = findDuForPump(pumpId, duId);

        if (nozzleRepository.existsByDuIdAndNozzleNumber(duId, request.getNozzleNumber())) {
            throw new BusinessException(ErrorCodes.NOZZLE_NUMBER_ALREADY_ON_DU,
                    Map.of("nozzleNumber", String.valueOf(request.getNozzleNumber())),
                    "Nozzle #" + request.getNozzleNumber() + " already exists on this DU.");
        }

        boolean addingCng = request.getFuelType() == FuelType.CNG;
        boolean duHasCng = nozzleRepository.existsByDuIdAndFuelType(duId, FuelType.CNG);
        long existingNozzleCount = nozzleRepository.countByDuId(duId);
        if (addingCng && existingNozzleCount > 0 && !duHasCng) {
            throw new BusinessException(ErrorCodes.DU_HAS_NON_CNG_NOZZLES, Map.of(),
                    "Cannot add CNG to a DU that already has non-CNG nozzles.");
        }
        if (!addingCng && duHasCng) {
            throw new BusinessException(ErrorCodes.DU_IS_CNG_ONLY, Map.of(),
                    "Cannot add non-CNG fuel to a CNG-only DU.");
        }
        if (existingNozzleCount >= MAX_NOZZLES_PER_DU) {
            throw new BusinessException(ErrorCodes.DU_NOZZLE_LIMIT_REACHED, Map.of(),
                    "A DU can have at most 9 nozzles.");
        }

        saveNewNozzle(duId, request);

        auditService.log(pumpId, AuditAction.NOZZLE_ADDED,
                "Nozzle", duId.toString(),
                "Nozzle #" + request.getNozzleNumber() + " (" + request.getFuelType() + ") added to DU '" + du.getName() + "'",
                currentUser);
        return toDUResponse(du);
    }

    /** Enables or disables one nozzle; disabling is refused while it is on an open shift. */
    @Transactional
    public DUResponse updateNozzleStatus(Long pumpId, Long duId, Long nozzleId, NozzleStatus status, User currentUser) {
        DispensaryUnit du = findDuForPump(pumpId, duId);
        Nozzle nozzle = findNozzleOnDu(duId, nozzleId);
        if (nozzle.getStatus() == status) {
            throw new BusinessException(ErrorCodes.NOZZLE_ALREADY_IN_STATUS,
                    Map.of("nozzleNumber", nozzle.getNozzleNumber(), "statusCode", status.name()),
                    "Nozzle #" + nozzle.getNozzleNumber() +
                    " is already " + status.name().toLowerCase() + ".");
        }

        if (status == NozzleStatus.INACTIVE) {
            shiftRepository.findOpenShiftByNozzle(nozzleId).ifPresent(shift -> {
                throw new BusinessException(ErrorCodes.NOZZLE_DISABLE_BLOCKED_BY_OPEN_SHIFT,
                        Map.of("nozzleNumber", nozzle.getNozzleNumber(), "shiftId", shift.getId()),
                        "Nozzle #" + nozzle.getNozzleNumber() + " has an active shift (Shift #" + shift.getId() + "). " +
                        "The operator must close the shift before this nozzle can be disabled.");
            });
        }

        nozzle.setStatus(status);
        nozzleRepository.save(nozzle);
        log.info("Nozzle {} (#{}) status changed to {} by user={}",
                nozzleId, nozzle.getNozzleNumber(), status, currentUser.getId());
        return toDUResponse(du);
    }

    /** Maps a nozzle to a tank of the same pump and fuel type; a null tankId clears the mapping. */
    @Transactional
    public DUResponse mapNozzleToTank(Long pumpId, Long duId, Long nozzleId, Long tankId) {
        DispensaryUnit du = findDuForPump(pumpId, duId);
        Nozzle nozzle = findNozzleOnDu(duId, nozzleId);

        if (tankId != null) {
            UndergroundTank tank = tankRepository.findByIdAndPumpId(tankId, pumpId)
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK, "Tank not found"));
            if (tank.getFuelType() != nozzle.getFuelType()) {
                throw new BusinessException(ErrorCodes.NOZZLE_TANK_FUEL_MISMATCH,
                        Map.of("nozzleFuelTypeCode", nozzle.getFuelType().name(),
                               "tankIdentifier", tank.getTankIdentifier(),
                               "tankFuelTypeCode", tank.getFuelType().name()),
                        "Fuel type mismatch: nozzle dispenses " + nozzle.getFuelType() +
                        " but tank '" + tank.getTankIdentifier() + "' holds " + tank.getFuelType() +
                        ". Map this nozzle to a " + nozzle.getFuelType() + " tank.");
            }
            log.info("Nozzle {} ({}) mapped to tank {} ('{}') on DU {} by admin",
                    nozzleId, nozzle.getFuelType(), tank.getId(), tank.getTankIdentifier(), duId);
        } else {
            log.info("Nozzle {} ({}) tank mapping cleared on DU {} by admin", nozzleId, nozzle.getFuelType(), duId);
        }

        nozzle.setTankId(tankId);
        nozzleRepository.save(nozzle);
        return toDUResponse(du);
    }

    private DispensaryUnit findDuForPump(Long pumpId, Long duId) {
        return duRepository.findByIdAndPumpId(duId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DISPENSARY_UNIT,
                        "Dispensary Unit not found"));
    }

    private Nozzle findNozzleOnDu(Long duId, Long nozzleId) {
        return nozzleRepository.findByIdAndDuId(nozzleId, duId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found"));
    }

    private void saveNewNozzle(Long duId, CreateDURequest.NozzleInput input) {
        nozzleRepository.save(Nozzle.builder()
                .duId(duId)
                .nozzleNumber(input.getNozzleNumber())
                .fuelType(input.getFuelType())
                .lastReading(input.getInitialReading() != null ? input.getInitialReading() : BigDecimal.ZERO)
                .status(NozzleStatus.ACTIVE)
                .build());
    }

    private List<DUResponse> toDUResponses(List<DispensaryUnit> dus) {
        if (dus.isEmpty()) {
            return List.of();
        }
        Map<Long, List<Nozzle>> nozzlesByDuId = nozzleRepository.findByDuIdIn(dus.stream().map(DispensaryUnit::getId).toList())
                .stream()
                .sorted(Comparator.comparing(Nozzle::getNozzleNumber))
                .collect(Collectors.groupingBy(Nozzle::getDuId));
        return dus.stream()
                .map(du -> toDUResponse(du, nozzlesByDuId.getOrDefault(du.getId(), List.of())))
                .toList();
    }

    private DUResponse toDUResponse(DispensaryUnit du) {
        return toDUResponse(du, nozzleRepository.findByDuIdOrderByNozzleNumberAsc(du.getId()));
    }

    private DUResponse toDUResponse(DispensaryUnit du, List<Nozzle> nozzles) {
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

    private void validateNozzleInputs(List<CreateDURequest.NozzleInput> nozzles) {
        List<Integer> numbers = nozzles.stream().map(CreateDURequest.NozzleInput::getNozzleNumber).toList();
        if (numbers.size() != numbers.stream().distinct().count()) {
            throw new BusinessException(ErrorCodes.DUPLICATE_NOZZLE_NUMBERS, Map.of(),
                    "Duplicate nozzle numbers in the request.");
        }

        List<FuelType> fuelTypes = nozzles.stream().map(CreateDURequest.NozzleInput::getFuelType).toList();
        boolean hasCng = fuelTypes.contains(FuelType.CNG);
        boolean hasNonCng = fuelTypes.stream().anyMatch(f -> f != FuelType.CNG);
        if (hasCng && hasNonCng) {
            throw new BusinessException(ErrorCodes.DU_CNG_MIXED_WITH_OTHER_FUELS, Map.of(),
                    "CNG cannot be mixed with other fuel types on the same DU.");
        }
        if (nozzles.size() > MAX_NOZZLES_PER_DU) {
            throw new BusinessException(ErrorCodes.DU_NOZZLE_LIMIT_REACHED, Map.of(),
                    "A DU can have at most 9 nozzles.");
        }
    }
}
