package com.ppms.shift;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.credit.CreditAccountPolicyService;
import com.ppms.credit.CreditClient;
import com.ppms.fuel.FuelType;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.LotConsumptionSource;
import com.ppms.inventory.LotStatus;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import io.micrometer.core.instrument.Counter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShiftService {

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private final ShiftRepository shiftRepository;
    private final ShiftNozzleRepository shiftNozzleRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final NozzleRepository nozzleRepository;
    private final DispensaryUnitRepository duRepository;
    private final UserRepository userRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final UndergroundTankRepository tankRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final CreditAccountPolicyService creditAccountPolicyService;
    private final ShiftLifecycleSupportService lifecycleSupportService;
    private final ShiftReadModelService shiftReadModelService;
    private final com.ppms.planning.ShiftPlanningService shiftPlanningService;
    private final PumpLocationRepository pumpLocationRepository;
    private final Counter shiftOpenedCounter;
    private final Counter shiftClosedCounter;

    /**
     * Opens a new shift for selected nozzles on a Dispensary Unit.
     *
     * Rules:
     * - All nozzles must belong to the specified DU
     * - Each nozzle must not already have an open shift
     * - The operator must not already have an open shift
     * - A fuel price must exist for every nozzle's fuel type
     * - Every nozzle must be mapped to an active tank
     * - Start readings come from each nozzle's stored lastReading (auto pre-filled)
     */
    @Transactional
    public ShiftResponse openShift(OpenShiftRequest request, User currentUser) {
        DispensaryUnit du = duRepository.findById(request.getDuId())
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found: " + request.getDuId()));

        List<Nozzle> nozzles = request.getNozzleIds().stream()
                .map(id -> nozzleRepository.findById(id)
                        .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found: " + id)))
                .toList();

        User operator = userRepository.findById(request.getOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found"));

        com.ppms.pump.PumpShiftDefinition shiftDef = lifecycleSupportService.validateShiftCanOpen(du, nozzles, operator);

        Long pumpId = du.getPumpId();
        OffsetDateTime now = OffsetDateTime.now();

        Shift shift = Shift.builder()
                .pumpId(pumpId)
                .duId(du.getId())
                .operatorId(operator.getId())
                .openedByUserId(currentUser.getId())
                .shiftDefinitionId(shiftDef.getId())
                .shiftName(shiftDef.getName())
                .isNightShift(shiftDef.isNightShift())
                .shiftDate(LocalDate.now())
                .actualStartTime(now)
                .status(ShiftStatus.OPEN)
                .isOverdueFlag(false)
                .build();

        shift = shiftRepository.save(shift);
        final Long shiftId = shift.getId();

        // Persist nozzle assignments in the join table
        for (Nozzle nozzle : nozzles) {
            shiftNozzleRepository.save(ShiftNozzle.builder()
                    .shiftId(shiftId)
                    .nozzleId(nozzle.getId())
                    .build());
        }

        // Create opening readings — one per nozzle (each nozzle = one fuel type)
        lifecycleSupportService.createOpeningReadings(shiftId, pumpId, nozzles);

        log.info("Shift {} opened: du={}, nozzles={}, operator={}, openedBy={}",
                shiftId, du.getId(), request.getNozzleIds(), operator.getId(), currentUser.getId());
        shiftOpenedCounter.increment();

        shiftPlanningService.reconcileOnShiftOpen(
                pumpId, shift.getShiftDate(), shift.getShiftDefinitionId(), operator.getId());

        List<ShiftFuelReading> readings = fuelReadingRepository.findByShiftId(shiftId);
        return shiftReadModelService.toResponse(shift, du, nozzles, operator, currentUser.getFullName(), readings, Collections.emptyList());
    }

    /**
     * Closes a shift.
     *
     * Steps:
     * 1. Validate end readings provided for every nozzle that was opened
     * 2. Calculate units sold per nozzle (with meter rollover support)
     * 3. Compute total amount due = sum of (units × snapshotted price) across all nozzles
     * 4. Validate payment breakdown sums match total due (or flag discrepancy)
     * 5. Validate credit entries if creditTotal > 0
     * 6. FIFO inventory deduction per nozzle
     * 7. Update each nozzle's last_reading for pre-fill on next shift open
     */
    @Transactional
    public ShiftResponse closeShift(Long shiftId, CloseShiftRequest request, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (shift.getStatus() != ShiftStatus.OPEN
                && shift.getStatus() != ShiftStatus.OPEN_OVERDUE
                && shift.getStatus() != ShiftStatus.AUTO_CLOSED_OVERDUE) {
            throw new BusinessException("Shift is not open. Current status: " + shift.getStatus());
        }

        // Load all nozzles for this shift from the join table
        List<Long> nozzleIds = shiftNozzleRepository.findNozzleIdsByShiftId(shiftId);
        List<Nozzle> nozzles = nozzleRepository.findAllById(nozzleIds);
        Map<Long, Nozzle> nozzleById = nozzles.stream()
                .collect(Collectors.toMap(Nozzle::getId, Function.identity()));

        // Build maxMeter per nozzle for rollover calculations
        Map<Long, BigDecimal> maxMeterByNozzleId = nozzles.stream()
                .collect(Collectors.toMap(Nozzle::getId, Nozzle::getMaxMeterValue));

        List<ShiftFuelReading> readings = fuelReadingRepository.findByShiftId(shiftId);
        ShiftLifecycleSupportService.ClosingSummary closingSummary =
                lifecycleSupportService.processClosingReadings(shiftId, maxMeterByNozzleId, request, readings);
        List<CloseShiftRequest.CreditEntryRequest> creditEntries =
                lifecycleSupportService.validateCloseCreditEntries(shiftId, request.getCreditTotal(), request.getCreditEntries());

        // FIFO inventory deduction per nozzle reading
        for (ShiftFuelReading reading : readings) {
            if (reading.getUnitsSold() != null && reading.getUnitsSold().compareTo(ZERO) > 0) {
                deductFromInventory(shiftId, shift.getPumpId(), reading.getFuelType(),
                        reading.getTankId(), reading.getUnitsSold());
            }
        }

        // Persist closed shift
        shift.setActualEndTime(OffsetDateTime.now());
        shift.setClosedByUserId(currentUser.getId());
        shift.setTotalAmountDue(closingSummary.getTotalDue());
        shift.setCashCollected(request.getCashCollected());
        shift.setUpiCollected(request.getUpiCollected());
        shift.setCardCollected(request.getCardCollected());
        shift.setFleetCardCollected(request.getFleetCardCollected());
        shift.setCreditTotal(request.getCreditTotal());
        shift.setDiscrepancyAmount(closingSummary.getDiscrepancyAmount().compareTo(ZERO) > 0
                ? closingSummary.getDiscrepancyAmount() : null);
        shift.setDiscrepancyType(closingSummary.getDiscrepancyType());
        shift.setDiscrepancyReason(request.getDiscrepancyReason());
        shift.setStatus(closingSummary.getStatus());
        shift = shiftRepository.save(shift);

        log.info("Shift {} closed: totalDue={}, totalCollected={}, discrepancy={}, status={}",
                shiftId, closingSummary.getTotalDue(), closingSummary.getTotalCollected(),
                closingSummary.getDiscrepancyAmount(), closingSummary.getStatus());
        shiftClosedCounter.increment();

        // Update each nozzle's last_reading for pre-fill on next shift open
        for (ShiftFuelReading reading : readings) {
            nozzleRepository.findById(reading.getNozzleId()).ifPresent(nozzle -> {
                nozzle.setLastReading(reading.getEndReading());
                nozzleRepository.save(nozzle);
            });
        }

        lifecycleSupportService.createCashCollectionEvent(shift, currentUser, nozzles);
        lifecycleSupportService.persistCloseCreditEntries(shift.getId(), shift.getPumpId(), creditEntries);

        User operator = userRepository.findById(shift.getOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found"));
        DispensaryUnit du = duRepository.findById(shift.getDuId()).orElse(null);
        List<ShiftCreditEntry> savedEntries = creditEntryRepository.findByShiftId(shift.getId());
        List<ShiftFuelReading> finalReadings = fuelReadingRepository.findByShiftId(shift.getId());
        return shiftReadModelService.toResponse(shift, du, nozzles, operator, currentUser.getFullName(), finalReadings, savedEntries);
    }

    /**
     * Adds a credit entry to an open shift mid-shift.
     */
    @Transactional
    public ShiftResponse addCreditEntry(Long shiftId, AddCreditEntryRequest request, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (shift.getStatus() != ShiftStatus.OPEN
                && shift.getStatus() != ShiftStatus.OPEN_OVERDUE
                && shift.getStatus() != ShiftStatus.AUTO_CLOSED_OVERDUE) {
            throw new BusinessException("Cannot add credit entries to a shift that is not open.");
        }

        if (currentUser.getRole() == UserRole.OPERATOR
                && !currentUser.getId().equals(shift.getOperatorId())) {
            throw new BusinessException("Operators can only add credit entries to their own active shift.");
        }

        CreditClient matchedClient = creditAccountPolicyService.resolveClientForPump(
                shift.getPumpId(), request.getClientId(), request.getClientName());
        creditAccountPolicyService.validateCreditSaleAllowed(shift.getPumpId(), matchedClient, request.getAmount());

        creditEntryRepository.save(ShiftCreditEntry.builder()
                .shiftId(shiftId)
                .clientId(matchedClient != null ? matchedClient.getId() : null)
                .clientName(request.getClientName().trim())
                .billNo(request.getBillNo() != null ? request.getBillNo().trim() : null)
                .amount(request.getAmount().setScale(2, RoundingMode.HALF_UP))
                .fuelType(request.getFuelType())
                .description(request.getDescription() != null ? request.getDescription().trim() : null)
                .vehicleRegistration(request.getVehicleRegistration() != null ? request.getVehicleRegistration().trim() : null)
                .driverName(request.getDriverName() != null ? request.getDriverName().trim() : null)
                .build());

        log.info("Credit entry added mid-shift: shiftId={}, client={}, amount={}, by={}",
                shiftId, request.getClientName(), request.getAmount(), currentUser.getId());

        return shiftReadModelService.toResponseWithLookups(shift);
    }

    /**
     * Updates the discrepancy resolution for a CLOSED_DISCREPANCY_PENDING shift.
     */
    @Transactional
    public ShiftResponse resolveDiscrepancy(Long shiftId, ResolveDiscrepancyRequest request, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (shift.getStatus() != ShiftStatus.CLOSED_DISCREPANCY_PENDING) {
            throw new BusinessException(
                    "Shift is not in CLOSED_DISCREPANCY_PENDING state. Current status: " + shift.getStatus());
        }

        if (request.resolutionAction() == DiscrepancyResolution.WAIVED
                && (request.resolutionNote() == null || request.resolutionNote().isBlank())) {
            throw new BusinessException(
                    "A mandatory reason is required when waiving a discrepancy (Business Rule 19).");
        }

        final BigDecimal discrepancyAmountForCheck = shift.getDiscrepancyAmount();
        final UserRole resolverRole = currentUser.getRole();
        if (discrepancyAmountForCheck != null) {
            pumpLocationRepository.findById(shift.getPumpId()).ifPresent(pump -> {
                BigDecimal threshold = pump.getDiscrepancyEscalationThreshold();
                if (threshold != null && threshold.compareTo(ZERO) > 0
                        && discrepancyAmountForCheck.compareTo(threshold) > 0
                        && resolverRole != UserRole.OWNER
                        && resolverRole != UserRole.SUPER_ADMIN) {
                    throw new BusinessException(
                            "Discrepancy of ₹" + discrepancyAmountForCheck + " exceeds the escalation threshold of ₹" + threshold + ". " +
                            "Only the Owner can resolve discrepancies above this amount. Please escalate to the pump Owner.");
                }
            });
        }

        shift.setDiscrepancyResolution(request.resolutionAction());
        shift.setDiscrepancyResolutionNote(request.resolutionNote() != null ? request.resolutionNote().trim() : null);
        shift.setDiscrepancyResolvedById(currentUser.getId());
        shift.setDiscrepancyResolvedAt(OffsetDateTime.now());
        shift.setStatus(ShiftStatus.CLOSED_DISCREPANCY_RESOLVED);
        shift = shiftRepository.save(shift);

        log.info("Discrepancy resolved: shiftId={}, action={}, resolvedBy={}",
                shiftId, request.resolutionAction(), currentUser.getId());

        return shiftReadModelService.toResponseWithLookups(shift);
    }

    /**
     * Voids a credit entry on an OPEN shift.
     */
    @Transactional
    public ShiftResponse voidCreditEntry(Long shiftId, Long entryId, String voidReason, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (shift.getStatus() != ShiftStatus.OPEN
                && shift.getStatus() != ShiftStatus.OPEN_OVERDUE
                && shift.getStatus() != ShiftStatus.AUTO_CLOSED_OVERDUE) {
            throw new BusinessException(
                    "Credit entries can only be voided while the shift is open (Business Rule 7).");
        }

        if (voidReason == null || voidReason.isBlank()) {
            throw new BusinessException("A mandatory void reason is required.");
        }

        ShiftCreditEntry entry = creditEntryRepository.findById(entryId)
                .orElseThrow(() -> new ResourceNotFoundException("Credit entry not found"));

        if (!entry.getShiftId().equals(shiftId)) {
            throw new BusinessException("Credit entry does not belong to this shift.");
        }

        if ("VOIDED".equals(entry.getVoidStatus())) {
            throw new BusinessException("Credit entry is already voided.");
        }

        entry.setVoidStatus("VOIDED");
        entry.setVoidReason(voidReason.trim());
        entry.setVoidedByUserId(currentUser.getId());
        entry.setVoidedAt(OffsetDateTime.now());
        creditEntryRepository.save(entry);

        log.info("Credit entry {} voided on shift {}: reason='{}', by={}", entryId, shiftId, voidReason, currentUser.getId());

        return shiftReadModelService.toResponseWithLookups(shift);
    }

    public List<ShiftResponse> getActiveShifts(Long pumpId) {
        return shiftRepository.findActiveShiftsByPump(pumpId).stream()
                .map(shiftReadModelService::toResponseWithLookups)
                .toList();
    }

    public Page<ShiftResponse> getShiftHistory(Long pumpId, Pageable pageable) {
        return shiftRepository.findByPumpIdOrderByActualStartTimeDesc(pumpId, pageable)
                .map(shiftReadModelService::toResponseWithLookups);
    }

    public ShiftResponse getShiftById(Long shiftId) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));
        return shiftReadModelService.toResponseWithLookups(shift);
    }

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * FIFO inventory deduction.
     *
     * When tankId is non-null (frozen at shift open), deduction is scoped to that
     * specific tank. This accurately reflects physical pipe connections.
     *
     * Consumes from oldest lots first. Creates a LotConsumption record for each
     * lot touched and decrements the tank's current_stock proportionally.
     */
    private void deductFromInventory(Long shiftId, Long pumpId, FuelType fuelType,
                                     Long tankId, BigDecimal unitsToDeduct) {
        List<InventoryLot> lots = tankId != null
                ? inventoryLotRepository.findActiveLotsByTankFifo(tankId)
                : inventoryLotRepository.findActiveLotsByPumpAndFuelTypeFifo(pumpId, fuelType);

        BigDecimal totalAvailable = lots.stream()
                .map(InventoryLot::getRemainingQuantity)
                .reduce(ZERO, BigDecimal::add);

        if (unitsToDeduct.compareTo(totalAvailable) > 0) {
            throw new BusinessException(
                    "Insufficient fuel stock: shift recorded " + unitsToDeduct.setScale(2, RoundingMode.HALF_UP) +
                    " L sold but only " + totalAvailable.setScale(2, RoundingMode.HALF_UP) +
                    " L is available in inventory. Please verify the meter readings or record a tanker delivery first.");
        }

        BigDecimal remaining = unitsToDeduct;

        for (InventoryLot lot : lots) {
            if (remaining.compareTo(ZERO) <= 0) break;

            BigDecimal consume = remaining.min(lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity().subtract(consume).setScale(3, RoundingMode.HALF_UP));

            if (lot.getRemainingQuantity().compareTo(ZERO) == 0) {
                lot.setStatus(LotStatus.EXHAUSTED);
            }
            inventoryLotRepository.save(lot);

            lotConsumptionRepository.save(LotConsumption.builder()
                    .lotId(lot.getId())
                    .sourceType(LotConsumptionSource.SHIFT_CLOSE)
                    .shiftId(shiftId)
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());

            tankRepository.findById(lot.getTankId()).ifPresent(tank -> {
                BigDecimal newStock = tank.getCurrentStock().subtract(consume).setScale(3, RoundingMode.HALF_UP);
                tank.setCurrentStock(newStock);
                tankRepository.save(tank);
            });

            remaining = remaining.subtract(consume);
        }
    }
}
