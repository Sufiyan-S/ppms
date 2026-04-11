package com.ppms.planning;

import com.ppms.common.exception.BusinessException;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ShiftPlanningSlotService {

    // Max shifts per pump — used to compute stable slot indices for consecutive-shift detection
    // Slot index = dayOffset * MAX_SHIFTS + (sortOrder - 1)
    public static final int MAX_SHIFTS_PER_PUMP = 4;

    private final PumpShiftDefinitionRepository shiftDefinitionRepository;
    private final ShiftPlanEntryRepository entryRepository;

    public LocalDate normaliseToMonday(LocalDate date) {
        return date.with(DayOfWeek.MONDAY);
    }

    public boolean wouldCreateThreeConsecutive(Set<Integer> existing, int newSlot) {
        Set<Integer> test = new HashSet<>(existing);
        test.add(newSlot);
        for (int start = newSlot - 2; start <= newSlot; start++) {
            if (start >= 0 && test.contains(start) && test.contains(start + 1) && test.contains(start + 2)) {
                return true;
            }
        }
        return false;
    }

    public int slotIndex(LocalDate weekStart, LocalDate date, Long shiftDefinitionId) {
        int dayOffset = (int) weekStart.until(date, java.time.temporal.ChronoUnit.DAYS);
        if (dayOffset < 0 || dayOffset > 6) {
            throw new BusinessException("Date " + date + " is outside the plan's week.");
        }
        int sortOrder = shiftDefinitionRepository.findById(shiftDefinitionId)
                .map(PumpShiftDefinition::getSortOrder)
                .orElse(1);
        return dayOffset * MAX_SHIFTS_PER_PUMP + (sortOrder - 1);
    }

    public Set<Integer> buildSlotSet(Long planId, Long operatorUserId, LocalDate weekStart) {
        return entryRepository.findByShiftPlanIdAndOperatorUserId(planId, operatorUserId)
                .stream()
                .map(entry -> slotIndex(weekStart, entry.getShiftDate(), entry.getShiftDefinitionId()))
                .collect(Collectors.toSet());
    }
}
