package com.ppms.inventory;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.UndergroundTank;
import com.ppms.shift.MeterRollover;
import com.ppms.shift.ShiftFuelReading;
import com.ppms.shift.ShiftFuelReadingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Fuel sold on shifts that are still open only leaves tank stock when the shift closes, so a dip check
 * taken meanwhile needs each such nozzle's current meter reading to know what the tank should hold.
 * Open covers AUTO_CLOSED_OVERDUE too: its closing readings are still to be entered and its sales are still in stock.
 */
@Service
@RequiredArgsConstructor
public class OpenShiftMeterService {

    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final NozzleRepository nozzleRepository;
    private final DispensaryUnitRepository duRepository;

    public List<OpenShiftNozzleResponse> findOpenShiftNozzles(UndergroundTank tank) {
        List<ShiftFuelReading> openings = fuelReadingRepository.findOpenShiftReadingsByTankId(tank.getId());
        Map<Long, Nozzle> nozzleById = nozzlesOf(openings);
        Map<Long, DispensaryUnit> duById = dispensaryUnitsOf(nozzleById);
        return openings.stream()
                .map(opening -> {
                    Nozzle nozzle = nozzleById.get(opening.getNozzleId());
                    DispensaryUnit du = duById.get(nozzle.getDuId());
                    return new OpenShiftNozzleResponse(
                            opening.getShiftId(),
                            nozzle.getId(),
                            nozzle.getNozzleNumber(),
                            du != null ? du.getName() : null,
                            opening.getFuelType().name(),
                            opening.getStartReading(),
                            nozzle.getMaxMeterValue());
                })
                .toList();
    }

    /**
     * Returns, unsaved, what each open shift on the tank has sold so far. Every such nozzle needs exactly one
     * reading, and a reading follows the same rollover rules as a shift close.
     */
    public List<DipCheckNozzleReading> salesSinceShiftOpen(UndergroundTank tank,
                                                           List<RecordDipCheckRequest.NozzleMeterReading> meterReadings) {
        List<ShiftFuelReading> openings = fuelReadingRepository.findOpenShiftReadingsByTankId(tank.getId());
        Map<Long, BigDecimal> readingByNozzleId = readingsByNozzleId(meterReadings);

        Set<Long> openNozzleIds = openings.stream().map(ShiftFuelReading::getNozzleId).collect(Collectors.toSet());
        if (!openNozzleIds.containsAll(readingByNozzleId.keySet())) {
            throw new BusinessException(ErrorCodes.METER_READING_FOR_NOZZLE_WITHOUT_OPEN_SHIFT,
                    Map.of("tankIdentifier", tank.getTankIdentifier()),
                    "A meter reading was entered for a nozzle that is not on an open shift drawing from tank '" +
                    tank.getTankIdentifier() + "'. The shift may have just closed — reload and enter the readings again.");
        }

        Map<Long, Nozzle> nozzleById = nozzlesOf(openings);
        Map<Long, DispensaryUnit> duById = dispensaryUnitsOf(nozzleById);
        List<String> missing = openings.stream()
                .filter(opening -> !readingByNozzleId.containsKey(opening.getNozzleId()))
                .map(opening -> describe(nozzleById.get(opening.getNozzleId()), duById) +
                        " (opened at " + opening.getStartReading().toPlainString() + ")")
                .toList();
        if (!missing.isEmpty()) {
            throw new BusinessException(ErrorCodes.OPEN_SHIFT_METER_READINGS_MISSING,
                    Map.of("tankIdentifier", tank.getTankIdentifier(), "nozzleNumbers", openings.stream()
                            .filter(opening -> !readingByNozzleId.containsKey(opening.getNozzleId()))
                            .map(opening -> "#" + nozzleById.get(opening.getNozzleId()).getNozzleNumber())
                            .collect(Collectors.joining(", "))),
                    "Tank '" + tank.getTankIdentifier() + "' supplies a shift that is still open. Enter the current " +
                    "meter reading of " + String.join(", ", missing) + " so the fuel sold so far is not counted as a loss.");
        }

        List<DipCheckNozzleReading> sales = new ArrayList<>();
        for (ShiftFuelReading opening : openings) {
            Nozzle nozzle = nozzleById.get(opening.getNozzleId());
            String label = describe(nozzle, duById);
            BigDecimal meterReading = readingByNozzleId.get(opening.getNozzleId()).setScale(3, RoundingMode.HALF_UP);
            BigDecimal maxMeter = nozzle.getMaxMeterValue();
            if (meterReading.compareTo(maxMeter) > 0) {
                throw new BusinessException(ErrorCodes.METER_READING_ABOVE_MAXIMUM,
                        Map.of("meterReading", meterReading.toPlainString(),
                               "nozzleNumber", nozzle.getNozzleNumber(),
                               "maxMeterValue", maxMeter.toPlainString()),
                        "Meter reading " + meterReading.toPlainString() + " for " + label + " exceeds the maximum " +
                        "meter value of " + maxMeter.toPlainString() + ". Please verify the meter reading.");
            }
            if (meterReading.compareTo(opening.getStartReading()) < 0
                    && !MeterRollover.canRollOverFrom(opening.getStartReading(), maxMeter)) {
                throw new BusinessException(ErrorCodes.METER_READING_BELOW_SHIFT_OPENING,
                        Map.of("meterReading", meterReading.toPlainString(),
                               "nozzleNumber", nozzle.getNozzleNumber(),
                               "openingReading", opening.getStartReading().toPlainString()),
                        "Meter reading " + meterReading.toPlainString() + " for " + label + " is below the shift's " +
                        "opening reading " + opening.getStartReading().toPlainString() + ". Please verify the meter reading.");
            }
            sales.add(DipCheckNozzleReading.builder()
                    .shiftId(opening.getShiftId())
                    .nozzleId(opening.getNozzleId())
                    .openingReading(opening.getStartReading())
                    .meterReading(meterReading)
                    .unitsSold(MeterRollover.unitsBetween(opening.getStartReading(), meterReading, maxMeter))
                    .build());
        }
        return sales;
    }

    private static Map<Long, BigDecimal> readingsByNozzleId(List<RecordDipCheckRequest.NozzleMeterReading> meterReadings) {
        Map<Long, BigDecimal> readingByNozzleId = new HashMap<>();
        if (meterReadings == null) {
            return readingByNozzleId;
        }
        for (RecordDipCheckRequest.NozzleMeterReading reading : meterReadings) {
            if (readingByNozzleId.put(reading.nozzleId(), reading.meterReading()) != null) {
                throw new BusinessException(ErrorCodes.NOZZLE_REPEATED_IN_REQUEST, Map.of(),
                        "Each nozzle can only appear once in the request.");
            }
        }
        return readingByNozzleId;
    }

    private Map<Long, Nozzle> nozzlesOf(List<ShiftFuelReading> openings) {
        return nozzleRepository.findAllById(openings.stream().map(ShiftFuelReading::getNozzleId).toList()).stream()
                .collect(Collectors.toMap(Nozzle::getId, Function.identity()));
    }

    private Map<Long, DispensaryUnit> dispensaryUnitsOf(Map<Long, Nozzle> nozzleById) {
        return duRepository.findAllById(nozzleById.values().stream().map(Nozzle::getDuId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(DispensaryUnit::getId, Function.identity()));
    }

    private static String describe(Nozzle nozzle, Map<Long, DispensaryUnit> duById) {
        DispensaryUnit du = duById.get(nozzle.getDuId());
        return "nozzle #" + nozzle.getNozzleNumber() + (du != null ? " on " + du.getName() : "");
    }
}
