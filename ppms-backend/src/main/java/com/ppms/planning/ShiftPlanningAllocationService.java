package com.ppms.planning;

import com.ppms.pump.PumpShiftDefinition;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShiftPlanningAllocationService {

    private final ShiftPlanningSlotService slotService;
    private final ShiftPlanningRuleService ruleService;

    /**
     * Centralizes the weekly auto-allocation algorithm so draft generation and future planner
     * variants can reuse the same slot scoring and consecutive-shift rules.
     */
    public List<ShiftPlanEntry> generateEntries(ShiftPlan plan,
                                                GeneratePlanRequest request,
                                                LocalDate today,
                                                List<User> staff,
                                                Map<Long, StaffPreference> preferenceByUser,
                                                Map<Long, Set<LocalDate>> leavesByUser,
                                                List<PumpShiftDefinition> definitions) {
        Map<Long, Set<Integer>> assignedSlots = new java.util.HashMap<>();
        for (User user : staff) {
            assignedSlots.put(user.getId(), new HashSet<>());
        }

        List<ShiftPlanEntry> entries = new ArrayList<>();
        for (int dayOffset = 0; dayOffset < 7; dayOffset++) {
            LocalDate date = plan.getWeekStart().plusDays(dayOffset);
            if (date.isBefore(today)) {
                continue;
            }

            DayOfWeek dayOfWeek = date.getDayOfWeek();
            for (PumpShiftDefinition definition : definitions) {
                int slotIndex = dayOffset * ShiftPlanningSlotService.MAX_SHIFTS_PER_PUMP + (definition.getSortOrder() - 1);
                int target = definition.isNightShift()
                        ? request.operatorsPerNightShift()
                        : request.operatorsPerDayShift();

                List<long[]> scoredCandidates = new ArrayList<>();
                for (User user : staff) {
                    long userId = user.getId();
                    if (leavesByUser.getOrDefault(userId, Set.of()).contains(date)) {
                        continue;
                    }
                    if (definition.isNightShift() && ruleService.isNightShiftRestricted(user)) {
                        continue;
                    }
                    if (slotService.wouldCreateThreeConsecutive(assignedSlots.get(userId), slotIndex)) {
                        continue;
                    }

                    long score = 0;
                    StaffPreference preference = preferenceByUser.get(userId);
                    if (preference != null) {
                        if (definition.getId().equals(preference.getPreferredShiftDefinitionId())) {
                            score += 2;
                        }
                        if (preference.getPreferredDayOff() == null
                                || !preference.getPreferredDayOff().name().equals(dayOfWeek.name())) {
                            score += 1;
                        }
                    }
                    score -= assignedSlots.get(userId).size();
                    scoredCandidates.add(new long[]{userId, score});
                }

                scoredCandidates.sort((a, b) -> Long.compare(b[1], a[1]));

                int assigned = 0;
                for (long[] candidate : scoredCandidates) {
                    if (assigned >= target) {
                        break;
                    }
                    long userId = candidate[0];
                    assignedSlots.get(userId).add(slotIndex);
                    entries.add(ShiftPlanEntry.builder()
                            .shiftPlanId(plan.getId())
                            .shiftDate(date)
                            .shiftDefinitionId(definition.getId())
                            .operatorUserId(userId)
                            .status(ShiftPlanEntryStatus.PLANNED)
                            .build());
                    assigned++;
                }

                if (assigned < target) {
                    log.warn("Plan {}: only {}/{} operators available for {} {}",
                            plan.getId(), assigned, target, date, definition.getName());
                }
            }
        }
        return entries;
    }
}
