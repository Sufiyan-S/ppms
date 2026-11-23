package com.ppms.shift;

import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.time.BusinessClock;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.time.DateRangeBounds;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.credit.CreditAccountPolicyService;
import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditInterestService;
import com.ppms.invoice.InvoicedSaleGuard;
import com.ppms.pump.CurrentShiftWindow;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.report.BalanceSheetStalenessService;
import com.ppms.report.StaleReasons;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import io.micrometer.core.instrument.Counter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
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
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final CreditAccountPolicyService creditAccountPolicyService;
    private final CreditInterestService creditInterestService;
    private final ShiftLifecycleSupportService lifecycleSupportService;
    private final ShiftReadModelService shiftReadModelService;
    private final com.ppms.planning.ShiftPlanningService shiftPlanningService;
    private final PumpLocationRepository pumpLocationRepository;
    private final Counter shiftOpenedCounter;
    private final Counter shiftClosedCounter;
    private final ActiveNozzleAssignmentRepository activeNozzleRepository;
    private final ShiftFuelDeductionService fuelDeductionService;
    private final BusinessClock businessClock;
    private final InvoicedSaleGuard invoicedSaleGuard;
    private final BalanceSheetStalenessService balanceSheetStalenessService;

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
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DISPENSARY_UNIT,
                        "Dispensary Unit not found: " + request.getDuId()));

        if (!du.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.DISPENSARY_UNIT, "Dispensary Unit not found");
        }

        lifecycleSupportService.rejectDuplicateNozzles(request.getNozzleIds());
        Map<Long, Nozzle> nozzleById = nozzleRepository.findAllById(request.getNozzleIds()).stream()
                .collect(Collectors.toMap(Nozzle::getId, Function.identity()));
        List<Nozzle> nozzles = request.getNozzleIds().stream()
                .map(id -> Optional.ofNullable(nozzleById.get(id))
                        .orElseThrow(() -> new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found: " + id)))
                .toList();

        User operator = lifecycleSupportService.findOperatorForPump(request.getOperatorId(), pumpId);

        CurrentShiftWindow window = lifecycleSupportService.validateShiftCanOpen(du, nozzles, operator);
        PumpShiftDefinition shiftDef = window.definition();

        OffsetDateTime now = businessClock.now();

        Shift shift = Shift.builder()
                .pumpId(pumpId)
                .duId(du.getId())
                .operatorId(operator.getId())
                .openedByUserId(currentUser.getId())
                .shiftDefinitionId(shiftDef.getId())
                .shiftName(shiftDef.getName())
                .isNightShift(shiftDef.isNightShift())
                .shiftDate(window.shiftDate())
                .actualStartTime(now)
                .status(ShiftStatus.OPEN)
                .isOverdueFlag(false)
                .build();

        return startShift(shift, du, nozzles, operator, currentUser);
    }

    /**
     * Opens the incoming operator's shift after a handover closed the outgoing one: same nozzles, shift window and
     * business date, starting when the outgoing shift ended, from the readings it closed with.
     */
    @Transactional
    public ShiftResponse openShiftForHandover(Shift closedShift, User incomingOperator, User currentUser) {
        List<Nozzle> nozzles = nozzleRepository.findAllById(shiftNozzleRepository.findNozzleIdsByShiftId(closedShift.getId()));
        DispensaryUnit du = duRepository.findById(closedShift.getDuId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DISPENSARY_UNIT,
                        "Dispensary Unit not found: " + closedShift.getDuId()));
        nozzles.forEach(lifecycleSupportService::rejectExpiredCalibration);
        lifecycleSupportService.rejectNightShiftWithoutConsent(
                Boolean.TRUE.equals(closedShift.getIsNightShift()), incomingOperator);

        Shift shift = Shift.builder()
                .pumpId(closedShift.getPumpId())
                .duId(closedShift.getDuId())
                .operatorId(incomingOperator.getId())
                .openedByUserId(currentUser.getId())
                .shiftDefinitionId(closedShift.getShiftDefinitionId())
                .shiftName(closedShift.getShiftName())
                .isNightShift(closedShift.getIsNightShift())
                .shiftDate(closedShift.getShiftDate())
                .actualStartTime(closedShift.getActualEndTime())
                .status(ShiftStatus.OPEN)
                .isOverdueFlag(false)
                .build();

        return startShift(shift, du, nozzles, incomingOperator, currentUser);
    }

    private ShiftResponse startShift(Shift shift, DispensaryUnit du, List<Nozzle> nozzles, User operator, User currentUser) {
        Long pumpId = shift.getPumpId();
        shift = shiftRepository.save(shift);
        final Long shiftId = shift.getId();

        // Persist nozzle assignments in the join table (batch insert)
        shiftNozzleRepository.saveAll(nozzles.stream()
                .map(nozzle -> ShiftNozzle.builder()
                        .shiftId(shiftId)
                        .nozzleId(nozzle.getId())
                        .build())
                .toList());

        // DB-level nozzle exclusivity guard: a nozzle already assigned means a concurrent request
        // raced past the application-level check in validateShiftCanOpen.
        for (Nozzle nozzle : nozzles) {
            if (activeNozzleRepository.assignIfFree(nozzle.getId(), shiftId) == 0) {
                throw new BusinessException(ErrorCodes.NOZZLES_ALREADY_IN_USE, Map.of(),
                        "One or more selected nozzles are already in use on an active shift. " +
                        "Please refresh the page and try again.");
            }
        }

        // Create opening readings — one per nozzle (each nozzle = one fuel type)
        lifecycleSupportService.createOpeningReadings(shiftId, pumpId, nozzles);

        log.info("Shift {} opened: du={}, nozzles={}, operator={}, openedBy={}",
                shiftId, du.getId(), nozzles.stream().map(Nozzle::getId).toList(), operator.getId(), currentUser.getId());
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
        Shift shift = findShiftForUpdate(pumpId, shiftId);

        if (!shift.getStatus().isOpen()) {
            throw new BusinessException(ErrorCodes.SHIFT_NOT_OPEN,
                    Map.of("statusCode", shift.getStatus().name()),
                    "Shift is not open. Current status: " + shift.getStatus());
        }

        List<Long> nozzleIds = shiftNozzleRepository.findNozzleIdsByShiftId(shiftId);
        List<Nozzle> nozzles = nozzleRepository.findAllById(nozzleIds);
        Map<Long, Nozzle> nozzleById = nozzles.stream()
                .collect(Collectors.toMap(Nozzle::getId, Function.identity()));

        Map<Long, BigDecimal> maxMeterByNozzleId = nozzles.stream()
                .collect(Collectors.toMap(Nozzle::getId, Nozzle::getMaxMeterValue));

        List<ShiftFuelReading> readings = fuelReadingRepository.findByShiftId(shiftId);
        ShiftLifecycleSupportService.ClosingSummary closingSummary =
                lifecycleSupportService.processClosingReadings(shiftId, maxMeterByNozzleId, request, readings);
        List<CloseShiftRequest.CreditEntryRequest> creditEntries =
                lifecycleSupportService.validateCloseCreditEntries(shiftId, request.getCreditTotal(), request.getCreditEntries(),
                        request.getReplacedCreditEntryIds());

        deductSoldFuel(shift, readings);

        applyClosingValues(shift, request, closingSummary, currentUser);
        shift = shiftRepository.save(shift);

        activeNozzleRepository.deleteByShiftId(shiftId);
        balanceSheetStalenessService.markSheetsOfShiftStale(shift.getPumpId(), shift.getShiftDate(),
                shift.getShiftDefinitionId(), StaleReasons.shiftClosed(shiftId));

        log.info("Shift {} closed: totalDue={}, totalCollected={}, discrepancy={}, status={}",
                shiftId, closingSummary.getTotalDue(), closingSummary.getTotalCollected(),
                closingSummary.getDiscrepancyAmount(), closingSummary.getStatus());
        shiftClosedCounter.increment();

        rememberLastReadings(readings, nozzleById);

        lifecycleSupportService.createCashCollectionEvent(shift, currentUser, nozzles);
        lifecycleSupportService.voidReplacedCreditEntries(request.getReplacedCreditEntryIds(), currentUser);
        lifecycleSupportService.persistCloseCreditEntries(shift.getId(), shift.getPumpId(), businessClock.today(), creditEntries);

        User operator = userRepository.findById(shift.getOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.OPERATOR, "Operator not found"));
        DispensaryUnit du = duRepository.findById(shift.getDuId()).orElse(null);
        List<ShiftCreditEntry> savedEntries = creditEntryRepository.findByShiftId(shift.getId());
        List<ShiftFuelReading> finalReadings = fuelReadingRepository.findByShiftId(shift.getId());
        return shiftReadModelService.toResponse(shift, du, nozzles, operator, currentUser.getFullName(), finalReadings, savedEntries);
    }

    private void deductSoldFuel(Shift shift, List<ShiftFuelReading> readings) {
        fuelDeductionService.lockTanksForDeduction(shift.getPumpId(),
                readings.stream().map(ShiftFuelReading::getTankId).filter(Objects::nonNull).toList(),
                readings.stream().filter(reading -> reading.getTankId() == null).map(ShiftFuelReading::getFuelType).toList());
        for (ShiftFuelReading reading : readings) {
            if (reading.getUnitsSold() != null && reading.getUnitsSold().compareTo(ZERO) > 0) {
                fuelDeductionService.deductForShiftClose(shift.getId(), shift.getPumpId(), reading.getFuelType(),
                        reading.getTankId(), reading.getUnitsSold(), shift.getActualStartTime());
            }
        }
    }

    private void applyClosingValues(Shift shift, CloseShiftRequest request,
                                    ShiftLifecycleSupportService.ClosingSummary closingSummary, User closedBy) {
        // A late close is recorded at the scheduled end, so DAY balance-sheet windows stay aligned
        // with the shift definition; an early or on-time close keeps the real time.
        OffsetDateTime scheduledEnd = shiftReadModelService.computeScheduledEndTime(shift);
        OffsetDateTime closeTime = businessClock.now();
        shift.setActualEndTime(scheduledEnd != null && closeTime.isAfter(scheduledEnd) ? scheduledEnd : closeTime);
        shift.setClosedByUserId(closedBy.getId());
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
    }

    // The next shift on a nozzle pre-fills its opening reading from here.
    private void rememberLastReadings(List<ShiftFuelReading> readings, Map<Long, Nozzle> nozzleById) {
        List<Nozzle> updatedNozzles = new ArrayList<>();
        for (ShiftFuelReading reading : readings) {
            Nozzle nozzle = nozzleById.get(reading.getNozzleId());
            if (nozzle != null) {
                nozzle.setLastReading(reading.getEndReading());
                updatedNozzles.add(nozzle);
            }
        }
        nozzleRepository.saveAll(updatedNozzles);
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

    private Shift findShiftForUpdate(Long pumpId, Long shiftId) {
        return shiftRepository.findByIdAndPumpIdForUpdate(shiftId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT, "Shift not found"));
    }

    /**
     * Adds a credit entry to an open shift mid-shift.
     */
    @Transactional
    public ShiftResponse addCreditEntry(Long pumpId, Long shiftId, AddCreditEntryRequest request, User currentUser) {
        Shift shift = findShiftForUpdate(pumpId, shiftId);

        if (!shift.getStatus().isOpen()) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRY_SHIFT_NOT_OPEN,
                    Map.of(),
                    "Cannot add credit entries to a shift that is not open.");
        }

        if (currentUser.getRole() == UserRole.OPERATOR
                && !currentUser.getId().equals(shift.getOperatorId())) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRY_NOT_OWN_SHIFT,
                    Map.of(),
                    "Operators can only add credit entries to their own active shift.");
        }

        CreditClient matchedClient = creditAccountPolicyService.requireClientForCreditEntry(
                shift.getPumpId(), request.getClientId(), request.getClientName());
        creditAccountPolicyService.validateCreditSaleAllowed(shift.getPumpId(), matchedClient, request.getAmount());

        creditEntryRepository.save(ShiftCreditEntry.builder()
                .shiftId(shiftId)
                .clientId(matchedClient.getId())
                .clientName(request.getClientName().trim())
                .billNo(request.getBillNo() != null ? request.getBillNo().trim() : null)
                .amount(request.getAmount().setScale(2, RoundingMode.HALF_UP))
                .saleDate(businessClock.today())
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
     * Resolves a pending discrepancy, or with PENDING_INVESTIGATION only marks it as under investigation.
     */
    @Transactional
    public ShiftResponse resolveDiscrepancy(Long pumpId, Long shiftId, ResolveDiscrepancyRequest request, User currentUser) {
        Shift shift = findShiftForUpdate(pumpId, shiftId);

        boolean isPending         = shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING;
        boolean isPendingApproval = shift.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING_APPROVAL;
        if (!isPending && !isPendingApproval) {
            throw new BusinessException(ErrorCodes.NO_PENDING_DISCREPANCY,
                    Map.of("statusCode", shift.getStatus().name()),
                    "Shift has no pending discrepancy to resolve. Current status: " + shift.getStatus());
        }

        if (isPendingApproval) {
            UserRole role = currentUser.getRole();
            if (role != UserRole.OWNER && role != UserRole.ADMIN && role != UserRole.SUPER_ADMIN) {
                throw new BusinessException(ErrorCodes.ESCALATED_DISCREPANCY_NEEDS_OWNER, Map.of(),
                        "This discrepancy exceeds the escalation threshold and requires Owner or Admin approval. " +
                        "Managers cannot resolve escalated discrepancies.");
            }
        }

        if (request.resolutionAction() == DiscrepancyResolution.PENDING_INVESTIGATION) {
            return startInvestigation(shift, request.resolutionNote(), currentUser);
        }

        if (request.resolutionAction() == DiscrepancyResolution.WAIVED
                && (request.resolutionNote() == null || request.resolutionNote().isBlank())) {
            throw new BusinessException(ErrorCodes.WAIVER_REASON_REQUIRED, Map.of(),
                    "A mandatory reason is required when waiving a discrepancy (Business Rule 19).");
        }

        // CASH_RECOVERY only makes sense for SHORT discrepancies — the operator
        // physically returns the cash they failed to hand in. An OVER discrepancy
        // means the operator handed in excess money; there is nothing to recover.
        if (request.resolutionAction() == DiscrepancyResolution.CASH_RECOVERY
                && shift.getDiscrepancyType() != DiscrepancyType.SHORT) {
            throw new BusinessException(ErrorCodes.CASH_RECOVERY_ONLY_FOR_SHORT, Map.of(),
                    "CASH_RECOVERY can only be applied to SHORT discrepancies. " +
                    "Use WAIVED or PENDING_INVESTIGATION for OVER discrepancies.");
        }

        if (request.resolutionAction() == DiscrepancyResolution.SALARY_DEDUCTION
                && shift.getDiscrepancyType() != DiscrepancyType.SHORT) {
            throw new BusinessException(ErrorCodes.SALARY_DEDUCTION_ONLY_FOR_SHORT, Map.of(),
                    "SALARY_DEDUCTION can only be applied to SHORT discrepancies. " +
                    "Use WAIVED or PENDING_INVESTIGATION for OVER discrepancies.");
        }

        shift.setDiscrepancyResolution(request.resolutionAction());
        shift.setDiscrepancyResolutionNote(request.resolutionNote() != null ? request.resolutionNote().trim() : null);
        shift.setDiscrepancyResolvedById(currentUser.getId());
        shift.setDiscrepancyResolvedAt(businessClock.now());
        shift.setStatus(ShiftStatus.CLOSED_DISCREPANCY_RESOLVED);

        // Record the physically received cash so balance sheets can include it
        // as a separate inflow on the day the recovery was made.
        if (request.resolutionAction() == DiscrepancyResolution.CASH_RECOVERY) {
            shift.setCashRecoveryAmount(shift.getDiscrepancyAmount());
        }
        shift = shiftRepository.save(shift);
        if (request.resolutionAction() == DiscrepancyResolution.CASH_RECOVERY) {
            lifecycleSupportService.createCashRecoveryEvent(shift, currentUser);
            balanceSheetStalenessService.markDaySheetsStale(shift.getPumpId(), List.of(businessClock.today()),
                    StaleReasons.cashRecovered(shift.getId()));
        }

        log.info("Discrepancy resolved: shiftId={}, action={}, resolvedBy={}",
                shiftId, request.resolutionAction(), currentUser.getId());

        return shiftReadModelService.toResponseWithLookups(shift);
    }

    /** Records who is investigating and why; the shift stays pending until a final action is taken. */
    private ShiftResponse startInvestigation(Shift shift, String note, User currentUser) {
        if (note == null || note.isBlank()) {
            throw new BusinessException(ErrorCodes.INVESTIGATION_NOTE_REQUIRED, Map.of(),
                    "A note is required when putting a discrepancy under investigation.");
        }
        shift.setInvestigationNote(note.trim());
        shift.setInvestigationStartedById(currentUser.getId());
        shift.setInvestigationStartedAt(businessClock.now());
        shift = shiftRepository.save(shift);

        log.info("Discrepancy put under investigation: shiftId={}, status={}, by={}",
                shift.getId(), shift.getStatus(), currentUser.getId());

        return shiftReadModelService.toResponseWithLookups(shift);
    }

    /**
     * Voids a credit entry on an OPEN shift.
     */
    @Transactional
    public ShiftResponse voidCreditEntry(Long pumpId, Long shiftId, Long entryId, String voidReason, User currentUser) {
        Shift shift = findShiftForUpdate(pumpId, shiftId);

        if (!shift.getStatus().isOpen()) {
            throw new BusinessException(ErrorCodes.CREDIT_VOID_SHIFT_NOT_OPEN, Map.of(),
                    "Credit entries can only be voided while the shift is open (Business Rule 7).");
        }

        if (voidReason == null || voidReason.isBlank()) {
            throw new BusinessException(ErrorCodes.VOID_REASON_REQUIRED,
                    Map.of(),
                    "A mandatory void reason is required.");
        }

        ShiftCreditEntry entry = creditEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_ENTRY, "Credit entry not found"));

        if (!entry.getShiftId().equals(shiftId)) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRY_NOT_IN_SHIFT,
                    Map.of(),
                    "Credit entry does not belong to this shift.");
        }

        if ("VOIDED".equals(entry.getVoidStatus())) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRY_ALREADY_VOIDED,
                    Map.of(),
                    "Credit entry is already voided.");
        }
        invoicedSaleGuard.requireFuelEntriesNotInvoiced(List.of(entryId));

        if (entry.getClientId() != null) {
            creditAccountPolicyService.lockLimitHolderOfClient(entry.getClientId());
        }

        entry.setVoidStatus("VOIDED");
        entry.setVoidReason(voidReason.trim());
        entry.setVoidedByUserId(currentUser.getId());
        entry.setVoidedAt(businessClock.now());
        creditEntryRepository.save(entry);
        if (entry.getClientId() != null) {
            creditInterestService.recalculateChargedInterestFrom(entry.getClientId(), entry.getSaleDate(),
                    "Recalculated after voiding a credit sale dated " + entry.getSaleDate(), currentUser);
        }

        log.info("Credit entry {} voided on shift {}: reason='{}', by={}", entryId, shiftId, voidReason, currentUser.getId());

        return shiftReadModelService.toResponseWithLookups(shift);
    }

    /** An operator sees only their own shifts; every other role sees all shifts of the pump. */
    @Transactional(readOnly = true)
    public List<ShiftResponse> getActiveShifts(Long pumpId, User currentUser) {
        List<Shift> shifts = shiftRepository.findActiveShiftsByPump(pumpId).stream()
                .filter(shift -> canSeeShift(currentUser, shift))
                .toList();
        return shiftReadModelService.toResponsesWithLookups(shifts);
    }

    @Transactional(readOnly = true)
    public Page<ShiftResponse> getShiftHistory(Long pumpId, ShiftHistoryFilter filter, Pageable pageable, User currentUser) {
        Page<Shift> shifts = currentUser.getRole() == UserRole.OPERATOR
                ? findOperatorHistory(pumpId, currentUser.getId(), filter, pageable)
                : findHistory(pumpId, filter, pageable);
        return new PageImpl<>(shiftReadModelService.toResponsesWithLookups(shifts.getContent()),
                shifts.getPageable(), shifts.getTotalElements());
    }

    private Page<Shift> findOperatorHistory(Long pumpId, Long operatorId, ShiftHistoryFilter filter, Pageable pageable) {
        if (filter.fuelType() != null) {
            DateRange range = fuelFilterRange(filter);
            return shiftRepository.findOperatorHistoryForFuel(pumpId, operatorId, range.from(), range.to(),
                    filter.fuelType(), pageable);
        }
        if (!filter.discrepanciesOnly() && filter.from() == null && filter.to() == null) {
            return shiftRepository.findByPumpIdAndOperatorIdOrderByActualStartTimeDesc(pumpId, operatorId, pageable);
        }
        LocalDate from = DateRangeBounds.startOrEarliest(filter.from());
        LocalDate to = DateRangeBounds.endOrLatest(filter.to());
        DateRangeBounds.requireStartNotAfterEnd(from, to);
        if (filter.discrepanciesOnly()) {
            return shiftRepository.findByPumpIdAndOperatorIdAndShiftDateBetweenAndDiscrepancyTypeInOrderByActualStartTimeDesc(
                    pumpId, operatorId, from, to, discrepancyTypesOf(filter), pageable);
        }
        return shiftRepository.findByPumpIdAndOperatorIdAndShiftDateBetweenOrderByActualStartTimeDesc(
                pumpId, operatorId, from, to, pageable);
    }

    private Page<Shift> findHistory(Long pumpId, ShiftHistoryFilter filter, Pageable pageable) {
        if (filter.fuelType() != null) {
            DateRange range = fuelFilterRange(filter);
            return shiftRepository.findHistoryForFuel(pumpId, range.from(), range.to(), filter.fuelType(), pageable);
        }
        if (!filter.discrepanciesOnly() && filter.from() == null && filter.to() == null) {
            return shiftRepository.findByPumpIdOrderByActualStartTimeDesc(pumpId, pageable);
        }
        LocalDate from = DateRangeBounds.startOrEarliest(filter.from());
        LocalDate to = DateRangeBounds.endOrLatest(filter.to());
        DateRangeBounds.requireStartNotAfterEnd(from, to);
        if (filter.discrepanciesOnly()) {
            return shiftRepository.findByPumpIdAndShiftDateBetweenAndDiscrepancyTypeInOrderByActualStartTimeDesc(
                    pumpId, from, to, discrepancyTypesOf(filter), pageable);
        }
        return shiftRepository.findByPumpIdAndShiftDateBetweenOrderByActualStartTimeDesc(pumpId, from, to, pageable);
    }

    private DateRange fuelFilterRange(ShiftHistoryFilter filter) {
        if (filter.discrepanciesOnly()) {
            throw new BusinessException(ErrorCodes.SHIFT_HISTORY_FILTER_CONFLICT,
                    Map.of(),
                    "Filter shift history by fuel or by discrepancies, not both.");
        }
        LocalDate from = DateRangeBounds.startOrEarliest(filter.from());
        LocalDate to = DateRangeBounds.endOrLatest(filter.to());
        DateRangeBounds.requireStartNotAfterEnd(from, to);
        return new DateRange(from, to);
    }

    private record DateRange(LocalDate from, LocalDate to) {
    }

    private List<DiscrepancyType> discrepancyTypesOf(ShiftHistoryFilter filter) {
        return filter.discrepancyType() != null
                ? List.of(filter.discrepancyType())
                : List.of(DiscrepancyType.values());
    }

    @Transactional(readOnly = true)
    public ShiftResponse getShiftById(Long pumpId, Long shiftId, User currentUser) {
        Shift shift = shiftRepository.findByIdAndPumpId(shiftId, pumpId)
                .filter(found -> canSeeShift(currentUser, found))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT, "Shift not found"));
        return shiftReadModelService.toResponseWithLookups(shift);
    }

    private boolean canSeeShift(User currentUser, Shift shift) {
        return currentUser.getRole() != UserRole.OPERATOR || currentUser.getId().equals(shift.getOperatorId());
    }
}
