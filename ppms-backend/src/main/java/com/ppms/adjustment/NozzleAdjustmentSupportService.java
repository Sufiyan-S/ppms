package com.ppms.adjustment;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.NozzleOutlet;
import com.ppms.pump.NozzleOutletRepository;
import com.ppms.shift.ShiftRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Service
@RequiredArgsConstructor
public class NozzleAdjustmentSupportService {

    private final NozzleOutletRepository outletRepository;
    private final ShiftRepository shiftRepository;
    private final GlobalFuelPriceRepository fuelPriceRepository;

    public NozzleOutlet requireAdjustableOutlet(Long outletId) {
        NozzleOutlet outlet = outletRepository.findById(outletId)
                .orElseThrow(() -> new ResourceNotFoundException("Outlet not found"));
        if (shiftRepository.hasOpenShift(outlet.getNozzleId())) {
            throw new BusinessException(
                    "Cannot adjust the meter reading — an active shift is running on this nozzle. Close the shift first.");
        }
        return outlet;
    }

    public String validateAdjustmentType(String adjustmentType) {
        String normalized = adjustmentType.toUpperCase();
        if (!normalized.equals("RESET") && !normalized.equals("CUSTOM_READING")) {
            throw new BusinessException("adjustmentType must be RESET or CUSTOM_READING");
        }
        return normalized;
    }

    public BigDecimal resolveNewReading(String adjustmentType, BigDecimal requestedReading) {
        if ("RESET".equals(adjustmentType)) {
            return BigDecimal.ZERO;
        }
        if (requestedReading == null) {
            throw new BusinessException("newReading is required for CUSTOM_READING adjustment");
        }
        if (requestedReading.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("newReading cannot be negative");
        }
        return requestedReading.setScale(3, RoundingMode.HALF_UP);
    }

    public FuelType parseFuelType(String fuelType) {
        try {
            return FuelType.valueOf(fuelType.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Unknown fuel type: " + fuelType);
        }
    }

    public BigDecimal requireCurrentPrice(Long pumpId, FuelType fuelType) {
        return fuelPriceRepository.findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(pumpId, fuelType)
                .map(price -> price.getPricePerUnit())
                .orElseThrow(() -> new BusinessException(
                        "No price configured for " + fuelType + " on this pump. Set a price first."));
    }

    public NozzleOutlet saveOutlet(NozzleOutlet outlet) {
        return outletRepository.save(outlet);
    }
}
