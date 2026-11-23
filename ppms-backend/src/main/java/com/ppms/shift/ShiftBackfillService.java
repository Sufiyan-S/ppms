package com.ppms.shift;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.report.BalanceSheetStalenessService;
import com.ppms.report.StaleReasons;
import com.ppms.settlement.PaymentSettlement;
import com.ppms.settlement.PaymentSettlementRepository;
import com.ppms.settlement.SettlementPaymentType;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShiftBackfillService {

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private final ShiftRepository shiftRepository;
    private final ShiftNozzleRepository shiftNozzleRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final NozzleRepository nozzleRepository;
    private final DispensaryUnitRepository duRepository;
    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;
    private final PaymentSettlementRepository settlementRepository;
    private final ShiftLifecycleSupportService lifecycleSupportService;
    private final ShiftReadModelService shiftReadModelService;
    private final ShiftFuelDeductionService fuelDeductionService;
    private final BusinessClock businessClock;
    private final BalanceSheetStalenessService balanceSheetStalenessService;

    private record StockScope(Long tankId, FuelType fuelType) {}

    /**
     * Backfills a historical closed shift for a pump.
     *
     * Intended for Admin/Owner use when a pump is onboarded and the owner wants to
     * enter past shift data. The resulting shift is stored with status
     * CLOSED_BALANCED or CLOSED_DISCREPANCY_PENDING and isBackfilled=true.
     *
     * Rules enforced:
     * - shiftDate must be within the last 365 days and not today or future
     * - shiftDefinitionId must belong to this pump
     * - closingReading >= openingReading for every nozzle (rollover not supported for backfill)
     * - No existing shift for the same nozzle + shiftDate + shiftDefinitionId (duplicate guard)
     * - A historical fuel price must exist for each fuel type at the shift start
     * - Inventory lots must exist and have sufficient stock (user must record deliveries first)
     * - nozzle.lastReading is NOT updated — historical data must not pollute current meter state
     */
    @Transactional
    public ShiftResponse backfillShift(Long pumpId, BackfillShiftRequest request, User currentUser) {
        LocalDate shiftDate = request.getShiftDate();
        validateBackfillDate(shiftDate);

        // The definition is only a label and time range for backfill; it need not have been active on shiftDate.
        PumpShiftDefinition shiftDef = shiftDefinitionRepository.findById(request.getShiftDefinitionId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT_DEFINITION,
                        "Shift definition not found: " + request.getShiftDefinitionId()));
        if (!shiftDef.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.SHIFT_DEFINITION, "Shift definition not found");
        }

        ZoneId ist = businessClock.zone();
        OffsetDateTime priceAsOf = LocalDateTime.of(shiftDate, shiftDef.getStartTime()).atZone(ist).toOffsetDateTime();
        OffsetDateTime stockAsOf = shiftDate.plusDays(1).atStartOfDay(ist).toOffsetDateTime();

        applyRateOverrides(pumpId, shiftDate, priceAsOf, request.getFuelRateOverrides(), currentUser);

        DispensaryUnit du = duRepository.findById(request.getDuId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DISPENSARY_UNIT,
                        "Dispensary Unit not found: " + request.getDuId()));
        if (!du.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.DISPENSARY_UNIT, "Dispensary Unit not found");
        }

        User operator = lifecycleSupportService.findOperatorForPump(request.getOperatorId(), pumpId);

        List<BackfillShiftRequest.NozzleReadingRequest> nozzleReadings = request.getNozzleReadings();
        lifecycleSupportService.rejectDuplicateNozzles(nozzleReadings.stream()
                .map(BackfillShiftRequest.NozzleReadingRequest::nozzleId)
                .toList());
        List<Nozzle> nozzles = loadAndValidateNozzles(du, shiftDef, shiftDate, nozzleReadings);
        Map<FuelType, BigDecimal> priceByFuelType = findHistoricalPrices(pumpId, shiftDate, priceAsOf, nozzles);
        Map<Long, Nozzle> nozzleById = nozzles.stream().collect(Collectors.toMap(Nozzle::getId, Function.identity()));

        fuelDeductionService.lockTanksForDeduction(pumpId,
                nozzles.stream().map(Nozzle::getTankId).filter(Objects::nonNull).toList(),
                nozzles.stream().filter(nozzle -> nozzle.getTankId() == null).map(Nozzle::getFuelType).toList());
        validateStockAvailable(pumpId, shiftDate, stockAsOf, nozzleReadings, nozzleById);

        Shift shift = shiftRepository.save(buildBackfilledShift(pumpId, du, operator, shiftDef, shiftDate, request, currentUser));
        Long shiftId = shift.getId();

        shiftNozzleRepository.saveAll(nozzles.stream()
                .map(nozzle -> ShiftNozzle.builder().shiftId(shiftId).nozzleId(nozzle.getId()).build())
                .toList());

        BigDecimal totalAmountDue = persistReadingsAndDeduct(
                shiftId, pumpId, stockAsOf, nozzleReadings, nozzleById, priceByFuelType);
        applyDiscrepancy(shift, request, totalAmountDue);
        shift = shiftRepository.save(shift);

        if (request.getCreditEntries() != null && !request.getCreditEntries().isEmpty()) {
            lifecycleSupportService.persistCloseCreditEntries(shiftId, pumpId, shiftDate, request.getCreditEntries());
        }

        autoSettleBackfilledDigitalPayments(pumpId, shiftId, shiftDate, request, currentUser);
        balanceSheetStalenessService.markSheetsOfShiftStale(pumpId, shiftDate, shiftDef.getId(),
                StaleReasons.shiftBackfilled(shiftId));

        log.info("Shift {} backfilled by {}: du={}, operator={}, date={}, definition='{}', totalDue={}, status={}",
                shiftId, currentUser.getId(), du.getId(), operator.getId(),
                shiftDate, shiftDef.getName(), totalAmountDue, shift.getStatus());

        List<ShiftCreditEntry> savedEntries = creditEntryRepository.findByShiftId(shiftId);
        List<ShiftFuelReading> finalReadings = fuelReadingRepository.findByShiftId(shiftId);
        return shiftReadModelService.toResponse(shift, du, nozzles, operator, currentUser.getFullName(), finalReadings, savedEntries);
    }

    private void validateBackfillDate(LocalDate shiftDate) {
        LocalDate today = businessClock.today();
        if (!shiftDate.isBefore(today)) {
            throw new BusinessException(ErrorCodes.BACKFILL_DATE_NOT_BEFORE_TODAY, Map.of(),
                    "Backfill shift date must be before today. Use the normal shift flow for today's shifts.");
        }
        if (shiftDate.isBefore(today.minusDays(365))) {
            throw new BusinessException(ErrorCodes.BACKFILL_DATE_TOO_OLD, Map.of("shiftDate", shiftDate.toString()),
                    "Backfill is only supported for shifts within the last 365 days. " +
                    "The provided date " + shiftDate + " is too far in the past.");
        }
    }

    /**
     * Saves each override as a historical price effective from the start of shiftDate, unless a price is already
     * in force at the shift start. A differing override would be silently ignored, so it is refused instead.
     */
    private void applyRateOverrides(Long pumpId, LocalDate shiftDate, OffsetDateTime priceAsOf,
                                    Map<String, BigDecimal> fuelRateOverrides, User currentUser) {
        if (fuelRateOverrides == null || fuelRateOverrides.isEmpty()) {
            return;
        }
        ZoneId ist = businessClock.zone();
        OffsetDateTime rateEffectiveFrom = shiftDate.atStartOfDay(ist).toOffsetDateTime();
        for (Map.Entry<String, BigDecimal> entry : fuelRateOverrides.entrySet()) {
            FuelType fuelType;
            try {
                fuelType = FuelType.valueOf(entry.getKey());
            } catch (IllegalArgumentException e) {
                throw new BusinessException(ErrorCodes.BACKFILL_INVALID_FUEL_TYPE,
                        Map.of("fuelType", String.valueOf(entry.getKey())),
                        "Invalid fuel type in fuelRateOverrides: " + entry.getKey());
            }
            BigDecimal rate = entry.getValue();
            if (rate == null || rate.compareTo(ZERO) <= 0) {
                throw new BusinessException(ErrorCodes.BACKFILL_FUEL_RATE_NOT_POSITIVE,
                        Map.of("fuelTypeCode", fuelType.name()),
                        "Fuel rate for " + fuelType + " must be greater than zero.");
            }
            Optional<GlobalFuelPrice> recordedPrice = fuelPriceRepository
                    .findFirstByPumpIdAndFuelTypeAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                            pumpId, fuelType, priceAsOf);
            if (recordedPrice.isPresent()) {
                if (recordedPrice.get().getPricePerUnit().compareTo(rate) != 0) {
                    throw new BusinessException(ErrorCodes.BACKFILL_RATE_CONFLICTS_WITH_PRICE, Map.of("fuelTypeCode", fuelType.name(),
                                    "recordedPrice", recordedPrice.get().getPricePerUnit().toPlainString(),
                                    "effectiveDate", recordedPrice.get().getEffectiveFrom().atZoneSameInstant(ist).toLocalDate().toString(),
                                    "shiftDate", shiftDate.toString(), "rate", rate.toPlainString()),
                            "A " + fuelType + " price of ₹" + recordedPrice.get().getPricePerUnit().toPlainString() +
                            " (effective " + recordedPrice.get().getEffectiveFrom().atZoneSameInstant(ist).toLocalDate() +
                            ") already applies to " + shiftDate + ". The entered rate ₹" + rate.toPlainString() +
                            " would not be used. Remove the rate override, or correct the price history first.");
                }
                continue;
            }
            fuelPriceRepository.save(GlobalFuelPrice.builder()
                    .pumpId(pumpId)
                    .fuelType(fuelType)
                    .pricePerUnit(rate.setScale(2, RoundingMode.HALF_UP))
                    .effectiveFrom(rateEffectiveFrom)
                    .setByUserId(currentUser.getId())
                    .build());
            log.info("Backfill: saved historical fuel rate pump={}, fuelType={}, rate={}, effectiveFrom={}",
                    pumpId, fuelType, rate, rateEffectiveFrom);
        }
    }

    private List<Nozzle> loadAndValidateNozzles(DispensaryUnit du, PumpShiftDefinition shiftDef, LocalDate shiftDate,
                                                List<BackfillShiftRequest.NozzleReadingRequest> nozzleReadings) {
        List<Nozzle> nozzles = new ArrayList<>();
        for (BackfillShiftRequest.NozzleReadingRequest nr : nozzleReadings) {
            Nozzle nozzle = nozzleRepository.findById(nr.nozzleId())
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.NOZZLE,
                            "Nozzle not found: " + nr.nozzleId()));

            if (!nozzle.getDuId().equals(du.getId())) {
                throw new BusinessException(ErrorCodes.NOZZLE_NOT_IN_DU,
                        Map.of("nozzleNumber", nozzle.getNozzleNumber(), "duName", du.getName()),
                        "Nozzle #" + nozzle.getNozzleNumber() + " does not belong to DU '" + du.getName() + "'.");
            }
            if (nr.closingReading().compareTo(nr.openingReading()) < 0) {
                throw new BusinessException(ErrorCodes.BACKFILL_CLOSING_READING_BELOW_OPENING, Map.of("closingReading", nr.closingReading().toPlainString(),
                                "openingReading", nr.openingReading().toPlainString(), "nozzleNumber", nozzle.getNozzleNumber()),
                        "Closing reading (" + nr.closingReading() + ") cannot be less than opening reading (" +
                        nr.openingReading() + ") for nozzle #" + nozzle.getNozzleNumber() +
                        ". Meter rollover is not supported for backfilled shifts.");
            }
            if (shiftRepository.countForNozzleDateAndDefinition(nozzle.getId(), shiftDate, shiftDef.getId()) > 0) {
                throw new BusinessException(ErrorCodes.BACKFILL_SHIFT_ALREADY_EXISTS, Map.of("nozzleNumber", nozzle.getNozzleNumber(),
                                "shiftDate", shiftDate.toString(), "shiftName", shiftDef.getName()),
                        "A shift for nozzle #" + nozzle.getNozzleNumber() +
                        " on " + shiftDate + " under '" + shiftDef.getName() + "' already exists.");
            }
            nozzles.add(nozzle);
        }
        return nozzles;
    }

    private Map<FuelType, BigDecimal> findHistoricalPrices(Long pumpId, LocalDate shiftDate, OffsetDateTime priceAsOf,
                                                           List<Nozzle> nozzles) {
        Map<FuelType, BigDecimal> priceByFuelType = new HashMap<>();
        for (Nozzle nozzle : nozzles) {
            priceByFuelType.computeIfAbsent(nozzle.getFuelType(), fuelType -> fuelPriceRepository
                    .findFirstByPumpIdAndFuelTypeAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                            pumpId, fuelType, priceAsOf)
                    .map(GlobalFuelPrice::getPricePerUnit)
                    .orElseThrow(() -> new BusinessException(ErrorCodes.BACKFILL_NO_FUEL_PRICE,
                            Map.of("fuelTypeCode", fuelType.name(), "shiftDate", shiftDate.toString()),
                            "No fuel price found for " + fuelType + " on or before " + shiftDate +
                            ". Please set the historical price before backfilling this shift.")));
        }
        return priceByFuelType;
    }

    /**
     * Fails before anything is saved when a tank (or, for unmapped nozzles, a fuel type) did not have enough
     * stock delivered on or before shiftDate.
     */
    private void validateStockAvailable(Long pumpId, LocalDate shiftDate, OffsetDateTime stockAsOf,
                                        List<BackfillShiftRequest.NozzleReadingRequest> nozzleReadings,
                                        Map<Long, Nozzle> nozzleById) {
        Map<StockScope, BigDecimal> unitsSoldByScope = new LinkedHashMap<>();
        Map<StockScope, FuelType> fuelTypeByScope = new HashMap<>();
        for (BackfillShiftRequest.NozzleReadingRequest nr : nozzleReadings) {
            BigDecimal unitsSold = nr.closingReading().subtract(nr.openingReading());
            if (unitsSold.compareTo(ZERO) <= 0) continue;

            Nozzle nozzle = nozzleById.get(nr.nozzleId());
            StockScope scope = nozzle.getTankId() != null
                    ? new StockScope(nozzle.getTankId(), null)
                    : new StockScope(null, nozzle.getFuelType());
            unitsSoldByScope.merge(scope, unitsSold, BigDecimal::add);
            fuelTypeByScope.put(scope, nozzle.getFuelType());
        }

        for (Map.Entry<StockScope, BigDecimal> entry : unitsSoldByScope.entrySet()) {
            StockScope scope = entry.getKey();
            BigDecimal needed = entry.getValue();
            FuelType fuelType = fuelTypeByScope.get(scope);
            BigDecimal available = fuelDeductionService.availableStockAsOf(pumpId, fuelType, scope.tankId(), stockAsOf);
            if (needed.compareTo(available) > 0) {
                throw new BusinessException(ErrorCodes.BACKFILL_INSUFFICIENT_STOCK, Map.of("fuelTypeCode", fuelType.name(), "shiftDate", shiftDate.toString(),
                                "litresNeeded", needed.setScale(2, RoundingMode.HALF_UP).toPlainString(),
                                "litresAvailable", available.setScale(2, RoundingMode.HALF_UP).toPlainString()),
                        "Insufficient " + fuelType.name() + " stock for backfill on " + shiftDate +
                        ": shift needs " + needed.setScale(2, RoundingMode.HALF_UP) +
                        " L but only " + available.setScale(2, RoundingMode.HALF_UP) +
                        " L was delivered on or before " + shiftDate +
                        ". Record a tanker delivery for this date before backfilling this shift.");
            }
        }
    }

    private Shift buildBackfilledShift(Long pumpId, DispensaryUnit du, User operator, PumpShiftDefinition shiftDef,
                                       LocalDate shiftDate, BackfillShiftRequest request, User currentUser) {
        ZoneId ist = businessClock.zone();
        OffsetDateTime actualStartTime = LocalDateTime.of(shiftDate, shiftDef.getStartTime()).atZone(ist).toOffsetDateTime();
        return Shift.builder()
                .pumpId(pumpId)
                .duId(du.getId())
                .operatorId(operator.getId())
                .openedByUserId(currentUser.getId())
                .closedByUserId(currentUser.getId())
                .shiftDefinitionId(shiftDef.getId())
                .shiftName(shiftDef.getName())
                .isNightShift(shiftDef.isNightShift())
                .shiftDate(shiftDate)
                .actualStartTime(actualStartTime)
                .actualEndTime(shiftDef.scheduledEnd(shiftDate, ist))
                .cashCollected(request.getCashCollected())
                .upiCollected(request.getUpiCollected())
                .cardCollected(request.getCardCollected())
                .fleetCardCollected(request.getFleetCardCollected())
                .creditTotal(request.getCreditTotal())
                .discrepancyReason(request.getDiscrepancyReason())
                .isOverdueFlag(false)
                .isBackfilled(true)
                .status(ShiftStatus.CLOSED_BALANCED)
                .build();
    }

    /** Saves one reading per nozzle, deducts its litres from inventory and returns the total amount due. */
    private BigDecimal persistReadingsAndDeduct(Long shiftId, Long pumpId, OffsetDateTime stockAsOf,
                                                List<BackfillShiftRequest.NozzleReadingRequest> nozzleReadings,
                                                Map<Long, Nozzle> nozzleById, Map<FuelType, BigDecimal> priceByFuelType) {
        BigDecimal totalAmountDue = ZERO;
        List<ShiftFuelReading> readings = new ArrayList<>();
        for (BackfillShiftRequest.NozzleReadingRequest nr : nozzleReadings) {
            Nozzle nozzle = nozzleById.get(nr.nozzleId());
            BigDecimal historicalPrice = priceByFuelType.get(nozzle.getFuelType());
            BigDecimal unitsSold = nr.closingReading().subtract(nr.openingReading()).setScale(3, RoundingMode.HALF_UP);

            readings.add(ShiftFuelReading.builder()
                    .shiftId(shiftId)
                    .nozzleId(nozzle.getId())
                    .fuelType(nozzle.getFuelType())
                    .tankId(nozzle.getTankId())
                    .startReading(nr.openingReading())
                    .endReading(nr.closingReading())
                    .priceSnapshot(historicalPrice)
                    .unitsSold(unitsSold)
                    .build());

            if (unitsSold.compareTo(ZERO) > 0) {
                fuelDeductionService.deductForBackfill(
                        shiftId, pumpId, nozzle.getFuelType(), nozzle.getTankId(), unitsSold, stockAsOf);
                totalAmountDue = totalAmountDue.add(unitsSold.multiply(historicalPrice));
            }
        }
        fuelReadingRepository.saveAll(readings);
        // Credit sales are already inside the meter-based amount; adding creditTotal would double count them.
        return totalAmountDue.setScale(2, RoundingMode.HALF_UP);
    }

    private void applyDiscrepancy(Shift shift, BackfillShiftRequest request, BigDecimal totalAmountDue) {
        BigDecimal totalCollected = request.getCashCollected()
                .add(request.getUpiCollected())
                .add(request.getCardCollected())
                .add(request.getFleetCardCollected())
                .add(request.getCreditTotal())
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal discrepancyAmount = totalCollected.subtract(totalAmountDue).abs();
        DiscrepancyType discrepancyType = null;
        ShiftStatus finalStatus = ShiftStatus.CLOSED_BALANCED;

        if (discrepancyAmount.compareTo(ZERO) > 0) {
            discrepancyType = totalCollected.compareTo(totalAmountDue) < 0 ? DiscrepancyType.SHORT : DiscrepancyType.OVER;
            finalStatus = ShiftStatus.CLOSED_DISCREPANCY_PENDING;
            if (request.getDiscrepancyReason() == null || request.getDiscrepancyReason().isBlank()) {
                throw new BusinessException(ErrorCodes.DISCREPANCY_REASON_REQUIRED, Map.of("expectedAmount", totalAmountDue.toPlainString(),
                                "collectedAmount", totalCollected.toPlainString()),
                        "A discrepancy reason is required when the collected amount does not match the expected amount. " +
                        "Expected: ₹" + totalAmountDue + ", Collected: ₹" + totalCollected + ".");
            }
        }

        shift.setTotalAmountDue(totalAmountDue);
        shift.setDiscrepancyAmount(discrepancyAmount.compareTo(ZERO) > 0 ? discrepancyAmount : null);
        shift.setDiscrepancyType(discrepancyType);
        shift.setStatus(finalStatus);
    }

    /**
     * Backfilled digital payments already reached the bank, so they are recorded as settled on the shift date
     * and never inflate the live wallet pending balance.
     */
    private void autoSettleBackfilledDigitalPayments(Long pumpId, Long shiftId, LocalDate shiftDate,
                                                     BackfillShiftRequest request, User actor) {
        Map<SettlementPaymentType, BigDecimal> amountByType = new LinkedHashMap<>();
        amountByType.put(SettlementPaymentType.UPI, request.getUpiCollected());
        amountByType.put(SettlementPaymentType.CARD, request.getCardCollected());
        amountByType.put(SettlementPaymentType.FLEET_CARD, request.getFleetCardCollected());

        amountByType.forEach((type, amount) -> {
            if (amount == null || amount.compareTo(ZERO) <= 0) return;

            settlementRepository.save(PaymentSettlement.builder()
                    .pumpId(pumpId)
                    .paymentType(type)
                    .settlementDate(shiftDate)
                    .amountReceived(amount.setScale(2, RoundingMode.HALF_UP))
                    .notes("Auto-settled from backfilled shift #" + shiftId)
                    .recordedByUserId(actor.getId())
                    .build());
            log.info("Auto-settled backfilled {} payment: pump={}, shiftId={}, amount={}, date={}",
                    type, pumpId, shiftId, amount, shiftDate);
        });
    }
}
