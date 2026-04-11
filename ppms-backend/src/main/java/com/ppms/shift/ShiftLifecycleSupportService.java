package com.ppms.shift;

import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.common.exception.BusinessException;
import com.ppms.credit.CreditAccountPolicyService;
import com.ppms.credit.CreditClient;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleOutlet;
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

    public PumpShiftDefinition validateShiftCanOpen(Nozzle nozzle, User operator, List<NozzleOutlet> outlets) {
        pumpClosureRepository.findByPumpIdAndClosureDate(nozzle.getPumpId(), LocalDate.now())
                .ifPresent(closure -> {
                    throw new BusinessException(
                            "This pump is closed today (" + closure.getClosureDate() + "): " + closure.getReason() +
                                    ". Remove the closure record in Setup → Closures if operations have resumed.");
                });

        calibrationLogRepository.findLatestByNozzleId(nozzle.getId()).ifPresent(latest -> {
            if (latest.getNextCalibrationDue() != null && LocalDate.now().isAfter(latest.getNextCalibrationDue())) {
                throw new BusinessException(
                        "Nozzle #" + nozzle.getNozzleNumber() + " calibration was due on " +
                                latest.getNextCalibrationDue() + " and has expired. " +
                                "Log a new calibration record (Setup → Calibration) before opening a shift.");
            }
        });

        if (nozzle.getStatus() != NozzleStatus.ACTIVE) {
            throw new BusinessException("Nozzle is inactive and cannot accept shifts");
        }

        shiftRepository.findOpenShiftByNozzle(nozzle.getId()).ifPresent(existing -> {
            throw new BusinessException(
                    "Nozzle #" + nozzle.getNozzleNumber() + " already has an open shift (ID " + existing.getId() + ")");
        });

        shiftRepository.findOpenShiftByOperator(operator.getId()).ifPresent(existing -> {
            throw new BusinessException(
                    operator.getFullName() + " already has an open shift (ID " + existing.getId() + ")");
        });

        if (outlets.isEmpty()) {
            throw new BusinessException("Nozzle #" + nozzle.getNozzleNumber() + " has no fuel outlets configured. " +
                    "Please add outlets in Setup before opening a shift.");
        }

        for (NozzleOutlet outlet : outlets) {
            BigDecimal price = getLatestPrice(nozzle.getPumpId(), outlet.getFuelType());
            if (price == null) {
                throw new BusinessException("No price is set for " + outlet.getFuelType() +
                        " on this pump. Please set a price before opening a shift.");
            }
            if (outlet.getTankId() == null) {
                throw new BusinessException(
                        outlet.getFuelType() + " outlet has no tank mapped. " +
                                "Please assign a tank to this outlet in Setup before opening a shift.");
            }
            tankRepository.findById(outlet.getTankId()).ifPresent(tank -> {
                if (tank.getStatus() == TankStatus.INACTIVE) {
                    throw new BusinessException(
                            "Tank '" + tank.getTankIdentifier() + "' mapped to " + outlet.getFuelType() +
                                    " outlet is currently inactive. Re-enable the tank or remap the outlet before opening a shift.");
                }
            });
        }

        PumpShiftDefinition shiftDef = shiftDefinitionService.detectCurrentShift(nozzle.getPumpId());

        // Female operators who have not given night-shift consent cannot be assigned to night shifts.
        if (shiftDef.isNightShift()
                && operator.getGender() == UserGender.FEMALE
                && !operator.isNightShiftConsent()) {
            throw new BusinessException(
                    operator.getFullName() + " has not given consent to work night shifts and cannot be assigned to this shift.");
        }

        return shiftDef;
    }

    public void createOpeningReadings(Long shiftId, Long pumpId, List<NozzleOutlet> outlets) {
        for (NozzleOutlet outlet : outlets) {
            fuelReadingRepository.save(ShiftFuelReading.builder()
                    .shiftId(shiftId)
                    .outletId(outlet.getId())
                    .fuelType(outlet.getFuelType())
                    .tankId(outlet.getTankId())
                    .startReading(outlet.getLastReading())
                    .priceSnapshot(getLatestPrice(pumpId, outlet.getFuelType()))
                    .build());
        }
    }

    public ClosingSummary processClosingReadings(Long shiftId, Nozzle nozzle, CloseShiftRequest request, List<ShiftFuelReading> readings) {
        Map<Long, BigDecimal> endReadingByOutletId = request.getFuelReadings().stream()
                .collect(Collectors.toMap(
                        CloseShiftRequest.OutletEndReadingRequest::outletId,
                        CloseShiftRequest.OutletEndReadingRequest::endReading));

        BigDecimal totalDue = ZERO;
        for (ShiftFuelReading reading : readings) {
            if (!endReadingByOutletId.containsKey(reading.getOutletId())) {
                throw new BusinessException("End reading missing for " + reading.getFuelType() + " outlet");
            }
            BigDecimal endReading = endReadingByOutletId.get(reading.getOutletId());
            BigDecimal unitsSold = calcUnits(reading.getStartReading(), endReading, nozzle.getMaxMeterValue());
            reading.setEndReading(endReading);
            reading.setUnitsSold(unitsSold);
            fuelReadingRepository.save(reading);
            totalDue = totalDue.add(unitsSold.multiply(reading.getPriceSnapshot()));
        }

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
        // Only count ACTIVE (non-voided) entries that were recorded mid-shift.
        // Voided entries represent cancelled transactions and must not count toward the total —
        // otherwise a voided ₹1,000 entry would cause the close-time validation to reject
        // a perfectly valid creditTotal of ₹800 (remaining after the void).
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
                throw new BusinessException("Credit entries are required when credit total is greater than zero. " +
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
        for (CloseShiftRequest.CreditEntryRequest entry : creditEntries) {
            CreditClient matchedClient = creditAccountPolicyService.resolveClientForPump(
                    pumpId, entry.clientId(), entry.clientName());
            creditAccountPolicyService.validateCreditLimit(pumpId, matchedClient, entry.amount());

            creditEntryRepository.save(ShiftCreditEntry.builder()
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
    }

    public void createCashCollectionEvent(Shift shift, User currentUser, Nozzle nozzle) {
        if (shift.getCashCollected().compareTo(ZERO) <= 0) {
            return;
        }
        String nozzleLabel = nozzle != null ? "Nozzle #" + nozzle.getNozzleNumber() : "Shift #" + shift.getId();
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
