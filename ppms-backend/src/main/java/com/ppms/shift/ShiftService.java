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
import com.ppms.pump.NozzleOutlet;
import com.ppms.pump.NozzleOutletRepository;
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
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final NozzleRepository nozzleRepository;
    private final NozzleOutletRepository outletRepository;
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
     * Opens a new shift for a nozzle and operator.
     *
     * Rules:
     * - One open shift per nozzle at a time
     * - One open shift per operator at a time
     * - A fuel price must exist for every fuel type on the nozzle before it can open
     * - Start readings are validated against the last known reading for each outlet
     * - Start readings must be provided for every outlet on the nozzle
     */
    @Transactional
    public ShiftResponse openShift(OpenShiftRequest request, User currentUser) {
        Nozzle nozzle = nozzleRepository.findById(request.getNozzleId())
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        User operator = userRepository.findById(request.getOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found"));

        List<NozzleOutlet> outlets = outletRepository.findByNozzleId(nozzle.getId());
        com.ppms.pump.PumpShiftDefinition shiftDef = lifecycleSupportService.validateShiftCanOpen(nozzle, operator, outlets);

        OffsetDateTime now = OffsetDateTime.now();

        Shift shift = Shift.builder()
                .pumpId(nozzle.getPumpId())
                .nozzleId(nozzle.getId())
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
        lifecycleSupportService.createOpeningReadings(shiftId, nozzle.getPumpId(), outlets);

        log.info("Shift {} opened: nozzle={}, operator={}, outlets={}, openedBy={}",
                shiftId, nozzle.getId(), operator.getId(), outlets.size(), currentUser.getId());
        shiftOpenedCounter.increment();

        // Reconcile shift planning: mark the actual operator as CONFIRMED,
        // any other planned operators for this slot as ABSENT.
        shiftPlanningService.reconcileOnShiftOpen(
                nozzle.getPumpId(), shift.getShiftDate(), shift.getShiftDefinitionId(), operator.getId());

        List<ShiftFuelReading> readings = fuelReadingRepository.findByShiftId(shiftId);
        return shiftReadModelService.toResponse(shift, nozzle, operator, currentUser.getFullName(), readings, Collections.emptyList());
    }

    /**
     * Closes a shift.
     *
     * Steps:
     * 1. Validate end readings provided for every outlet that was opened
     * 2. Calculate units sold per fuel type (with meter rollover support)
     * 3. Compute total amount due = sum of (units * snapshotted price) across all fuel types
     * 4. Validate payment breakdown sums match total due (or flag discrepancy)
     * 5. Validate credit entries if creditTotal > 0
     * 6. FIFO inventory deduction per fuel type (scoped to pump + fuelType)
     * 7. Update outlet last_reading for pre-fill on next shift open
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

        Nozzle nozzle = nozzleRepository.findById(shift.getNozzleId())
                .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found"));

        List<ShiftFuelReading> readings = fuelReadingRepository.findByShiftId(shiftId);
        ShiftLifecycleSupportService.ClosingSummary closingSummary =
                lifecycleSupportService.processClosingReadings(shiftId, nozzle, request, readings);
        List<CloseShiftRequest.CreditEntryRequest> creditEntries =
                lifecycleSupportService.validateCloseCreditEntries(shiftId, request.getCreditTotal(), request.getCreditEntries());

        // FIFO inventory deduction per fuel reading
        // If the reading carries a frozen tankId (shift opened after V9), deduct
        // from that tank only. For legacy readings (tankId is null) fall back to
        // the old pump+fuelType scan so historical shifts can still be closed.
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

        // Update outlet last_reading for pre-fill on next shift open
        for (ShiftFuelReading reading : readings) {
            outletRepository.findById(reading.getOutletId()).ifPresent(outlet -> {
                outlet.setLastReading(reading.getEndReading());
                outletRepository.save(outlet);
            });
        }
        lifecycleSupportService.createCashCollectionEvent(shift, currentUser, nozzle);
        lifecycleSupportService.persistCloseCreditEntries(shift.getId(), shift.getPumpId(), creditEntries);

        User operator = userRepository.findById(shift.getOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found"));
        List<ShiftCreditEntry> savedEntries = creditEntryRepository.findByShiftId(shift.getId());
        List<ShiftFuelReading> finalReadings = fuelReadingRepository.findByShiftId(shift.getId());
        return shiftReadModelService.toResponse(shift, nozzle, operator, currentUser.getFullName(), finalReadings, savedEntries);
    }

    /**
     * Adds a credit entry to an open shift mid-shift.
     *
     * Operators can record credit sales as they happen (e.g. fleet vehicle refuels)
     * rather than trying to remember 8 hours of credit at shift close time.
     * The entry is persisted immediately so it is visible in the Credit Ledger.
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

        // Operators can only add credit entries to their own active shift.
        // Enforced at the service layer so it cannot be bypassed via direct API calls.
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
     * Updates the discrepancy resolution for a CLOSED_DISCREPANCY_PENDING shift (spec Section 4.10).
     * WAIVED requires a non-blank reason (Business Rule 19).
     * Transitions the shift to CLOSED_DISCREPANCY_RESOLVED once a resolution is set.
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

        // P1.5 — Escalation threshold check.
        // If the pump has a discrepancy_escalation_threshold configured, only OWNER can resolve
        // discrepancies that exceed it. ADMIN/MANAGER must escalate to the Owner.
        // Use final local copies so they are accessible inside the lambda.
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
     * Voids a credit entry on an OPEN shift (spec Section 3.7, Business Rule 7).
     * Only the operator who logged the entry or the manager may void it.
     * Voided entries stay in the DB permanently; the shift's credit_total is not recalculated
     * here — it is recalculated at shift close from non-voided entries.
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
     * When tankId is non-null (shift opened after V9 migration), deduction is
     * scoped to that specific tank — the outlet's mapped tank was frozen at
     * shift-open. This accurately reflects physical pipe connections.
     *
     * When tankId is null (pre-V9 legacy shift), falls back to the original
     * pump+fuelType scan across all active tanks so old shifts can still close.
     *
     * Consumes from oldest lots first. Creates a LotConsumption record for each
     * lot touched. Also decrements each tank's current_stock proportionally.
     * Negative stock is allowed — it surfaces as a DIP discrepancy alert.
     */
    private void deductFromInventory(Long shiftId, Long pumpId, FuelType fuelType,
                                     Long tankId, BigDecimal unitsToDeduct) {
        List<InventoryLot> lots = tankId != null
                ? inventoryLotRepository.findActiveLotsByTankFifo(tankId)
                : inventoryLotRepository.findActiveLotsByPumpAndFuelTypeFifo(pumpId, fuelType);
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

            // Decrement the physical tank's stock
            tankRepository.findById(lot.getTankId()).ifPresent(tank -> {
                BigDecimal newStock = tank.getCurrentStock().subtract(consume).setScale(3, RoundingMode.HALF_UP);
                tank.setCurrentStock(newStock);
                tankRepository.save(tank);
            });

            remaining = remaining.subtract(consume);
        }

        // If stock ran out before all units were deducted — allow negative (DIP will surface it)
        if (remaining.compareTo(ZERO) > 0) {
            log.warn("Inventory shortage for pump={} fuelType={} tankId={}: {} L deducted but {} L not covered by any lot",
                    pumpId, fuelType, tankId, unitsToDeduct, remaining);
        }
    }

}
