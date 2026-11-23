package com.ppms.adjustment;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.shift.ShiftRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class NozzleAdjustmentSupportService {

    private final NozzleRepository nozzleRepository;
    private final DispensaryUnitRepository dispensaryUnitRepository;
    private final ShiftRepository shiftRepository;

    public Nozzle requireAdjustableNozzle(Long pumpId, Long nozzleId) {
        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found"));
        dispensaryUnitRepository.findById(nozzle.getDuId()).ifPresent(du -> {
            if (!du.getPumpId().equals(pumpId)) {
                throw new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found");
            }
        });
        shiftRepository.findOpenShiftByNozzle(nozzleId).ifPresent(shift -> {
            throw new BusinessException(ErrorCodes.METER_ADJUSTMENT_SHIFT_RUNNING, Map.of(),
                    "Cannot adjust the meter reading — an active shift is running on this nozzle. Close the shift first.");
        });
        return nozzle;
    }

    /** Validates that a nozzle belongs to the given pump — used for read paths. */
    public Nozzle requireNozzleForPump(Long pumpId, Long nozzleId) {
        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found"));
        dispensaryUnitRepository.findById(nozzle.getDuId()).ifPresent(du -> {
            if (!du.getPumpId().equals(pumpId)) {
                throw new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found");
            }
        });
        return nozzle;
    }

    public String validateAdjustmentType(String adjustmentType) {
        String normalized = adjustmentType.toUpperCase();
        if (!normalized.equals("RESET") && !normalized.equals("CUSTOM_READING")) {
            throw new BusinessException(ErrorCodes.ADJUSTMENT_TYPE_INVALID,
                    Map.of(),
                    "adjustmentType must be RESET or CUSTOM_READING");
        }
        return normalized;
    }

    public BigDecimal resolveNewReading(String adjustmentType, BigDecimal requestedReading) {
        if ("RESET".equals(adjustmentType)) {
            return BigDecimal.ZERO;
        }
        if (requestedReading == null) {
            throw new BusinessException(ErrorCodes.NEW_READING_REQUIRED,
                    Map.of(),
                    "newReading is required for CUSTOM_READING adjustment");
        }
        if (requestedReading.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException(ErrorCodes.NEW_READING_NEGATIVE, Map.of(), "newReading cannot be negative");
        }
        return requestedReading.setScale(3, RoundingMode.HALF_UP);
    }

    public Nozzle saveNozzle(Nozzle nozzle) {
        return nozzleRepository.save(nozzle);
    }
}
