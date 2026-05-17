package com.ppms.shift;

import com.ppms.common.exception.BusinessException;
import org.springframework.dao.DataIntegrityViolationException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.credit.CreditAccountPolicyService;
import com.ppms.credit.CreditClient;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
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
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.settlement.PaymentSettlement;
import com.ppms.settlement.PaymentSettlementRepository;
import com.ppms.settlement.SettlementPaymentType;
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
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;
    private final Counter shiftOpenedCounter;
    private final Counter shiftClosedCounter;
    private final PaymentSettlementRepository settlementRepository;
    private final ActiveNozzleAssignmentRepository activeNozzleRepository;

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
    public ShiftResponse openShift(Long pumpId, OpenShiftRequest request, User currentUser) {
        DispensaryUnit du = duRepository.findById(request.getDuId())
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found: " + request.getDuId()));

        if (!du.getPumpId().equals(pumpId)) {
            throw new BusinessException("Dispensary Unit does not belong to pump " + pumpId);
        }

        List<Nozzle> nozzles = request.getNozzleIds().stream()
                .map(id -> nozzleRepository.findById(id)
                        .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found: " + id)))
                .toList();

        User operator = userRepository.findById(request.getOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found"));

        com.ppms.pump.PumpShiftDefinition shiftDef = lifecycleSupportService.validateShiftCanOpen(du, nozzles, operator);

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

        // Persist nozzle assignments in the join table (batch insert)
        shiftNozzleRepository.saveAll(nozzles.stream()
                .map(nozzle -> ShiftNozzle.builder()
                        .shiftId(shiftId)
                        .nozzleId(nozzle.getId())
                        .build())
                .toList());

        // DB-level nozzle exclusivity guard — PRIMARY KEY conflict here means two concurrent
        // requests raced past the application-level check in validateShiftCanOpen.
        try {
            for (Nozzle nozzle : nozzles) {
                activeNozzleRepository.save(ActiveNozzleAssignment.builder()
                        .nozzleId(nozzle.getId())
                        .shiftId(shiftId)
                        .build());
            }
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException(
                    "One or more selected nozzles are already in use on an active shift. " +
                    "Please refresh the page and try again.");
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
    public ShiftResponse closeShift(Long pumpId, Long shiftId, CloseShiftRequest request, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (!shift.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift does not belong to pump " + pumpId);
        }

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

        // Persist closed shift.
        // If the operator closes after the shift's scheduled end time, record the
        // scheduled end time as actualEndTime (not the real-world clock time).
        // This keeps actualEndTime aligned with the definition boundary so that
        // the DAY balance-sheet 24-hour window queries remain accurate.
        // If closing early or on time, use the actual close time.
        OffsetDateTime scheduledEnd = computeScheduledEndTime(shift);
        OffsetDateTime closeTime    = OffsetDateTime.now();
        shift.setActualEndTime(scheduledEnd != null && closeTime.isAfter(scheduledEnd)
                ? scheduledEnd : closeTime);
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
        shift.setStatus(escalateStatusIfNeeded(closingSummary.getStatus(),
                closingSummary.getDiscrepancyAmount(), shift.getPumpId()));
        shift = shiftRepository.save(shift);

        // Release the nozzle exclusivity lock now that the shift is closed
        activeNozzleRepository.deleteByShiftId(shiftId);

        log.info("Shift {} closed: totalDue={}, totalCollected={}, discrepancy={}, status={}",
                shiftId, closingSummary.getTotalDue(), closingSummary.getTotalCollected(),
                closingSummary.getDiscrepancyAmount(), closingSummary.getStatus());
        shiftClosedCounter.increment();

        // Update each nozzle's last_reading for pre-fill on next shift open.
        // nozzleById is already populated above — no extra DB round-trip per nozzle.
        List<Nozzle> updatedNozzles = new ArrayList<>();
        for (ShiftFuelReading reading : readings) {
            Nozzle nozzle = nozzleById.get(reading.getNozzleId());
            if (nozzle != null) {
                nozzle.setLastReading(reading.getEndReading());
                updatedNozzles.add(nozzle);
            }
        }
        nozzleRepository.saveAll(updatedNozzles);

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
     * If the initial status is CLOSED_DISCREPANCY_PENDING and the pump has a configured
     * escalation threshold that the discrepancy exceeds, upgrades the status to
     * CLOSED_DISCREPANCY_PENDING_APPROVAL so only OWNER/ADMIN can resolve it.
     */
    private ShiftStatus escalateStatusIfNeeded(ShiftStatus base, BigDecimal discrepancyAmount, Long pumpId) {
        if (base != ShiftStatus.CLOSED_DISCREPANCY_PENDING) return base;
        if (discrepancyAmount == null || discrepancyAmount.compareTo(ZERO) <= 0) return base;
        return pumpLocationRepository.findById(pumpId)
                .map(pump -> {
                    BigDecimal threshold = pump.getDiscrepancyEscalationThreshold();
                    if (threshold != null && threshold.compareTo(ZERO) > 0
                            && discrepancyAmount.compareTo(threshold) > 0) {
                        return ShiftStatus.CLOSED_DISCREPANCY_PENDING_APPROVAL;
                    }
                    return base;
                })
                .orElse(base);
    }

    /**
     * Derives the shift's scheduled end time from its linked definition.
     * Cross-midnight shifts (e.g. 22:00–09:00) end on shiftDate + 1.
     * Returns null if no definition is linked or if it no longer exists (legacy data).
     */
    private OffsetDateTime computeScheduledEndTime(Shift shift) {
        if (shift.getShiftDefinitionId() == null) return null;
        ZoneId ist = ZoneId.of("Asia/Kolkata");
        return shiftDefinitionRepository.findById(shift.getShiftDefinitionId())
                .map(def -> {
                    LocalDate endDate = def.isCrossesMidnight()
                            ? shift.getShiftDate().plusDays(1)
                            : shift.getShiftDate();
                    return LocalDateTime.of(endDate, def.getEndTime()).atZone(ist).toOffsetDateTime();
                })
                .orElse(null);
    }

    /**
     * Adds a credit entry to an open shift mid-shift.
     */
    @Transactional
    public ShiftResponse addCreditEntry(Long pumpId, Long shiftId, AddCreditEntryRequest request, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (!shift.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift does not belong to pump " + pumpId);
        }

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
    public ShiftResponse resolveDiscrepancy(Long pumpId, Long shiftId, ResolveDiscrepancyRequest request, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (!shift.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift does not belong to pump " + pumpId);
        }

        boolean isPending         = shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING;
        boolean isPendingApproval = shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING_APPROVAL;
        if (!isPending && !isPendingApproval) {
            throw new BusinessException(
                    "Shift has no pending discrepancy to resolve. Current status: " + shift.getStatus());
        }

        if (isPendingApproval) {
            UserRole role = currentUser.getRole();
            if (role != UserRole.OWNER && role != UserRole.ADMIN && role != UserRole.SUPER_ADMIN) {
                throw new BusinessException(
                        "This discrepancy exceeds the escalation threshold and requires Owner or Admin approval. " +
                        "Managers cannot resolve escalated discrepancies.");
            }
        }

        if (request.resolutionAction() == DiscrepancyResolution.WAIVED
                && (request.resolutionNote() == null || request.resolutionNote().isBlank())) {
            throw new BusinessException(
                    "A mandatory reason is required when waiving a discrepancy (Business Rule 19).");
        }

        // CASH_RECOVERY only makes sense for SHORT discrepancies — the operator
        // physically returns the cash they failed to hand in. An OVER discrepancy
        // means the operator handed in excess money; there is nothing to recover.
        if (request.resolutionAction() == DiscrepancyResolution.CASH_RECOVERY
                && shift.getDiscrepancyType() != DiscrepancyType.SHORT) {
            throw new BusinessException(
                    "CASH_RECOVERY can only be applied to SHORT discrepancies. " +
                    "Use WAIVED or PENDING_INVESTIGATION for OVER discrepancies.");
        }

        shift.setDiscrepancyResolution(request.resolutionAction());
        shift.setDiscrepancyResolutionNote(request.resolutionNote() != null ? request.resolutionNote().trim() : null);
        shift.setDiscrepancyResolvedById(currentUser.getId());
        shift.setDiscrepancyResolvedAt(OffsetDateTime.now());
        shift.setStatus(ShiftStatus.CLOSED_DISCREPANCY_RESOLVED);

        // Record the physically received cash so balance sheets can include it
        // as a separate inflow on the day the recovery was made.
        if (request.resolutionAction() == DiscrepancyResolution.CASH_RECOVERY) {
            shift.setCashRecoveryAmount(shift.getDiscrepancyAmount());
        }
        shift = shiftRepository.save(shift);

        log.info("Discrepancy resolved: shiftId={}, action={}, resolvedBy={}",
                shiftId, request.resolutionAction(), currentUser.getId());

        return shiftReadModelService.toResponseWithLookups(shift);
    }

    /**
     * Voids a credit entry on an OPEN shift.
     */
    @Transactional
    public ShiftResponse voidCreditEntry(Long pumpId, Long shiftId, Long entryId, String voidReason, User currentUser) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (!shift.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift does not belong to pump " + pumpId);
        }

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

    @Transactional(readOnly = true)
    public List<ShiftResponse> getActiveShifts(Long pumpId) {
        return shiftRepository.findActiveShiftsByPump(pumpId).stream()
                .map(shiftReadModelService::toResponseWithLookups)
                .toList();
    }

    @Transactional(readOnly = true)
    public Page<ShiftResponse> getShiftHistory(Long pumpId, Pageable pageable) {
        return shiftRepository.findByPumpIdOrderByActualStartTimeDesc(pumpId, pageable)
                .map(shiftReadModelService::toResponseWithLookups);
    }

    @Transactional(readOnly = true)
    public ShiftResponse getShiftById(Long shiftId) {
        Shift shift = shiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));
        return shiftReadModelService.toResponseWithLookups(shift);
    }

    /**
     * Backfills a historical closed shift for a pump.
     *
     * Intended for Admin/Owner use when a pump is onboarded and the owner wants to
     * enter past shift data. The resulting shift is stored with status
     * CLOSED_BALANCED or CLOSED_DISCREPANCY_PENDING and isBackfilled=true.
     *
     * Rules enforced:
     * - shiftDate must be within the last 365 days and not today or future
     * - shiftDefinitionId must have been effective on shiftDate for this pump
     * - closingReading >= openingReading for every nozzle (rollover not supported for backfill)
     * - No existing shift for the same nozzle + shiftDate + shiftDefinitionId (duplicate guard)
     * - A historical fuel price must exist for each fuel type on shiftDate
     * - Inventory lots must exist and have sufficient stock (user must record deliveries first)
     * - nozzle.lastReading is NOT updated — historical data must not pollute current meter state
     */
    @Transactional
    public ShiftResponse backfillShift(Long pumpId, BackfillShiftRequest request, User currentUser) {
        // ── 1. Validate shiftDate ─────────────────────────────────────────────
        LocalDate shiftDate = request.getShiftDate();
        LocalDate today = LocalDate.now();
        LocalDate oneYearAgo = today.minusDays(365);

        if (!shiftDate.isBefore(today)) {
            throw new BusinessException(
                    "Backfill shift date must be before today. Use the normal shift flow for today's shifts.");
        }
        if (shiftDate.isBefore(oneYearAgo)) {
            throw new BusinessException(
                    "Backfill is only supported for shifts within the last 365 days. " +
                    "The provided date " + shiftDate + " is too far in the past.");
        }

        // ── 2. Validate shift definition belongs to pump and was effective on shiftDate ──
        PumpShiftDefinition shiftDef = shiftDefinitionRepository.findById(request.getShiftDefinitionId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Shift definition not found: " + request.getShiftDefinitionId()));

        if (!shiftDef.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift definition does not belong to this pump.");
        }
        // Note: we intentionally do NOT enforce that shiftDef was active on shiftDate.
        // For backfill, the admin may use the current (or nearest) definition as a proxy
        // when the exact historical definition is no longer active. The definition is only
        // used for the shift window label and time range — it does not affect price lookup
        // or inventory deduction, both of which use shiftDate directly.

        // ── 2b. Persist any fuelRateOverrides before the price lookup ─────────
        ZoneId ist = ZoneId.of("Asia/Kolkata");
        OffsetDateTime priceAsOf = shiftDate.plusDays(1).atStartOfDay(ist).toOffsetDateTime();

        if (request.getFuelRateOverrides() != null && !request.getFuelRateOverrides().isEmpty()) {
            OffsetDateTime rateEffectiveFrom = shiftDate.atStartOfDay(ist).toOffsetDateTime();
            for (Map.Entry<String, BigDecimal> entry : request.getFuelRateOverrides().entrySet()) {
                FuelType fuelType;
                try {
                    fuelType = FuelType.valueOf(entry.getKey());
                } catch (IllegalArgumentException e) {
                    throw new BusinessException("Invalid fuel type in fuelRateOverrides: " + entry.getKey());
                }
                BigDecimal rate = entry.getValue();
                if (rate == null || rate.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new BusinessException(
                            "Fuel rate for " + fuelType + " must be greater than zero.");
                }
                // Only save if no price already exists on or before shiftDate to avoid polluting history.
                boolean priceExists = fuelPriceRepository
                        .findFirstByPumpIdAndFuelTypeAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                                pumpId, fuelType, priceAsOf)
                        .isPresent();
                if (!priceExists) {
                    GlobalFuelPrice historicalRate = GlobalFuelPrice.builder()
                            .pumpId(pumpId)
                            .fuelType(fuelType)
                            .pricePerUnit(rate)
                            .effectiveFrom(rateEffectiveFrom)
                            .setByUserId(currentUser.getId())
                            .build();
                    fuelPriceRepository.save(historicalRate);
                    log.info("Backfill: saved historical fuel rate pump={}, fuelType={}, rate={}, effectiveFrom={}",
                            pumpId, fuelType, rate, rateEffectiveFrom);
                }
            }
        }

        // ── 3. Validate DU belongs to pump ───────────────────────────────────
        DispensaryUnit du = duRepository.findById(request.getDuId())
                .orElseThrow(() -> new ResourceNotFoundException("Dispensary Unit not found: " + request.getDuId()));
        if (!du.getPumpId().equals(pumpId)) {
            throw new BusinessException("Dispensary Unit does not belong to this pump.");
        }

        // ── 4. Validate operator exists ───────────────────────────────────────
        User operator = userRepository.findById(request.getOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found: " + request.getOperatorId()));

        // ── 5. Validate nozzles + readings, resolve price and tankId per nozzle ──
        // (ist and priceAsOf are already defined above in step 2b)
        List<BackfillShiftRequest.NozzleReadingRequest> nozzleReadings = request.getNozzleReadings();
        List<Nozzle> nozzles = new ArrayList<>();
        Map<FuelType, BigDecimal> priceCache = new HashMap<>();

        for (BackfillShiftRequest.NozzleReadingRequest nr : nozzleReadings) {
            Nozzle nozzle = nozzleRepository.findById(nr.nozzleId())
                    .orElseThrow(() -> new ResourceNotFoundException("Nozzle not found: " + nr.nozzleId()));

            if (!nozzle.getDuId().equals(du.getId())) {
                throw new BusinessException(
                        "Nozzle #" + nozzle.getNozzleNumber() + " does not belong to DU '" + du.getName() + "'.");
            }

            if (nr.closingReading().compareTo(nr.openingReading()) < 0) {
                throw new BusinessException(
                        "Closing reading (" + nr.closingReading() + ") cannot be less than opening reading (" +
                        nr.openingReading() + ") for nozzle #" + nozzle.getNozzleNumber() +
                        ". Meter rollover is not supported for backfilled shifts.");
            }

            // Duplicate guard — one shift per nozzle per shift window per day
            if (shiftRepository.countForNozzleDateAndDefinition(nozzle.getId(), shiftDate, shiftDef.getId()) > 0) {
                throw new BusinessException(
                        "A shift for nozzle #" + nozzle.getNozzleNumber() +
                        " on " + shiftDate + " under '" + shiftDef.getName() + "' already exists.");
            }

            // Verify historical price exists; cache it to avoid a second lookup during persist
            if (!priceCache.containsKey(nozzle.getFuelType())) {
                BigDecimal price = fuelPriceRepository
                        .findFirstByPumpIdAndFuelTypeAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                                pumpId, nozzle.getFuelType(), priceAsOf)
                        .map(GlobalFuelPrice::getPricePerUnit)
                        .orElseThrow(() -> new BusinessException(
                                "No fuel price found for " + nozzle.getFuelType() + " on or before " + shiftDate +
                                ". Please set the historical price before backfilling this shift."));
                priceCache.put(nozzle.getFuelType(), price);
            }

            nozzles.add(nozzle);
        }

        // Build a lookup map once so subsequent loops are O(1) instead of O(n) per iteration
        Map<Long, Nozzle> nozzleById = nozzles.stream().collect(Collectors.toMap(Nozzle::getId, n -> n));

        // ── 5c. Pre-validate fuel stock availability (historically accurate) ──
        // Accumulate unitsSold per inventory scope, then check available stock
        // filtered by deliveryDate ≤ shiftDate. This fails fast — before any shift
        // entity is persisted — and prevents using stock that arrived AFTER shiftDate.
        {
            Map<String, BigDecimal> unitsSoldPerScope = new LinkedHashMap<>();
            Map<String, String>     scopeLabel        = new LinkedHashMap<>();

            for (BackfillShiftRequest.NozzleReadingRequest nr : nozzleReadings) {
                BigDecimal unitsSold = nr.closingReading().subtract(nr.openingReading());
                if (unitsSold.compareTo(ZERO) <= 0) continue;

                Nozzle nozzle = nozzleById.get(nr.nozzleId());

                String scopeKey;
                if (nozzle.getTankId() != null) {
                    scopeKey = "tank:" + nozzle.getTankId();
                    scopeLabel.put(scopeKey, nozzle.getFuelType().name());
                } else {
                    scopeKey = "fuel:" + nozzle.getFuelType();
                    scopeLabel.put(scopeKey, nozzle.getFuelType().name());
                }
                unitsSoldPerScope.merge(scopeKey, unitsSold, BigDecimal::add);
            }

            for (Map.Entry<String, BigDecimal> entry : unitsSoldPerScope.entrySet()) {
                String     scopeKey = entry.getKey();
                BigDecimal needed   = entry.getValue();

                BigDecimal available;
                if (scopeKey.startsWith("tank:")) {
                    Long tankId = Long.parseLong(scopeKey.substring(5));
                    available = inventoryLotRepository.findActiveLotsByTankAvailableAsOf(tankId, priceAsOf)
                            .stream().map(InventoryLot::getRemainingQuantity).reduce(ZERO, BigDecimal::add);
                } else {
                    FuelType ft = FuelType.valueOf(scopeKey.substring(5));
                    available = inventoryLotRepository.findActiveLotsByPumpAndFuelTypeAvailableAsOf(pumpId, ft, priceAsOf)
                            .stream().map(InventoryLot::getRemainingQuantity).reduce(ZERO, BigDecimal::add);
                }

                if (needed.compareTo(available) > 0) {
                    String label = scopeLabel.getOrDefault(scopeKey, scopeKey);
                    throw new BusinessException(
                            "Insufficient " + label + " stock for backfill on " + shiftDate +
                            ": shift needs " + needed.setScale(2, RoundingMode.HALF_UP) +
                            " L but only " + available.setScale(2, RoundingMode.HALF_UP) +
                            " L was delivered on or before " + shiftDate +
                            ". Record a tanker delivery for this date before backfilling this shift.");
                }
            }
        }

        // ── 6. Derive actualStartTime and actualEndTime from the definition ───
        // End time stored is exclusive (1 min less than displayed). Display end = endTime + 1 min.
        LocalTime startTime = shiftDef.getStartTime();
        LocalTime endTimeDisplay = shiftDef.getEndTime().plusMinutes(1);

        OffsetDateTime actualStartTime = LocalDateTime.of(shiftDate, startTime).atZone(ist).toOffsetDateTime();
        OffsetDateTime actualEndTime = shiftDef.isCrossesMidnight()
                ? LocalDateTime.of(shiftDate.plusDays(1), endTimeDisplay).atZone(ist).toOffsetDateTime()
                : LocalDateTime.of(shiftDate, endTimeDisplay).atZone(ist).toOffsetDateTime();

        // ── 7. Persist the shift entity ───────────────────────────────────────
        Shift shift = Shift.builder()
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
                .actualEndTime(actualEndTime)
                .cashCollected(request.getCashCollected())
                .upiCollected(request.getUpiCollected())
                .cardCollected(request.getCardCollected())
                .fleetCardCollected(request.getFleetCardCollected())
                .creditTotal(request.getCreditTotal())
                .discrepancyReason(request.getDiscrepancyReason())
                .isOverdueFlag(false)
                .isBackfilled(true)
                // Status and financials are set after inventory deduction below
                .status(ShiftStatus.CLOSED_BALANCED)
                .build();

        shift = shiftRepository.save(shift);
        final Long shiftId = shift.getId();

        // ── 8. Persist ShiftNozzle join records (batch insert) ───────────────
        shiftNozzleRepository.saveAll(nozzles.stream()
                .map(nozzle -> ShiftNozzle.builder()
                        .shiftId(shiftId)
                        .nozzleId(nozzle.getId())
                        .build())
                .toList());

        // ── 9. Persist fuel readings + FIFO deduction per nozzle ─────────────
        BigDecimal totalAmountDue = ZERO;
        List<ShiftFuelReading> backfillReadings = new ArrayList<>();

        for (BackfillShiftRequest.NozzleReadingRequest nr : nozzleReadings) {
            Nozzle nozzle = nozzleById.get(nr.nozzleId());

            BigDecimal historicalPrice = priceCache.get(nozzle.getFuelType());

            BigDecimal unitsSold = nr.closingReading().subtract(nr.openingReading())
                    .setScale(3, RoundingMode.HALF_UP);

            backfillReadings.add(ShiftFuelReading.builder()
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
                // Use backfill-specific deduction (date-filtered lots, stock already validated in 5c)
                backfillDeductFromInventory(shiftId, pumpId, nozzle.getFuelType(), nozzle.getTankId(), unitsSold, priceAsOf);
                totalAmountDue = totalAmountDue.add(unitsSold.multiply(historicalPrice));
            }
        }
        fuelReadingRepository.saveAll(backfillReadings);

        // creditTotal is NOT added to totalAmountDue — credit sales are already captured in
        // totalAmountDue via the meter-reading calculation (unitsSold × historicalPrice) above.
        // Adding creditTotal here would double-count it and inflate expectedRevenue, creating
        // phantom discrepancies on every backfilled shift that includes credit sales.
        totalAmountDue = totalAmountDue.setScale(2, RoundingMode.HALF_UP);

        // ── 10. Compute discrepancy and determine final status ─────────────────
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
            discrepancyType = totalCollected.compareTo(totalAmountDue) < 0
                    ? DiscrepancyType.SHORT : DiscrepancyType.OVER;
            finalStatus = ShiftStatus.CLOSED_DISCREPANCY_PENDING;

            if (request.getDiscrepancyReason() == null || request.getDiscrepancyReason().isBlank()) {
                throw new BusinessException(
                        "A discrepancy reason is required when the collected amount does not match the expected amount. " +
                        "Expected: ₹" + totalAmountDue + ", Collected: ₹" + totalCollected + ".");
            }
        }

        shift.setTotalAmountDue(totalAmountDue);
        shift.setDiscrepancyAmount(discrepancyAmount.compareTo(ZERO) > 0 ? discrepancyAmount : null);
        shift.setDiscrepancyType(discrepancyType);
        shift.setStatus(finalStatus);
        shift = shiftRepository.save(shift);

        // ── 11. Persist credit entries ────────────────────────────────────────
        if (request.getCreditEntries() != null && !request.getCreditEntries().isEmpty()) {
            lifecycleSupportService.persistCloseCreditEntries(shiftId, pumpId, request.getCreditEntries());
        }

        // ── 12. Auto-settle digital payments from this backfilled shift ───────
        // Backfilled shifts represent historical data — the money has already
        // arrived in the bank. Auto-creating settlement records prevents these
        // amounts from inflating the live wallet pending balance.
        autoSettleBackfilledDigitalPayments(
                pumpId, shiftId, shiftDate,
                request.getUpiCollected(),
                request.getCardCollected(),
                request.getFleetCardCollected(),
                currentUser);

        log.info("Shift {} backfilled by {}: du={}, operator={}, date={}, definition='{}', totalDue={}, status={}",
                shiftId, currentUser.getId(), du.getId(), operator.getId(),
                shiftDate, shiftDef.getName(), totalAmountDue, finalStatus);

        List<ShiftCreditEntry> savedEntries = creditEntryRepository.findByShiftId(shiftId);
        List<ShiftFuelReading> finalReadings = fuelReadingRepository.findByShiftId(shiftId);
        return shiftReadModelService.toResponse(shift, du, nozzles, operator, currentUser.getFullName(), finalReadings, savedEntries);
    }

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Called when no ACTIVE inventory lots exist for a tank that shows non-zero current_stock.
     * This happens when a tank was seeded directly in the DB or had stock set via DIP check
     * without a corresponding delivery record. Creates a single synthetic lot equal to
     * current_stock (costPrice=0 since the purchase cost is unknown) so shift-close can proceed.
     */
    private List<InventoryLot> healMissingLots(Long tankId, FuelType fuelType, Long pumpId) {
        return tankRepository.findById(tankId)
                .filter(tank -> tank.getCurrentStock().compareTo(ZERO) > 0)
                .map(tank -> {
                    BigDecimal stock = tank.getCurrentStock().setScale(3, RoundingMode.HALF_UP);
                    // Use the most recent real delivery's cost price so COGS in the balance
                    // sheet is a reasonable approximation rather than ₹0.
                    BigDecimal costPrice = inventoryLotRepository
                            .findFirstByPumpIdAndFuelTypeAndIsDipAdjustmentFalseOrderByDeliveryDateDesc(pumpId, fuelType)
                            .map(InventoryLot::getCostPricePerUnit)
                            .orElse(BigDecimal.ZERO);
                    InventoryLot lot = inventoryLotRepository.save(InventoryLot.builder()
                            .tankerDeliveryId(null)
                            .tankId(tankId)
                            .fuelType(fuelType)
                            .pumpId(pumpId)
                            .originalQuantity(stock)
                            .remainingQuantity(stock)
                            .costPricePerUnit(costPrice)
                            .deliveryDate(OffsetDateTime.now())
                            .isDipAdjustment(true)
                            .status(LotStatus.ACTIVE)
                            .build());
                    log.warn("Tank {} has {}L stock but no inventory lots — created synthetic lot (id={}, costPrice={}) to unblock shift close. " +
                             "Record a tanker delivery to enable proper COGS tracking.", tankId, stock, lot.getId(), costPrice);
                    return List.of(lot);
                })
                .orElse(List.of());
    }

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

        // No lots found but tank has stock — the tank was seeded or DIP-adjusted without a
        // corresponding delivery record. Auto-create a synthetic lot from current_stock so
        // the shift can close. COGS for this lot will be ₹0; record a delivery later to fix.
        if (lots.isEmpty() && tankId != null) {
            lots = healMissingLots(tankId, fuelType, pumpId);
        }

        BigDecimal totalAvailable = lots.stream()
                .map(InventoryLot::getRemainingQuantity)
                .reduce(ZERO, BigDecimal::add);

        if (unitsToDeduct.compareTo(totalAvailable) > 0) {
            throw new BusinessException(
                    "Insufficient fuel stock: shift recorded " + unitsToDeduct.setScale(2, RoundingMode.HALF_UP) +
                    " L sold but only " + totalAvailable.setScale(2, RoundingMode.HALF_UP) +
                    " L is available in inventory. Please verify the meter readings or record a tanker delivery first.");
        }

        // Pre-fetch all tanks referenced by the lots in one query
        Set<Long> tankIds = lots.stream()
                .map(InventoryLot::getTankId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, UndergroundTank> tanksById = tankRepository.findAllById(tankIds).stream()
                .collect(Collectors.toMap(UndergroundTank::getId, t -> t));

        List<InventoryLot> touchedLots = new ArrayList<>();
        List<LotConsumption> consumptions = new ArrayList<>();
        Map<Long, UndergroundTank> modifiedTanks = new HashMap<>();
        BigDecimal remaining = unitsToDeduct;

        for (InventoryLot lot : lots) {
            if (remaining.compareTo(ZERO) <= 0) break;

            BigDecimal consume = remaining.min(lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity().subtract(consume).setScale(3, RoundingMode.HALF_UP));

            if (lot.getRemainingQuantity().compareTo(ZERO) == 0) {
                lot.setStatus(LotStatus.EXHAUSTED);
            }
            touchedLots.add(lot);

            consumptions.add(LotConsumption.builder()
                    .lotId(lot.getId())
                    .sourceType(LotConsumptionSource.SHIFT_CLOSE)
                    .shiftId(shiftId)
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());

            UndergroundTank tank = tanksById.get(lot.getTankId());
            if (tank != null) {
                tank.setCurrentStock(tank.getCurrentStock().subtract(consume).setScale(3, RoundingMode.HALF_UP));
                modifiedTanks.put(lot.getTankId(), tank);
            }

            remaining = remaining.subtract(consume);
        }

        inventoryLotRepository.saveAll(touchedLots);
        lotConsumptionRepository.saveAll(consumptions);
        tankRepository.saveAll(modifiedTanks.values());
    }

    /**
     * FIFO deduction for backfilled shifts — historically accurate.
     *
     * Identical to deductFromInventory() but scoped to lots whose deliveryDate ≤ asOf,
     * preventing the system from drawing down stock from tankers delivered AFTER the
     * historical shift date. Stock availability is already pre-validated in step 5c,
     * so no further BusinessException is thrown here.
     */
    /**
     * Auto-creates PaymentSettlement records for UPI, Card, and Fleet Card amounts
     * from a backfilled shift. Since backfilled shifts represent past data, these
     * payments are assumed to have already been received in the bank on the shift date.
     * This keeps the wallet pending balance accurate — only genuinely unsettled
     * live-shift digital payments remain outstanding.
     */
    private void autoSettleBackfilledDigitalPayments(
            Long pumpId, Long shiftId, LocalDate shiftDate,
            BigDecimal upiCollected, BigDecimal cardCollected, BigDecimal fleetCardCollected,
            User actor) {

        record TypeAmount(SettlementPaymentType type, BigDecimal amount) {}
        List<TypeAmount> entries = List.of(
                new TypeAmount(SettlementPaymentType.UPI,        upiCollected),
                new TypeAmount(SettlementPaymentType.CARD,       cardCollected),
                new TypeAmount(SettlementPaymentType.FLEET_CARD, fleetCardCollected)
        );

        for (TypeAmount entry : entries) {
            BigDecimal amt = entry.amount();
            if (amt == null || amt.compareTo(ZERO) <= 0) continue;

            PaymentSettlement settlement = PaymentSettlement.builder()
                    .pumpId(pumpId)
                    .paymentType(entry.type())
                    .settlementDate(shiftDate)
                    .amountReceived(amt.setScale(2, RoundingMode.HALF_UP))
                    .notes("Auto-settled from backfilled shift #" + shiftId)
                    .recordedByUserId(actor.getId())
                    .build();
            settlementRepository.save(settlement);

            log.info("Auto-settled backfilled {} payment: pump={}, shiftId={}, amount={}, date={}",
                    entry.type(), pumpId, shiftId, amt, shiftDate);
        }
    }

    private void backfillDeductFromInventory(Long shiftId, Long pumpId, FuelType fuelType,
                                             Long tankId, BigDecimal unitsToDeduct, OffsetDateTime asOf) {
        List<InventoryLot> lots = tankId != null
                ? inventoryLotRepository.findActiveLotsByTankAvailableAsOf(tankId, asOf)
                : inventoryLotRepository.findActiveLotsByPumpAndFuelTypeAvailableAsOf(pumpId, fuelType, asOf);

        Set<Long> tankIds = lots.stream()
                .map(InventoryLot::getTankId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, UndergroundTank> tanksById = tankRepository.findAllById(tankIds).stream()
                .collect(Collectors.toMap(UndergroundTank::getId, t -> t));

        List<InventoryLot> touchedLots = new ArrayList<>();
        List<LotConsumption> consumptions = new ArrayList<>();
        Map<Long, UndergroundTank> modifiedTanks = new HashMap<>();
        BigDecimal remaining = unitsToDeduct;

        for (InventoryLot lot : lots) {
            if (remaining.compareTo(ZERO) <= 0) break;

            BigDecimal consume = remaining.min(lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity().subtract(consume).setScale(3, RoundingMode.HALF_UP));

            if (lot.getRemainingQuantity().compareTo(ZERO) == 0) {
                lot.setStatus(LotStatus.EXHAUSTED);
            }
            touchedLots.add(lot);

            consumptions.add(LotConsumption.builder()
                    .lotId(lot.getId())
                    .sourceType(LotConsumptionSource.SHIFT_CLOSE)
                    .shiftId(shiftId)
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());

            UndergroundTank tank = tanksById.get(lot.getTankId());
            if (tank != null) {
                tank.setCurrentStock(tank.getCurrentStock().subtract(consume).setScale(3, RoundingMode.HALF_UP));
                modifiedTanks.put(lot.getTankId(), tank);
            }

            remaining = remaining.subtract(consume);
        }

        inventoryLotRepository.saveAll(touchedLots);
        lotConsumptionRepository.saveAll(consumptions);
        tankRepository.saveAll(modifiedTanks.values());
    }
}
