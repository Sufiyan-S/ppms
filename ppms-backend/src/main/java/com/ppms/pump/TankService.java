package com.ppms.pump;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/**
 * Underground tank setup. Edits lock the tank row so they cannot overwrite a concurrent stock change.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TankService {

    private static final BigDecimal DEFAULT_DIP_TOLERANCE = new BigDecimal("20.000");
    private static final BigDecimal FROZEN_STOCK_WARNING_PERCENT = new BigDecimal("5");

    private final UndergroundTankRepository tankRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<TankResponse> getTanks(Long pumpId) {
        return tankRepository.findByPumpId(pumpId).stream()
                .filter(t -> t.getStatus() != TankStatus.DECOMMISSIONED)
                .map(this::toTankResponse)
                .toList();
    }

    @Transactional
    public TankResponse createTank(Long pumpId, CreateTankRequest request, User currentUser) {
        pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found"));

        if (tankRepository.existsByPumpIdAndTankIdentifier(pumpId, request.getTankIdentifier().trim())) {
            throw new BusinessException(ErrorCodes.TANK_NAME_ALREADY_EXISTS,
                    Map.of("tankIdentifier", String.valueOf(request.getTankIdentifier())),
                    "A tank named '" + request.getTankIdentifier() + "' already exists on this pump.");
        }

        UndergroundTank tank = tankRepository.save(UndergroundTank.builder()
                .pumpId(pumpId)
                .tankIdentifier(request.getTankIdentifier().trim())
                .fuelType(request.getFuelType())
                .capacity(request.getCapacity())
                .currentStock(BigDecimal.ZERO)
                .dipTolerance(request.getDipTolerance() != null ? request.getDipTolerance() : DEFAULT_DIP_TOLERANCE)
                .status(TankStatus.ACTIVE)
                .build());

        auditService.log(pumpId, AuditAction.TANK_ADDED,
                "UndergroundTank", tank.getId().toString(),
                "Tank added: " + tank.getTankIdentifier() + " (" + tank.getFuelType() + ", " + tank.getCapacity() + "L)",
                currentUser);
        return toTankResponse(tank);
    }

    @Transactional
    public TankResponse updateTank(Long pumpId, Long tankId, UpdateTankRequest request) {
        UndergroundTank tank = findTankForUpdate(pumpId, tankId);
        tank.setCapacity(request.getCapacity());
        if (request.getTankIdentifier() != null && !request.getTankIdentifier().isBlank()) {
            tank.setTankIdentifier(request.getTankIdentifier().trim());
        }
        return toTankResponse(tankRepository.save(tank));
    }

    @Transactional
    public TankResponse updateTankStatus(Long pumpId, Long tankId, TankStatus status, User currentUser) {
        UndergroundTank tank = findTankForUpdate(pumpId, tankId);
        if (status == TankStatus.DECOMMISSIONED) {
            throw new BusinessException(ErrorCodes.TANK_DECOMMISSION_NEEDS_ENDPOINT, Map.of(),
                    "Use the decommission endpoint to permanently remove a tank.");
        }
        if (tank.getStatus() == status) {
            throw new BusinessException(ErrorCodes.TANK_ALREADY_IN_STATUS, Map.of("statusCode", status.name()),
                    "Tank is already " + status.name().toLowerCase() + ".");
        }

        tank.setStatus(status);
        tank = tankRepository.save(tank);
        log.info("Tank {} status changed to {} by user={}", tankId, status, currentUser.getId());

        if (status == TankStatus.INACTIVE && tank.getCapacity().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal stockPct = tank.getCurrentStock()
                    .multiply(new BigDecimal("100"))
                    .divide(tank.getCapacity(), 1, RoundingMode.HALF_UP);
            if (stockPct.compareTo(FROZEN_STOCK_WARNING_PERCENT) > 0) {
                log.warn("Tank {} disabled with {}% stock remaining ({} L/kg). Stock is now frozen.",
                        tankId, stockPct, tank.getCurrentStock());
            }
        }
        return toTankResponse(tank);
    }

    private UndergroundTank findTankForUpdate(Long pumpId, Long tankId) {
        UndergroundTank tank = tankRepository.findByIdForUpdate(tankId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK, "Tank not found"));
        if (!tank.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.TANK, "Tank not found");
        }
        return tank;
    }

    private TankResponse toTankResponse(UndergroundTank tank) {
        return TankResponse.builder()
                .id(tank.getId())
                .pumpId(tank.getPumpId())
                .tankIdentifier(tank.getTankIdentifier())
                .fuelType(tank.getFuelType().name())
                .capacity(tank.getCapacity())
                .currentStock(tank.getCurrentStock())
                .dipTolerance(tank.getDipTolerance())
                .status(tank.getStatus().name())
                .createdAt(tank.getCreatedAt())
                .build();
    }
}
