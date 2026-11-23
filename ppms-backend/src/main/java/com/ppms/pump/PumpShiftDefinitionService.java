package com.ppms.pump;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.lang.Nullable;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class PumpShiftDefinitionService {

    private static final LocalDate OPEN_ENDED_RANGE_END = LocalDate.of(9999, 12, 31);

    private final PumpShiftDefinitionRepository repository;
    private final ShiftRepository               shiftRepository;
    private final PumpShiftDefinitionSupportService supportService;
    private final BusinessClock businessClock;

    // ── Query ─────────────────────────────────────────────────────────────────

    public List<ShiftDefinitionResponse> getForPump(Long pumpId) {
        return repository.findByPumpIdOrderByEffectiveFromDescSortOrderAsc(pumpId)
                .stream()
                .map(ShiftDefinitionResponse::from)
                .toList();
    }

    /**
     * Returns the active definitions for a pump on today's date, sorted by sortOrder.
     * Used by the balance sheet generate modal to populate the shift selector.
     */
    public List<ShiftDefinitionResponse> getActiveForPump(Long pumpId) {
        return repository.findActiveForPumpOnDate(pumpId, businessClock.today())
                .stream()
                .map(ShiftDefinitionResponse::from)
                .toList();
    }

    /**
     * Returns the shift definitions that were (or are) in effect for a pump on a given date.
     * Used by the backfill modal to populate the shift window selector for a chosen date.
     *
     * Three-step fallback so the backfill form is never needlessly blocked:
     *  1. Exact historical match — definition range covers the date (effectiveFrom ≤ date ≤ effectiveTo).
     *  2. Most recent group whose effectiveFrom ≤ date — definition was in use at the time but has
     *     since been superseded or expired (effectiveTo < date).
     *  3. Currently active definitions — for new pumps where all definitions start after the backfill
     *     date (effectiveFrom > date for every group).  Using today's windows as a proxy is safe
     *     because the backend does not validate that the definition was active on the shift date.
     *
     * @param pumpId the pump
     * @param date   the historical date to look up definitions for
     */
    public List<ShiftDefinitionResponse> getForPumpOnDate(Long pumpId, LocalDate date) {
        // Step 1: exact historical match
        List<PumpShiftDefinition> definitions = repository.findActiveForPumpOnDate(pumpId, date);

        if (definitions.isEmpty()) {
            // Step 2: most recent group that started on or before the date (may have since expired)
            definitions = repository.findLatestGroupOnOrBeforeDate(pumpId, date);
        }

        if (definitions.isEmpty()) {
            // Step 3: current active definitions — new pump whose config starts after the backfill date
            definitions = repository.findActiveForPumpOnDate(pumpId, businessClock.today());
        }

        return definitions.stream()
                .map(ShiftDefinitionResponse::from)
                .toList();
    }

    // ── Detect current shift at shift-open time ───────────────────────────────

    /**
     * Determines which shift definition matches the current time for the given pump, and the
     * business date of that shift. A night shift opened after midnight belongs to the previous day,
     * so only the definitions in force on that previous day can match its after-midnight part; a
     * definition that starts today has not begun its own night yet.
     *
     * @throws BusinessException if no active definition covers the current time
     */
    public CurrentShiftWindow detectCurrentShift(Long pumpId) {
        OffsetDateTime now = businessClock.now();
        LocalDate today = now.toLocalDate();
        LocalTime time = now.toLocalTime();
        LocalDate yesterday = today.minusDays(1);

        List<PumpShiftDefinition> todaysDefinitions = repository.findActiveForPumpOnDate(pumpId, today);
        List<PumpShiftDefinition> yesterdaysDefinitions = repository.findActiveForPumpOnDate(pumpId, yesterday);
        if (todaysDefinitions.isEmpty() && yesterdaysDefinitions.isEmpty()) {
            throw new BusinessException(ErrorCodes.SHIFT_SCHEDULE_NOT_CONFIGURED, Map.of(),
                    "No shift schedule has been configured for this pump. " +
                    "Ask an admin to set up shift definitions under Pump Settings.");
        }

        Optional<PumpShiftDefinition> continuingNightShift = yesterdaysDefinitions.stream()
                .filter(d -> d.isInAfterMidnightPart(time))
                .findFirst();
        if (continuingNightShift.isPresent()) {
            return new CurrentShiftWindow(continuingNightShift.get(), yesterday);
        }

        return todaysDefinitions.stream()
                .filter(d -> d.containsTime(time) && !d.isInAfterMidnightPart(time))
                .findFirst()
                .map(d -> new CurrentShiftWindow(d, today))
                .orElseThrow(() -> new BusinessException(ErrorCodes.CURRENT_TIME_OUTSIDE_SHIFT_WINDOWS,
                        Map.of("time", time.withSecond(0).withNano(0).toString()),
                        "The current time (" + time.withSecond(0).withNano(0) + ") does not fall within any configured " +
                        "shift window for this pump. Ask an admin to review the shift definitions."));
    }

    /**
     * Loads a definition by ID and verifies it belongs to the given pump.
     * Used by balance sheet generation and shift planning.
     */
    public PumpShiftDefinition getByIdAndPump(Long id, Long pumpId) {
        PumpShiftDefinition def = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT_DEFINITION,
                        "Shift definition not found: " + id));
        if (!def.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.SHIFT_DEFINITION, "Shift definition " + id + " not found");
        }
        return def;
    }

    // ── Create ────────────────────────────────────────────────────────────────

    /**
     * Creates a batch of shift definitions for a pump under a single effectiveFrom date.
     *
     * The full list for that date is validated together (max 4, night shift required,
     * no overlaps, total ≤ 24 h). Any currently-open definitions are closed out
     * with effectiveTo = effectiveFrom - 1 day.
     *
     * @param pumpId    the pump to configure
     * @param requests  1–4 definitions sharing the same effectiveFrom
     * @param currentUser the admin/owner submitting the request
     * @return the saved definitions
     */
    @Transactional
    public List<ShiftDefinitionResponse> createBatch(Long pumpId,
                                                      List<CreateShiftDefinitionRequest> requests,
                                                      User currentUser) {
        if (requests == null || requests.isEmpty()) {
            throw new BusinessException(ErrorCodes.SHIFT_DEFINITION_REQUIRED, Map.of(),
                    "At least one shift definition is required.");
        }
        if (requests.size() > supportService.maxShiftsPerPump()) {
            throw new BusinessException(ErrorCodes.TOO_MANY_SHIFT_DEFINITIONS,
                    Map.of("maxShifts", supportService.maxShiftsPerPump(), "receivedShifts", requests.size()),
                    "A pump can have at most " + supportService.maxShiftsPerPump() + " shifts. Received: " + requests.size());
        }

        // Determine effectiveFrom and effectiveTo — all entries in the batch must agree
        LocalDate effectiveFrom = supportService.resolveEffectiveFrom(requests);
        LocalDate effectiveTo   = supportService.resolveEffectiveTo(requests);

        // Validate the shift time windows together
        supportService.validateBatch(requests);

        rejectOverlapsAndTrimEarlierGroups(pumpId, effectiveFrom, effectiveTo);

        // Build and save the new definitions
        List<PumpShiftDefinition> newDefs = requests.stream().map(req -> {
            boolean crosses = req.getEndTime().isBefore(req.getStartTime());
            return PumpShiftDefinition.builder()
                    .pumpId(pumpId)
                    .name(req.getName().trim())
                    .startTime(req.getStartTime())
                    .endTime(req.getEndTime())
                    .crossesMidnight(crosses)
                    .isNightShift(req.isNightShift())
                    .sortOrder(req.getSortOrder())
                    .effectiveFrom(effectiveFrom)
                    .effectiveTo(effectiveTo)
                    .createdByUserId(currentUser.getId())
                    .build();
        }).toList();

        List<PumpShiftDefinition> saved = repository.saveAll(newDefs);
        log.info("Pump {}: created {} shift definitions effective {}",
                pumpId, saved.size(), effectiveFrom);

        return saved.stream().map(ShiftDefinitionResponse::from).toList();
    }

    /**
     * An earlier disabled group whose last day falls inside the new range is shortened to end the day
     * before the new group starts. Any other overlap would leave two schedules active on the same day,
     * so it is rejected.
     */
    private void rejectOverlapsAndTrimEarlierGroups(Long pumpId, LocalDate effectiveFrom, @Nullable LocalDate effectiveTo) {
        LocalDate newRangeEnd = effectiveTo != null ? effectiveTo : OPEN_ENDED_RANGE_END;
        String newRangeLabel = "[" + effectiveFrom + (effectiveTo != null ? " – " + effectiveTo : " onwards") + "]";

        List<PumpShiftDefinition> toTrim = new ArrayList<>();
        for (PumpShiftDefinition existing : repository.findOverlappingDefinitions(pumpId, effectiveFrom, newRangeEnd)) {
            if (existing.getEffectiveTo() == null) {
                throw new BusinessException(
                        effectiveTo != null ? ErrorCodes.SHIFT_SCHEDULE_OVERLAPS_OPEN_SCHEDULE
                                : ErrorCodes.OPEN_SHIFT_SCHEDULE_OVERLAPS_OPEN_SCHEDULE,
                        Map.of("effectiveFrom", effectiveFrom.toString(), "effectiveTo", String.valueOf(effectiveTo),
                                "existingFrom", existing.getEffectiveFrom().toString()),
                        "The date range " + newRangeLabel + " overlaps with an active schedule effective from " +
                        existing.getEffectiveFrom() + ". Disable or delete the conflicting group first.");
            }
            boolean startsEarlierAndEndsInsideNewRange = existing.getEffectiveFrom().isBefore(effectiveFrom)
                    && !existing.getEffectiveTo().isAfter(newRangeEnd);
            if (!startsEarlierAndEndsInsideNewRange) {
                throw new BusinessException(
                        effectiveTo != null ? ErrorCodes.SHIFT_SCHEDULE_OVERLAPS_SCHEDULE
                                : ErrorCodes.OPEN_SHIFT_SCHEDULE_OVERLAPS_SCHEDULE,
                        Map.of("effectiveFrom", effectiveFrom.toString(), "effectiveTo", String.valueOf(effectiveTo),
                                "existingFrom", existing.getEffectiveFrom().toString(),
                                "existingTo", existing.getEffectiveTo().toString()),
                        "The date range " + newRangeLabel + " overlaps the schedule " +
                        existing.getEffectiveFrom() + " – " + existing.getEffectiveTo() +
                        ". Delete that schedule or choose dates that do not overlap it.");
            }
            toTrim.add(existing);
        }

        toTrim.forEach(d -> d.setEffectiveTo(effectiveFrom.minusDays(1)));
        if (!toTrim.isEmpty()) {
            repository.saveAll(toTrim);
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    /**
     * Deletes a specific group of shift definitions for a pump.
     * A group is identified by the (effectiveFrom, effectiveTo) pair — two groups can share the
     * same effectiveFrom date if one is disabled and a new active one was created for the same date.
     *
     * @param effectiveTo null = delete the open-ended (active) group; a date = delete that specific disabled group.
     * @throws BusinessException if shifts exist that reference any definition in this group.
     */
    @Transactional
    public void deleteGroup(Long pumpId, LocalDate effectiveFrom, @Nullable LocalDate effectiveTo) {
        List<PumpShiftDefinition> all = repository.findByPumpIdAndEffectiveFrom(pumpId, effectiveFrom);
        // Narrow to the specific sub-group identified by effectiveTo.
        List<PumpShiftDefinition> group = all.stream()
                .filter(d -> effectiveTo == null
                        ? d.getEffectiveTo() == null
                        : effectiveTo.equals(d.getEffectiveTo()))
                .toList();

        if (group.isEmpty()) {
            throw new ResourceNotFoundException(EntityType.SHIFT_DEFINITION,
                    "No shift definitions found for pump " + pumpId + " effective " + effectiveFrom
                    + (effectiveTo != null ? " to " + effectiveTo : " (open-ended)"));
        }

        List<Long> defIds = group.stream().map(PumpShiftDefinition::getId).toList();
        if (shiftRepository.existsByShiftDefinitionIdIn(defIds)) {
            throw new BusinessException(ErrorCodes.SHIFT_SCHEDULE_IN_USE, Map.of(),
                    "Cannot delete this shift schedule — shifts have already been recorded against it. " +
                    "You can only delete schedules that have never been used.");
        }

        repository.deleteAll(group);
        log.info("Pump {}: deleted shift definition group effective {} to {}", pumpId, effectiveFrom, effectiveTo);
    }

    /**
     * Disables the open-ended (active) shift definition group for a pump on the given effectiveFrom date.
     * Sets effectiveTo = disableDate on every open-ended definition in that group.
     * After disableDate, detectCurrentShift() will find no active definition and prevent new shift opens.
     *
     * Multiple groups can share the same effectiveFrom (e.g. a disabled group and a new active one).
     * Only the open-ended definitions are targeted here — disabled definitions are left unchanged.
     */
    @Transactional
    public List<ShiftDefinitionResponse> disableGroup(Long pumpId, LocalDate effectiveFrom, LocalDate disableDate) {
        List<PumpShiftDefinition> all = repository.findByPumpIdAndEffectiveFrom(pumpId, effectiveFrom);
        if (all.isEmpty()) {
            throw new ResourceNotFoundException(EntityType.SHIFT_DEFINITION,
                    "No shift definitions found for pump " + pumpId + " effective " + effectiveFrom);
        }

        // Only target the open-ended (active) definitions — disabled ones are left unchanged.
        List<PumpShiftDefinition> openGroup = all.stream()
                .filter(d -> d.getEffectiveTo() == null)
                .toList();

        if (openGroup.isEmpty()) {
            throw new BusinessException(ErrorCodes.SHIFT_SCHEDULE_ALREADY_DISABLED, Map.of(),
                    "This shift schedule has already been disabled. Delete it and create a new one if needed.");
        }

        if (disableDate.isBefore(effectiveFrom)) {
            throw new BusinessException(ErrorCodes.SHIFT_SCHEDULE_DISABLE_DATE_BEFORE_START,
                    Map.of("disableDate", disableDate.toString(), "effectiveFrom", effectiveFrom.toString()),
                    "Disable date (" + disableDate + ") cannot be before the schedule start date (" + effectiveFrom + ").");
        }

        openGroup.forEach(d -> d.setEffectiveTo(disableDate));
        List<PumpShiftDefinition> saved = repository.saveAll(openGroup);
        log.info("Pump {}: disabled shift definition group effective {} — expires {}", pumpId, effectiveFrom, disableDate);
        return saved.stream().map(ShiftDefinitionResponse::from).toList();
    }
}
