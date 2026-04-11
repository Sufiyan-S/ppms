package com.ppms.pump;

import com.ppms.common.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Service
public class PumpShiftDefinitionSupportService {

    private static final int MAX_SHIFTS_PER_PUMP = 4;
    private static final int MAX_TOTAL_MINUTES = 24 * 60;
    private static final LocalTime NIGHT_WINDOW_START = LocalTime.MIDNIGHT;
    private static final LocalTime NIGHT_WINDOW_END = LocalTime.of(6, 0);

    public void validateBatch(List<CreateShiftDefinitionRequest> requests) {
        long nightCount = requests.stream().filter(CreateShiftDefinitionRequest::isNightShift).count();
        if (nightCount == 0) {
            throw new BusinessException("At least one shift must be designated as the night shift.");
        }
        if (nightCount > 1) {
            throw new BusinessException("Only one shift can be designated as the night shift. Found: " + nightCount);
        }

        CreateShiftDefinitionRequest nightShift = requests.stream()
                .filter(CreateShiftDefinitionRequest::isNightShift)
                .findFirst()
                .orElseThrow();
        if (!overlapsNightWindow(nightShift)) {
            throw new BusinessException(
                    "The night shift must overlap the 00:00–06:00 window. " +
                            "It can start before midnight and/or end after 06:00, " +
                            "but it must cover part of that range.");
        }

        long totalMinutes = requests.stream().mapToLong(request -> {
            boolean crossesMidnight = request.getEndTime().isBefore(request.getStartTime());
            if (crossesMidnight) {
                return (24 * 60L - request.getStartTime().toSecondOfDay() / 60)
                        + request.getEndTime().toSecondOfDay() / 60;
            }
            return (request.getEndTime().toSecondOfDay() - request.getStartTime().toSecondOfDay()) / 60L;
        }).sum();
        if (totalMinutes > MAX_TOTAL_MINUTES) {
            throw new BusinessException(
                    "The combined duration of all shifts exceeds 24 hours (" +
                            totalMinutes + " minutes). Reduce the shift windows.");
        }

        for (int i = 0; i < requests.size(); i++) {
            for (int j = i + 1; j < requests.size(); j++) {
                if (overlaps(requests.get(i), requests.get(j))) {
                    throw new BusinessException(
                            "Shift \"" + requests.get(i).getName() + "\" overlaps with \"" +
                                    requests.get(j).getName() + "\". Shift windows must not overlap.");
                }
            }
        }

        long distinctSortOrders = requests.stream()
                .mapToInt(CreateShiftDefinitionRequest::getSortOrder)
                .distinct()
                .count();
        if (distinctSortOrders != requests.size()) {
            throw new BusinessException("Each shift must have a unique sort order.");
        }
    }

    public LocalDate resolveEffectiveFrom(List<CreateShiftDefinitionRequest> requests) {
        LocalDate found = null;
        for (CreateShiftDefinitionRequest request : requests) {
            if (request.getEffectiveFrom() != null) {
                if (found == null) {
                    found = request.getEffectiveFrom();
                } else if (!found.equals(request.getEffectiveFrom())) {
                    throw new BusinessException(
                            "All shift definitions in a batch must share the same effectiveFrom date.");
                }
            }
        }
        return found != null ? found : LocalDate.now();
    }

    public LocalDate resolveEffectiveTo(List<CreateShiftDefinitionRequest> requests) {
        LocalDate found = null;
        for (CreateShiftDefinitionRequest request : requests) {
            if (request.getEffectiveTo() != null) {
                if (found == null) {
                    found = request.getEffectiveTo();
                } else if (!found.equals(request.getEffectiveTo())) {
                    throw new BusinessException(
                            "All shift definitions in a batch must share the same effectiveTo date.");
                }
            }
        }
        return found;
    }

    public int maxShiftsPerPump() {
        return MAX_SHIFTS_PER_PUMP;
    }

    private boolean overlapsNightWindow(CreateShiftDefinitionRequest request) {
        boolean crosses = request.getEndTime().isBefore(request.getStartTime());
        if (crosses) {
            return request.getEndTime().isAfter(NIGHT_WINDOW_START) || !request.getStartTime().isAfter(NIGHT_WINDOW_END);
        }
        return request.getStartTime().isBefore(NIGHT_WINDOW_END)
                && request.getEndTime().isAfter(NIGHT_WINDOW_START);
    }

    private boolean overlaps(CreateShiftDefinitionRequest first, CreateShiftDefinitionRequest second) {
        long firstStart = toMinutes(first.getStartTime());
        long firstEnd = crossesMidnight(first) ? toMinutes(first.getEndTime()) + 1440 : toMinutes(first.getEndTime());
        long secondStart = toMinutes(second.getStartTime());
        long secondEnd = crossesMidnight(second) ? toMinutes(second.getEndTime()) + 1440 : toMinutes(second.getEndTime());

        if (rangesOverlap(firstStart, firstEnd, secondStart, secondEnd)
                || rangesOverlap(secondStart, secondEnd, firstStart, firstEnd)) {
            return true;
        }

        if (crossesMidnight(first) && !crossesMidnight(second)) {
            return rangesOverlap(firstStart, firstEnd, secondStart + 1440, secondEnd + 1440);
        }
        if (crossesMidnight(second) && !crossesMidnight(first)) {
            return rangesOverlap(secondStart, secondEnd, firstStart + 1440, firstEnd + 1440);
        }
        return false;
    }

    private boolean rangesOverlap(long start1, long end1, long start2, long end2) {
        return start1 < end2 && end1 > start2;
    }

    private long toMinutes(LocalTime time) {
        return time.getHour() * 60L + time.getMinute();
    }

    private boolean crossesMidnight(CreateShiftDefinitionRequest request) {
        return request.getEndTime().isBefore(request.getStartTime());
    }
}
