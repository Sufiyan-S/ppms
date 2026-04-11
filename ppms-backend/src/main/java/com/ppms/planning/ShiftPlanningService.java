package com.ppms.planning;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShiftPlanningService {

    private final ShiftPlanRepository planRepository;
    private final ShiftPlanEntryRepository entryRepository;
    private final StaffPreferenceRepository preferenceRepository;
    private final StaffLeaveRepository leaveRepository;
    private final UserRepository userRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;
    private final ShiftPlanningRuleService ruleService;
    private final ShiftPlanningSlotService slotService;
    private final ShiftPlanningAllocationService allocationService;

    // ── Preferences ────────────────────────────────────────────────────────────

    @Transactional
    public StaffPreference setPreference(Long pumpId, Long userId, SetPreferenceRequest req) {
        StaffPreference pref = preferenceRepository.findByUserId(userId)
                .orElseGet(() -> StaffPreference.builder().userId(userId).pumpId(pumpId).build());
        pref.setPreferredShiftDefinitionId(req.preferredShiftDefinitionId());
        pref.setPreferredDayOff(req.preferredDayOff());
        return preferenceRepository.save(pref);
    }

    public Optional<StaffPreference> getPreference(Long userId) {
        return preferenceRepository.findByUserId(userId);
    }

    // ── Leave ──────────────────────────────────────────────────────────────────

    @Transactional
    public StaffLeave addLeave(Long pumpId, Long userId, AddLeaveRequest req) {
        if (leaveRepository.existsByUserIdAndLeaveDate(userId, req.leaveDate())) {
            throw new BusinessException("Leave already recorded for " + req.leaveDate());
        }
        StaffLeave leave = StaffLeave.builder()
                .userId(userId)
                .pumpId(pumpId)
                .leaveDate(req.leaveDate())
                .reason(req.reason())
                .build();
        return leaveRepository.save(leave);
    }

    @Transactional
    public void removeLeave(Long leaveId, Long pumpId) {
        StaffLeave leave = leaveRepository.findById(leaveId)
                .orElseThrow(() -> new ResourceNotFoundException("Leave record not found"));
        if (!leave.getPumpId().equals(pumpId)) {
            throw new BusinessException("Leave does not belong to this pump");
        }
        leaveRepository.delete(leave);
    }

    public List<StaffLeave> getLeaves(Long userId) {
        return leaveRepository.findByUserIdOrderByLeaveDateDesc(userId);
    }

    // ── Plan generation ────────────────────────────────────────────────────────

    /**
     * Auto-generates a weekly shift plan for the given pump and week.
     * If a DRAFT plan already exists for this week it is replaced.
     * A PUBLISHED plan cannot be regenerated.
     *
     * Algorithm (per slot):
     *  1. Filter out staff on leave that day
     *  2. Filter out staff who would hit 3 consecutive shifts
     *  3. Score remaining staff:
     *     +2 if their preferred shift matches this slot
     *     +1 if today is NOT their preferred day off
     *     -N for each shift already assigned this week (fairness)
     *  4. Pick top `target` staff by score (stable sort)
     */
    @Transactional
    public ShiftPlan generatePlan(Long pumpId, GeneratePlanRequest req, Long createdByUserId) {
        LocalDate weekStart = slotService.normaliseToMonday(req.weekStart());
        LocalDate today     = LocalDate.now();
        LocalDate weekEnd   = weekStart.plusDays(6);

        // Reject if the entire week is already in the past — nothing to plan
        if (weekEnd.isBefore(today)) {
            throw new BusinessException(
                    "Cannot generate a plan for a week entirely in the past. " +
                    "Navigate to the current or a future week.");
        }

        // Reject regeneration of a published plan
        planRepository.findByPumpIdAndWeekStart(pumpId, weekStart).ifPresent(existing -> {
            if (existing.getStatus() == ShiftPlanStatus.PUBLISHED) {
                throw new BusinessException("This week's plan is already published and cannot be regenerated.");
            }
            // Delete draft so we can recreate cleanly
            planRepository.delete(existing);
            planRepository.flush();
        });

        // Load all active OPERATOR-role staff for this pump
        List<User> staff = userRepository.findByAssignedPumpIdAndRoleAndStatus(
                pumpId, UserRole.OPERATOR, com.ppms.user.UserStatus.ACTIVE);
        if (staff.isEmpty()) {
            throw new BusinessException("No active operators are assigned to this pump.");
        }

        // Load preferences keyed by userId
        Map<Long, StaffPreference> prefByUser = preferenceRepository.findByPumpId(pumpId)
                .stream().collect(Collectors.toMap(StaffPreference::getUserId, p -> p));

        // Load leaves for the week keyed by userId → set of leave dates
        Map<Long, Set<LocalDate>> leavesByUser = leaveRepository
                .findByPumpIdAndLeaveDateBetween(pumpId, weekStart, weekEnd)
                .stream()
                .collect(Collectors.groupingBy(
                        StaffLeave::getUserId,
                        Collectors.mapping(StaffLeave::getLeaveDate, Collectors.toSet())));

        // Create the plan header
        ShiftPlan plan = ShiftPlan.builder()
                .pumpId(pumpId)
                .weekStart(weekStart)
                .status(ShiftPlanStatus.DRAFT)
                .operatorsPerDayShift(req.operatorsPerDayShift())
                .operatorsPerNightShift(req.operatorsPerNightShift())
                .createdByUserId(createdByUserId)
                .build();
        plan = planRepository.save(plan);

        // Load the active shift definitions for this pump.
        // For weeks that started in the past, use today as the lookup date so that definitions
        // effective from today are found even when weekStart is earlier.
        LocalDate definitionLookupDate = weekStart.isBefore(today) ? today : weekStart;
        List<PumpShiftDefinition> definitions = shiftDefinitionRepository
                .findActiveForPumpOnDate(plan.getPumpId(), definitionLookupDate);
        if (definitions.isEmpty()) {
            throw new BusinessException(
                    "No shift definitions are configured for this pump effective " + definitionLookupDate +
                    ". Ask an admin to set up shift definitions first.");
        }

        List<ShiftPlanEntry> entries = allocationService.generateEntries(
                plan, req, today, staff, prefByUser, leavesByUser, definitions);

        entryRepository.saveAll(entries);
        log.info("Generated shift plan {} for pump {} week {}: {} entries",
                plan.getId(), pumpId, weekStart, entries.size());
        return plan;
    }

    // ── Plan retrieval ─────────────────────────────────────────────────────────

    public Optional<ShiftPlan> getPlan(Long pumpId, LocalDate weekStart) {
        return planRepository.findByPumpIdAndWeekStart(pumpId, slotService.normaliseToMonday(weekStart));
    }

    public List<ShiftPlanEntry> getEntries(Long planId) {
        return entryRepository.findByShiftPlanId(planId);
    }

    /** Upcoming published shifts for a staff member (from today onward). */
    public List<ShiftPlanEntry> getUpcomingForOperator(Long userId) {
        return entryRepository.findUpcomingForOperator(userId, LocalDate.now());
    }

    /** Planned operators for a specific date + shift definition (used to pre-fill shift opening). */
    public List<ShiftPlanEntry> getPlannedForSlot(Long pumpId, LocalDate date, Long shiftDefinitionId) {
        return entryRepository.findPlannedForSlot(pumpId, date, shiftDefinitionId);
    }

    // ── Plan editing ───────────────────────────────────────────────────────────

    @Transactional
    public ShiftPlanEntry addEntry(Long planId, AddEntryRequest req) {
        ShiftPlan plan = loadPlan(planId);
        validateNotPublishedLocked(plan);
        ruleService.validateOperatorForPump(req.operatorUserId(), plan.getPumpId());
        ruleService.validateNightShiftEligibility(req.operatorUserId(), req.shiftDefinitionId());

        // Duplicate check
        entryRepository.findByShiftPlanIdAndShiftDateAndShiftDefinitionIdAndOperatorUserId(
                planId, req.shiftDate(), req.shiftDefinitionId(), req.operatorUserId())
                .ifPresent(e -> { throw new BusinessException("Operator is already assigned to this slot."); });

        // Consecutive shift check
        Set<Integer> existing = slotService.buildSlotSet(planId, req.operatorUserId(), plan.getWeekStart());
        int slotIndex = slotService.slotIndex(plan.getWeekStart(), req.shiftDate(), req.shiftDefinitionId());
        if (slotService.wouldCreateThreeConsecutive(existing, slotIndex)) {
            throw new BusinessException(
                    "Cannot assign: this would give the operator 3 consecutive shifts. " +
                    "A minimum rest period is required between every 2 shifts.");
        }

        ShiftPlanEntry entry = ShiftPlanEntry.builder()
                .shiftPlanId(planId)
                .shiftDate(req.shiftDate())
                .shiftDefinitionId(req.shiftDefinitionId())
                .operatorUserId(req.operatorUserId())
                .status(ShiftPlanEntryStatus.PLANNED)
                .note(req.note())
                .build();
        return entryRepository.save(entry);
    }

    @Transactional
    public ShiftPlanEntry updateEntry(Long planId, Long entryId, UpdateEntryRequest req) {
        ShiftPlan plan = loadPlan(planId);
        validateNotPublishedLocked(plan);
        ShiftPlanEntry entry = loadEntry(entryId, planId);
        ruleService.validateOperatorForPump(req.operatorUserId(), plan.getPumpId());
        ruleService.validateNightShiftEligibility(req.operatorUserId(), entry.getShiftDefinitionId());

        if (!req.operatorUserId().equals(entry.getOperatorUserId())) {
            // Changing operator — re-validate consecutive constraint for new operator
            Set<Integer> slots = slotService.buildSlotSet(planId, req.operatorUserId(), plan.getWeekStart());
            int si = slotService.slotIndex(plan.getWeekStart(), entry.getShiftDate(), entry.getShiftDefinitionId());
            slots.remove(si);
            if (slotService.wouldCreateThreeConsecutive(slots, si)) {
                throw new BusinessException("Swapping to this operator would create 3 consecutive shifts.");
            }
        }

        entry.setOperatorUserId(req.operatorUserId());
        entry.setNote(req.note());
        return entryRepository.save(entry);
    }

    @Transactional
    public void removeEntry(Long planId, Long entryId) {
        ShiftPlan plan = loadPlan(planId);
        validateNotPublishedLocked(plan);
        ShiftPlanEntry entry = loadEntry(entryId, planId);
        entryRepository.delete(entry);
    }

    // ── Publish ────────────────────────────────────────────────────────────────

    @Transactional
    public ShiftPlan publishPlan(Long planId) {
        ShiftPlan plan = loadPlan(planId);
        if (plan.getStatus() == ShiftPlanStatus.PUBLISHED) {
            throw new BusinessException("Plan is already published.");
        }
        plan.setStatus(ShiftPlanStatus.PUBLISHED);
        ShiftPlan saved = planRepository.save(plan);
        log.info("Shift plan {} published for pump {} week {}", planId, plan.getPumpId(), plan.getWeekStart());
        return saved;
    }

    // ── Shift reconciliation (called from ShiftService on shift open) ──────────

    /**
     * When a shift is actually opened:
     * - Mark the matching plan entry (same operator) as CONFIRMED
     * - Mark any other PLANNED entries for that slot as ABSENT
     */
    @Transactional
    public void reconcileOnShiftOpen(Long pumpId, LocalDate shiftDate,
                                     Long shiftDefinitionId, Long actualOperatorId) {
        List<ShiftPlanEntry> planned = entryRepository.findPlannedEntries(pumpId, shiftDate, shiftDefinitionId);
        for (ShiftPlanEntry e : planned) {
            if (e.getOperatorUserId().equals(actualOperatorId)) {
                e.setStatus(ShiftPlanEntryStatus.CONFIRMED);
            } else {
                e.setStatus(ShiftPlanEntryStatus.ABSENT);
            }
            entryRepository.save(e);
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private ShiftPlan loadPlan(Long planId) {
        return planRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift plan not found"));
    }

    private ShiftPlanEntry loadEntry(Long entryId, Long planId) {
        ShiftPlanEntry entry = entryRepository.findById(entryId)
                .orElseThrow(() -> new ResourceNotFoundException("Plan entry not found"));
        if (!entry.getShiftPlanId().equals(planId)) {
            throw new BusinessException("Entry does not belong to this plan");
        }
        return entry;
    }

    private void validateNotPublishedLocked(ShiftPlan plan) {
        // Published plans can still be manually edited (emergency override allowed)
        // No restriction here — the UI can show a warning instead
    }

}
