package com.ppms.shift;

import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.credit.CreditAccountPolicyService;
import com.ppms.credit.CreditClient;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.invoice.InvoicedSaleGuard;
import com.ppms.pump.CurrentShiftWindow;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleStatus;
import com.ppms.pump.PumpShiftDefinitionService;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.user.User;
import com.ppms.user.UserGender;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
    private final UserRepository userRepository;
    private final BusinessClock businessClock;
    private final InvoicedSaleGuard invoicedSaleGuard;

    public User findOperatorForPump(Long operatorId, Long pumpId) {
        User operator = userRepository.findById(operatorId)
                .filter(user -> user.getRole() == UserRole.OPERATOR && pumpId.equals(user.getAssignedPumpId()))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.OPERATOR, "Operator not found"));
        if (operator.getStatus() != UserStatus.ACTIVE) {
            throw new BusinessException(ErrorCodes.OPERATOR_INACTIVE, Map.of("operatorName", operator.getFullName()),
                    operator.getFullName() + " is inactive and cannot be assigned a shift.");
        }
        return operator;
    }

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
     * Returns the matching shift definition and the business date of the shift.
     */
    public CurrentShiftWindow validateShiftCanOpen(DispensaryUnit du, List<Nozzle> nozzles, User operator) {
        Long pumpId = du.getPumpId();

        pumpClosureRepository.findByPumpIdAndClosureDate(pumpId, businessClock.today())
                .ifPresent(closure -> {
                    throw new BusinessException(ErrorCodes.PUMP_CLOSED_TODAY,
                            Map.of("closureDate", closure.getClosureDate().toString(),
                                   "reason", String.valueOf(closure.getReason())),
                            "This pump is closed today (" + closure.getClosureDate() + "): " + closure.getReason() +
                            ". Remove the closure record in Setup → Closures if operations have resumed.");
                });

        for (Nozzle nozzle : nozzles) {
            if (!nozzle.getDuId().equals(du.getId())) {
                throw new BusinessException(ErrorCodes.NOZZLE_NOT_IN_DU,
                        Map.of("nozzleNumber", nozzle.getNozzleNumber(), "duName", du.getName()),
                        "Nozzle #" + nozzle.getNozzleNumber() + " does not belong to DU '" + du.getName() + "'.");
            }

            rejectExpiredCalibration(nozzle);

            if (nozzle.getStatus() != NozzleStatus.ACTIVE) {
                throw new BusinessException(ErrorCodes.NOZZLE_INACTIVE,
                        Map.of("nozzleNumber", nozzle.getNozzleNumber()),
                        "Nozzle #" + nozzle.getNozzleNumber() + " is inactive and cannot accept shifts.");
            }

            shiftRepository.findOpenShiftByNozzle(nozzle.getId()).ifPresent(existing -> {
                throw new BusinessException(ErrorCodes.NOZZLE_SHIFT_ALREADY_OPEN,
                        Map.of("nozzleNumber", nozzle.getNozzleNumber(), "shiftId", existing.getId()),
                        "Nozzle #" + nozzle.getNozzleNumber() + " already has an open shift (ID " + existing.getId() + ").");
            });

            BigDecimal price = getLatestPrice(pumpId, nozzle.getFuelType());
            if (price == null) {
                throw new BusinessException(ErrorCodes.FUEL_PRICE_NOT_SET,
                        Map.of("fuelTypeCode", nozzle.getFuelType().name()),
                        "No price is set for " + nozzle.getFuelType() +
                        " on this pump. Please set a price before opening a shift.");
            }

            if (nozzle.getTankId() == null) {
                throw new BusinessException(ErrorCodes.NOZZLE_HAS_NO_TANK,
                        Map.of("fuelTypeCode", nozzle.getFuelType().name(), "nozzleNumber", nozzle.getNozzleNumber()),
                        nozzle.getFuelType() + " nozzle #" + nozzle.getNozzleNumber() +
                        " has no tank mapped. Please assign a tank in Setup before opening a shift.");
            }

            tankRepository.findById(nozzle.getTankId()).ifPresent(tank -> {
                if (tank.getStatus() == TankStatus.INACTIVE) {
                    throw new BusinessException(ErrorCodes.NOZZLE_TANK_INACTIVE,
                            Map.of("tankName", tank.getTankIdentifier(), "fuelTypeCode", nozzle.getFuelType().name(),
                                    "nozzleNumber", nozzle.getNozzleNumber()),
                            "Tank '" + tank.getTankIdentifier() + "' mapped to " + nozzle.getFuelType() +
                            " nozzle #" + nozzle.getNozzleNumber() +
                            " is currently inactive. Re-enable the tank or remap the nozzle before opening a shift.");
                }
            });
        }

        shiftRepository.findOpenShiftByOperator(operator.getId()).ifPresent(existing -> {
            throw new BusinessException(ErrorCodes.OPERATOR_SHIFT_ALREADY_OPEN,
                    Map.of("operatorName", operator.getFullName(), "shiftId", existing.getId()),
                    operator.getFullName() + " already has an open shift (ID " + existing.getId() + ").");
        });

        CurrentShiftWindow window = shiftDefinitionService.detectCurrentShift(pumpId);
        rejectNightShiftWithoutConsent(window.definition().isNightShift(), operator);
        return window;
    }

    public void rejectExpiredCalibration(Nozzle nozzle) {
        calibrationLogRepository.findLatestByNozzleId(nozzle.getId()).ifPresent(latest -> {
            if (latest.getNextCalibrationDue() != null
                    && businessClock.today().isAfter(latest.getNextCalibrationDue())) {
                throw new BusinessException(ErrorCodes.NOZZLE_CALIBRATION_EXPIRED,
                        Map.of("nozzleNumber", nozzle.getNozzleNumber(),
                               "dueDate", latest.getNextCalibrationDue().toString()),
                        "Nozzle #" + nozzle.getNozzleNumber() + " calibration was due on " +
                        latest.getNextCalibrationDue() + " and has expired. " +
                        "Log a new calibration record (Setup → Calibration) before opening a shift.");
            }
        });
    }

    public void rejectNightShiftWithoutConsent(boolean isNightShift, User operator) {
        if (isNightShift
                && operator.getGender() == UserGender.FEMALE
                && !operator.isNightShiftConsent()) {
            throw new BusinessException(ErrorCodes.OPERATOR_NO_NIGHT_SHIFT_CONSENT,
                    Map.of("operatorName", operator.getFullName()),
                    operator.getFullName() + " has not given consent to work night shifts and cannot be assigned to this shift.");
        }
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
        rejectDuplicateNozzles(request.getFuelReadings().stream()
                .map(CloseShiftRequest.OutletEndReadingRequest::nozzleId)
                .toList());
        Map<Long, BigDecimal> endReadingByNozzleId = request.getFuelReadings().stream()
                .collect(Collectors.toMap(
                        CloseShiftRequest.OutletEndReadingRequest::nozzleId,
                        CloseShiftRequest.OutletEndReadingRequest::endReading));

        BigDecimal totalDue = ZERO;
        for (ShiftFuelReading reading : readings) {
            if (!endReadingByNozzleId.containsKey(reading.getNozzleId())) {
                throw new BusinessException(ErrorCodes.END_READING_MISSING,
                        Map.of("fuelTypeCode", reading.getFuelType().name()),
                        "End reading missing for " + reading.getFuelType() + " nozzle");
            }
            BigDecimal endReading = endReadingByNozzleId.get(reading.getNozzleId());
            BigDecimal maxMeter = maxMeterByNozzleId.getOrDefault(reading.getNozzleId(), new BigDecimal("99999999.999"));

            if (endReading.compareTo(ZERO) < 0) {
                throw new BusinessException(ErrorCodes.END_READING_NEGATIVE,
                        Map.of("fuelTypeCode", reading.getFuelType().name()),
                        "End reading for " + reading.getFuelType() + " nozzle cannot be negative. " +
                        "Please verify the meter reading.");
            }
            if (endReading.compareTo(maxMeter) > 0) {
                throw new BusinessException(ErrorCodes.END_READING_ABOVE_METER_MAX, Map.of("endReading", endReading.toPlainString(),
                                "maxMeter", maxMeter.toPlainString(), "fuelTypeCode", reading.getFuelType().name()),
                        "End reading " + endReading.toPlainString() + " exceeds the maximum meter value of " +
                        maxMeter.toPlainString() + " for the " + reading.getFuelType() + " nozzle. " +
                        "Please verify the meter reading.");
            }

            if (endReading.compareTo(reading.getStartReading()) < 0
                    && !MeterRollover.canRollOverFrom(reading.getStartReading(), maxMeter)) {
                throw new BusinessException(ErrorCodes.CLOSING_READING_BELOW_OPENING,
                        Map.of("closingReading", endReading.toPlainString(),
                                "openingReading", reading.getStartReading().toPlainString(),
                                "fuelTypeCode", reading.getFuelType().name()),
                        "Closing reading " + endReading.toPlainString() + " is below the opening reading " +
                        reading.getStartReading().toPlainString() + " for the " + reading.getFuelType() +
                        " nozzle. Please verify the meter reading.");
            }

            BigDecimal unitsSold = MeterRollover.unitsBetween(reading.getStartReading(), endReading, maxMeter);
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
                                                                                  List<CloseShiftRequest.CreditEntryRequest> creditEntries,
                                                                                  Collection<Long> replacedEntryIds) {
        List<CloseShiftRequest.CreditEntryRequest> safeEntries = creditEntries == null ? Collections.emptyList() : creditEntries;
        Set<Long> replacedIds = replacedEntryIds == null ? Set.of() : new HashSet<>(replacedEntryIds);
        List<ShiftCreditEntry> shiftEntries = creditEntryRepository.findByShiftId(shiftId);
        Set<Long> activeEntryIds = shiftEntries.stream()
                .filter(e -> !"VOIDED".equals(e.getVoidStatus()))
                .map(ShiftCreditEntry::getId)
                .collect(Collectors.toSet());
        if (!activeEntryIds.containsAll(replacedIds)) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRY_NOT_REPLACEABLE,
                    Map.of(),
                    "Only active credit entries of this shift can be replaced at close.");
        }

        BigDecimal preExistingCreditSum = shiftEntries.stream()
                .filter(e -> activeEntryIds.contains(e.getId()) && !replacedIds.contains(e.getId()))
                .map(ShiftCreditEntry::getAmount)
                .reduce(ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal newEntriesSum = safeEntries.stream()
                .map(CloseShiftRequest.CreditEntryRequest::amount)
                .reduce(ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal allCreditSum = preExistingCreditSum.add(newEntriesSum).setScale(2, RoundingMode.HALF_UP);
        BigDecimal expectedCreditTotal = creditTotal.setScale(2, RoundingMode.HALF_UP);

        if (expectedCreditTotal.compareTo(ZERO) > 0 && safeEntries.isEmpty() && preExistingCreditSum.compareTo(ZERO) == 0) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRIES_REQUIRED, Map.of(),
                    "Credit entries are required when credit total is greater than zero. " +
                    "Please add each client's name and amount.");
        }
        if (allCreditSum.compareTo(expectedCreditTotal) != 0) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRIES_TOTAL_MISMATCH,
                    Map.of("entriesTotal", allCreditSum.toPlainString(),
                            "alreadyRecorded", preExistingCreditSum.toPlainString(),
                            "creditTotal", expectedCreditTotal.toPlainString()),
                    "Sum of all credit entries (₹" + allCreditSum + ", of which ₹" + preExistingCreditSum +
                    " was already recorded during the shift) does not match the credit total (₹" + expectedCreditTotal +
                    "). A credit entry may have been added while you were closing — reload the shift and check the entries.");
        }
        return safeEntries;
    }

    public void voidReplacedCreditEntries(Collection<Long> replacedEntryIds, User currentUser) {
        if (replacedEntryIds == null || replacedEntryIds.isEmpty()) {
            return;
        }
        List<ShiftCreditEntry> replaced = creditEntryRepository.findAllByIdForUpdate(replacedEntryIds);
        invoicedSaleGuard.requireFuelEntriesNotInvoiced(replaced.stream().map(ShiftCreditEntry::getId).toList());
        creditAccountPolicyService.lockLimitHoldersOfClients(replaced.stream()
                .map(ShiftCreditEntry::getClientId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        for (ShiftCreditEntry entry : replaced) {
            entry.setVoidStatus("VOIDED");
            entry.setVoidReason("Replaced by a corrected entry at shift close");
            entry.setVoidedByUserId(currentUser.getId());
            entry.setVoidedAt(businessClock.now());
        }
        creditEntryRepository.saveAll(replaced);
    }

    public void persistCloseCreditEntries(Long shiftId, Long pumpId, LocalDate saleDate,
                                          List<CloseShiftRequest.CreditEntryRequest> creditEntries) {
        List<ShiftCreditEntry> toSave = new ArrayList<>();
        Map<CreditClient, BigDecimal> amountByClient = new LinkedHashMap<>();
        for (CloseShiftRequest.CreditEntryRequest entry : creditEntries) {
            CreditClient matchedClient = creditAccountPolicyService.requireClientForCreditEntry(
                    pumpId, entry.clientId(), entry.clientName());
            amountByClient.merge(matchedClient, entry.amount(), BigDecimal::add);

            toSave.add(ShiftCreditEntry.builder()
                    .shiftId(shiftId)
                    .clientId(matchedClient.getId())
                    .clientName(entry.clientName())
                    .billNo(entry.billNo())
                    .amount(entry.amount())
                    .saleDate(saleDate)
                    .fuelType(entry.fuelType())
                    .description(entry.description())
                    .vehicleRegistration(entry.vehicleRegistration())
                    .driverName(entry.driverName())
                    .build());
        }
        creditAccountPolicyService.validateCreditLimits(amountByClient);
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
                .eventDate(businessClock.today())
                .recordedByUserId(currentUser.getId())
                .build());
        log.info("Auto-created CASH_IN event for shift {}: amount={}", shift.getId(), shift.getCashCollected());
    }

    public void createCashRecoveryEvent(Shift shift, User currentUser) {
        cashEventRepository.save(CashEvent.builder()
                .pumpId(shift.getPumpId())
                .eventType(CashEventType.CASH_IN)
                .amount(shift.getCashRecoveryAmount().setScale(2, RoundingMode.HALF_UP))
                .description("Cash recovered from operator for the shortage on Shift #" + shift.getId())
                .eventDate(businessClock.today())
                .recordedByUserId(currentUser.getId())
                .build());
        log.info("Auto-created CASH_IN event for cash recovery on shift {}: amount={}",
                shift.getId(), shift.getCashRecoveryAmount());
    }

    /** Request ids must be unique; a repeated nozzle would otherwise fail deep inside a map collector. */
    public void rejectDuplicateNozzles(List<Long> nozzleIds) {
        if (nozzleIds.size() != new HashSet<>(nozzleIds).size()) {
            throw new BusinessException(ErrorCodes.NOZZLE_REPEATED_IN_REQUEST,
                    Map.of(),
                    "Each nozzle can only appear once in the request.");
        }
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
