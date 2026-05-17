package com.ppms.shift;

import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.common.exception.BusinessException;
import com.ppms.credit.CreditAccountPolicyService;
import com.ppms.credit.CreditClient;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleStatus;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionService;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.user.User;
import com.ppms.user.UserGender;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShiftLifecycleSupportService {

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private final ShiftRepository shiftRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final UndergroundTankRepository tankRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final CreditAccountPolicyService creditAccountPolicyService;
    private final PumpShiftDefinitionService shiftDefinitionService;
    private final com.ppms.pump.PumpClosureRepository pumpClosureRepository;
    private final com.ppms.pump.NozzleCalibrationLogRepository calibrationLogRepository;
    private final CashEventRepository cashEventRepository;

    /**
     * Validates that a shift can be opened for the given nozzles on the given DU.
     *
     * Checks (in order):
     * 1. Pump is not closed today
     * 2. All nozzles belong to the specified DU
     * 3. Per nozzle: calibration not overdue, status ACTIVE, not already on an open shift
     * 4. Per nozzle: fuel price set, tank mapped and active
     * 5. Operator does not already have an open shift
     * 6. Night-shift consent for female operators
     *
     * Returns the active PumpShiftDefinition.
     */
    public PumpShiftDefinition validateShiftCanOpen(DispensaryUnit du, List<Nozzle> nozzles, User operator) {
        Long pumpId = du.getPumpId();

        pumpClosureRepository.findByPumpIdAndClosureDate(pumpId, LocalDate.now())
                .ifPresent(closure -> {
                    throw new BusinessException(
                            "This pump is closed today (" + closure.getClosureDate() + "): " + closure.getReason() +
                            ". Remove the closure record in Setup → Closures if operations have resumed.");
                });

        for (Nozzle nozzle : nozzles) {
            if (!nozzle.getDuId().equals(du.getId())) {
                throw new BusinessException(
                        "Nozzle #" + nozzle.getNozzleNumber() + " does not belong to DU '" + du.getName() + "'.");
            }

            calibrationLogRepository.findLatestByNozzleId(nozzle.getId()).ifPresent(latest -> {
                if (latest.getNextCalibrationDue() != null
                        && LocalDate.now().isAfter(latest.getNextCalibrationDue())) {
                    throw new BusinessException(
                            "Nozzle #" + nozzle.getNozzleNumber() + " calibration was due on " +
                            latest.getNextCalibrationDue() + " and has expired. " +
                            "Log a new calibration record (Setup → Calibration) before opening a shift.");
                }
            });

            if (nozzle.getStatus() != NozzleStatus.ACTIVE) {
                throw new BusinessException(
                        "Nozzle #" + nozzle.getNozzleNumber() + " is inactive and cannot accept shifts.");
            }

            shiftRepository.findOpenShiftByNozzle(nozzle.getId()).ifPresent(existing -> {
                throw new BusinessException(
                        "Nozzle #" + nozzle.getNozzleNumber() + " already has an open shift (ID " + existing.getId() + ").");
            });

            BigDecimal price = getLatestPrice(pumpId, nozzle.getFuelType());
            if (price == null) {
                throw new BusinessException("No price is set for " + nozzle.getFuelType() +
                        " on this pump. Please set a price before opening a shift.");
            }

            if (nozzle.getTankId() == null) {
                throw new BusinessException(
                        nozzle.getFuelType() + " nozzle #" + nozzle.getNozzleNumber() +
                        " has no tank mapped. Please assign a tank in Setup before opening a shift.");
            }

            tankRepository.findById(nozzle.getTankId()).ifPresent(tank -> {
                if (tank.getStatus() == TankStatus.INACTIVE) {
                    throw new BusinessException(
                            "Tank '" + tank.getTankIdentifier() + "' mapped to " + nozzle.getFuelType() +
                            " nozzle #" + nozzle.getNozzleNumber() +
                            " is currently inactive. Re-enable the tank or remap the nozzle before opening a shift.");
                }
            });
        }

        shiftRepository.findOpenShiftByOperator(operator.getId()).ifPresent(existing -> {
            throw new BusinessException(
                    operator.getFullName() + " already has an open shift (ID " + existing.getId() + ").");
        });

        PumpShiftDefinition shiftDef = shiftDefinitionService.detectCurrentShift(pumpId);

        if (shiftDef.isNightShift()
                && operator.getGender() == UserGender.FEMALE
                && !operator.isNightShiftConsent()) {
            throw new BusinessException(
                    operator.getFullName() + " has not given consent to work night shifts and cannot be assigned to this shift.");
        }

        return shiftDef;
    }

    /**
     * Creates one ShiftFuelReading per nozzle using each nozzle's stored lastReading as the start reading.
     */
    public void createOpeningReadings(Long shiftId, Long pumpId, List<Nozzle> nozzles) {
        List<ShiftFuelReading> readings = nozzles.stream()
                .map(nozzle -> ShiftFuelReading.builder()
                        .shiftId(shiftId)
                        .nozzleId(nozzle.getId())
                        .fuelType(nozzle.getFuelType())
                        .tankId(nozzle.getTankId())
                        .startReading(nozzle.getLastReading())
                        .priceSnapshot(getLatestPrice(pumpId, nozzle.getFuelType()))
                        .build())
                .toList();
        fuelReadingRepository.saveAll(readings);
    }

    /**
     * Processes end readings for all nozzles in the shift.
     *
     * @param maxMeterByNozzleId maps nozzleId → its maxMeterValue for rollover detection
     */
    public ClosingSummary processClosingReadings(Long shiftId, Map<Long, BigDecimal> maxMeterByNozzleId,
                                                  CloseShiftRequest request, List<ShiftFuelReading> readings) {
        Map<Long, BigDecimal> endReadingByNozzleId = request.getFuelReadings().stream()
                .collect(Collectors.toMap(
                        CloseShiftRequest.OutletEndReadingRequest::nozzleId,
                        CloseShiftRequest.OutletEndReadingRequest::endReading));

        BigDecimal totalDue = ZERO;
        for (ShiftFuelReading reading : readings) {
            if (!endReadingByNozzleId.containsKey(reading.getNozzleId())) {
                throw new BusinessException("End reading missing for " + reading.getFuelType() + " nozzle");
            }
            BigDecimal endReading = endReadingByNozzleId.get(reading.getNozzleId());
            BigDecimal maxMeter = maxMeterByNozzleId.getOrDefault(reading.getNozzleId(), new BigDecimal("99999999.999"));

            if (endReading.compareTo(ZERO) < 0) {
                throw new BusinessException(
                        "End reading for " + reading.getFuelType() + " nozzle cannot be negative. " +
                        "Please verify the meter reading.");
            }
            if (endReading.compareTo(maxMeter) > 0) {
                throw new BusinessException(
                        "End reading " + endReading.toPlainString() + " exceeds the maximum meter value of " +
                        maxMeter.toPlainString() + " for the " + reading.getFuelType() + " nozzle. " +
                        "Please verify the meter reading.");
            }

            BigDecimal unitsSold = calcUnits(reading.getStartReading(), endReading, maxMeter);
            reading.setEndReading(endReading);
            reading.setUnitsSold(unitsSold);
            totalDue = totalDue.add(unitsSold.multiply(reading.getPriceSnapshot()));
        }
        fuelReadingRepository.saveAll(readings);

        BigDecimal roundedTotalDue = totalDue.setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalCollected = request.getCashCollected()
                .add(request.getUpiCollected())
                .add(request.getCardCollected())
                .add(request.getFleetCardCollected())
                .add(request.getCreditTotal())
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal discrepancyAmount = totalCollected.subtract(roundedTotalDue).abs().setScale(2, RoundingMode.HALF_UP);
        DiscrepancyType discrepancyType = null;
        ShiftStatus newStatus = ShiftStatus.CLOSED_BALANCED;
        if (totalCollected.compareTo(roundedTotalDue) < 0) {
            discrepancyType = DiscrepancyType.SHORT;
            newStatus = ShiftStatus.CLOSED_DISCREPANCY_PENDING;
        } else if (totalCollected.compareTo(roundedTotalDue) > 0) {
            discrepancyType = DiscrepancyType.OVER;
            newStatus = ShiftStatus.CLOSED_DISCREPANCY_PENDING;
        }

        return ClosingSummary.builder()
                .totalDue(roundedTotalDue)
                .totalCollected(totalCollected)
                .discrepancyAmount(discrepancyAmount)
                .discrepancyType(discrepancyType)
                .status(newStatus)
                .build();
    }

    public List<CloseShiftRequest.CreditEntryRequest> validateCloseCreditEntries(Long shiftId, BigDecimal creditTotal,
                                                                                  List<CloseShiftRequest.CreditEntryRequest> creditEntries) {
        List<CloseShiftRequest.CreditEntryRequest> safeEntries = creditEntries == null ? Collections.emptyList() : creditEntries;

        BigDecimal preExistingCreditSum = creditEntryRepository.findByShiftId(shiftId).stream()
                .filter(e -> !"VOIDED".equals(e.getVoidStatus()))
                .map(ShiftCreditEntry::getAmount)
                .reduce(ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        if (creditTotal.compareTo(ZERO) > 0) {
            BigDecimal newEntriesSum = safeEntries.stream()
                    .map(CloseShiftRequest.CreditEntryRequest::amount)
                    .reduce(ZERO, BigDecimal::add)
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal allCreditSum = preExistingCreditSum.add(newEntriesSum).setScale(2, RoundingMode.HALF_UP);

            if (safeEntries.isEmpty() && preExistingCreditSum.compareTo(ZERO) == 0) {
                throw new BusinessException(
                        "Credit entries are required when credit total is greater than zero. " +
                        "Please add each client's name and amount.");
            }
            if (allCreditSum.compareTo(creditTotal.setScale(2, RoundingMode.HALF_UP)) != 0) {
                throw new BusinessException(
                        "Sum of all credit entries (₹" + allCreditSum + ") does not match the credit total " +
                        "(₹" + creditTotal + "). Please check your entries.");
            }
        }
        return safeEntries;
    }

    public void persistCloseCreditEntries(Long shiftId, Long pumpId, List<CloseShiftRequest.CreditEntryRequest> creditEntries) {
        List<ShiftCreditEntry> toSave = new ArrayList<>();
        for (CloseShiftRequest.CreditEntryRequest entry : creditEntries) {
            CreditClient matchedClient = creditAccountPolicyService.resolveClientForPump(
                    pumpId, entry.clientId(), entry.clientName());
            creditAccountPolicyService.validateCreditLimit(pumpId, matchedClient, entry.amount());

            toSave.add(ShiftCreditEntry.builder()
                    .shiftId(shiftId)
                    .clientId(matchedClient != null ? matchedClient.getId() : null)
                    .clientName(entry.clientName())
                    .billNo(entry.billNo())
                    .amount(entry.amount())
                    .fuelType(entry.fuelType())
                    .description(entry.description())
                    .vehicleRegistration(entry.vehicleRegistration())
                    .driverName(entry.driverName())
                    .build());
        }
        creditEntryRepository.saveAll(toSave);
    }

    public void createCashCollectionEvent(Shift shift, User currentUser, List<Nozzle> nozzles) {
        if (shift.getCashCollected() == null || shift.getCashCollected().compareTo(ZERO) <= 0) {
            return;
        }
        String nozzleLabel = nozzles != null && !nozzles.isEmpty()
                ? "Nozzles " + nozzles.stream().map(n -> "#" + n.getNozzleNumber()).collect(Collectors.joining(", "))
                : "Shift #" + shift.getId();
        cashEventRepository.save(CashEvent.builder()
                .pumpId(shift.getPumpId())
                .eventType(CashEventType.CASH_IN)
                .amount(shift.getCashCollected().setScale(2, RoundingMode.HALF_UP))
                .description("Cash collection from " + nozzleLabel + " shift close (Shift #" + shift.getId() + ")")
                .eventDate(LocalDate.now())
                .recordedByUserId(currentUser.getId())
                .build());
        log.info("Auto-created CASH_IN event for shift {}: amount={}", shift.getId(), shift.getCashCollected());
    }

    private BigDecimal calcUnits(BigDecimal start, BigDecimal end, BigDecimal maxMeterValue) {
        if (end.compareTo(start) >= 0) {
            return end.subtract(start).setScale(3, RoundingMode.HALF_UP);
        }
        return maxMeterValue.subtract(start).add(end).setScale(3, RoundingMode.HALF_UP);
    }

    private BigDecimal getLatestPrice(Long pumpId, FuelType fuelType) {
        return fuelPriceRepository.findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(pumpId, fuelType)
                .map(price -> price.getPricePerUnit())
                .orElse(null);
    }

    @Getter
    @Builder
    public static class ClosingSummary {
        private BigDecimal totalDue;
        private BigDecimal totalCollected;
        private BigDecimal discrepancyAmount;
        private DiscrepancyType discrepancyType;
        private ShiftStatus status;
    }
}
