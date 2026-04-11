package com.ppms.pump;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.lang.Nullable;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class PumpShiftDefinitionService {

    private final PumpShiftDefinitionRepository repository;
    private final ShiftRepository               shiftRepository;
    private final PumpShiftDefinitionSupportService supportService;

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
        return repository.findActiveForPumpOnDate(pumpId, LocalDate.now())
                .stream()
                .map(ShiftDefinitionResponse::from)
                .toList();
    }

    // ── Detect current shift at shift-open time ───────────────────────────────

    /**
     * Determines which shift definition matches the current time for the given pump.
     * Called when an operator opens a shift.
     *
     * @throws BusinessException if no active definition covers the current time —
     *         this means the admin has not configured shifts for this pump yet,
     *         or the pump operates outside all defined windows.
     */
    public PumpShiftDefinition detectCurrentShift(Long pumpId) {
        LocalDate today = LocalDate.now();
        LocalTime now   = LocalTime.now();

        List<PumpShiftDefinition> active = repository.findActiveForPumpOnDate(pumpId, today);
        if (active.isEmpty()) {
            throw new BusinessException(
                    "No shift schedule has been configured for this pump. " +
                    "Ask an admin to set up shift definitions under Pump Settings.");
        }

        return active.stream()
                .filter(d -> d.containsTime(now))
                .findFirst()
                .orElseThrow(() -> new BusinessException(
                        "The current time (" + now + ") does not fall within any configured shift window " +
                        "for this pump. Ask an admin to review the shift definitions."));
    }

    /**
     * Loads a definition by ID and verifies it belongs to the given pump.
     * Used by balance sheet generation and shift planning.
     */
    public PumpShiftDefinition getByIdAndPump(Long id, Long pumpId) {
        PumpShiftDefinition def = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Shift definition not found: " + id));
        if (!def.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift definition " + id + " does not belong to pump " + pumpId);
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
            throw new BusinessException("At least one shift definition is required.");
        }
        if (requests.size() > supportService.maxShiftsPerPump()) {
            throw new BusinessException(
                    "A pump can have at most " + supportService.maxShiftsPerPump() + " shifts. Received: " + requests.size());
        }

        // Determine effectiveFrom and effectiveTo — all entries in the batch must agree
        LocalDate effectiveFrom = supportService.resolveEffectiveFrom(requests);
        LocalDate effectiveTo   = supportService.resolveEffectiveTo(requests);

        // Validate the shift time windows together
        supportService.validateBatch(requests);

        // Guard: reject only if an ACTIVE (open-ended, effectiveTo = null) group already starts on this date.
        // Disabled groups (effectiveTo set) are allowed to share the same effectiveFrom — they are historical.
        boolean activeGroupOnSameDate = repository.findByPumpIdAndEffectiveFrom(pumpId, effectiveFrom)
                .stream().anyMatch(d -> d.getEffectiveTo() == null);
        if (activeGroupOnSameDate) {
            throw new BusinessException(
                    "An active shift schedule already exists for " + effectiveFrom +
                    ". Disable or delete the active group first, then create a new one.");
        }

        // Guard: reject only if an ACTIVE (open-ended) group's range overlaps the new range.
        // Disabled groups are intentionally closed and do not block new schedules.
        LocalDate overlapCheckEnd = effectiveTo != null ? effectiveTo : LocalDate.of(9999, 12, 31);
        List<PumpShiftDefinition> overlapping = repository.findOpenDefinitionsForPump(pumpId)
                .stream()
                .filter(d -> !d.getEffectiveFrom().isAfter(overlapCheckEnd))
                .toList();
        if (!overlapping.isEmpty()) {
            PumpShiftDefinition conflict = overlapping.get(0);
            throw new BusinessException(
                    "The date range [" + effectiveFrom + (effectiveTo != null ? " – " + effectiveTo : " onwards") +
                    "] overlaps with an active schedule effective from " + conflict.getEffectiveFrom() +
                    ". Disable or delete the conflicting group first.");
        }

        // Close out any definitions that are still active on the new schedule's start date.
        // This covers both:
        //  - Open-ended definitions (effectiveTo = null) — the normal case of replacing a schedule
        //  - Manually-disabled definitions whose effectiveTo = effectiveFrom — they would appear as
        //    active on the same day as the new schedule if not trimmed here.
        LocalDate closingDate = effectiveFrom.minusDays(1);
        List<PumpShiftDefinition> toClose = repository.findOverlappingDefinitions(pumpId, effectiveFrom, effectiveFrom)
                .stream()
                // Only trim if the resulting range stays valid (effectiveTo >= effectiveFrom of that def)
                .filter(d -> !closingDate.isBefore(d.getEffectiveFrom()))
                .toList();
        toClose.forEach(d -> d.setEffectiveTo(closingDate));
        if (!toClose.isEmpty()) {
            repository.saveAll(toClose);
        }

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
            throw new ResourceNotFoundException(
                    "No shift definitions found for pump " + pumpId + " effective " + effectiveFrom
                    + (effectiveTo != null ? " to " + effectiveTo : " (open-ended)"));
        }

        List<Long> defIds = group.stream().map(PumpShiftDefinition::getId).toList();
        if (shiftRepository.existsByShiftDefinitionIdIn(defIds)) {
            throw new BusinessException(
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
            throw new ResourceNotFoundException(
                    "No shift definitions found for pump " + pumpId + " effective " + effectiveFrom);
        }

        // Only target the open-ended (active) definitions — disabled ones are left unchanged.
        List<PumpShiftDefinition> openGroup = all.stream()
                .filter(d -> d.getEffectiveTo() == null)
                .toList();

        if (openGroup.isEmpty()) {
            throw new BusinessException(
                    "This shift schedule has already been disabled. Delete it and create a new one if needed.");
        }

        if (disableDate.isBefore(effectiveFrom)) {
            throw new BusinessException(
                    "Disable date (" + disableDate + ") cannot be before the schedule start date (" + effectiveFrom + ").");
        }

        openGroup.forEach(d -> d.setEffectiveTo(disableDate));
        List<PumpShiftDefinition> saved = repository.saveAll(openGroup);
        log.info("Pump {}: disabled shift definition group effective {} — expires {}", pumpId, effectiveFrom, disableDate);
        return saved.stream().map(ShiftDefinitionResponse::from).toList();
    }
}
