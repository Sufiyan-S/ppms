package com.ppms.scheduler;

import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Automatically transitions open shifts when their configured window has ended.
 *
 * Runs every 5 minutes. For each open shift:
 *   - Loads the shift's PumpShiftDefinition to determine the expected end time
 *   - If the current time has passed the definition's end time → OPEN_OVERDUE (grace cycle)
 *   - If the shift was already OPEN_OVERDUE → AUTO_CLOSED_OVERDUE (force-close)
 *
 * The job is idempotent: running it twice produces the same result.
 * ShedLock ensures only one pod runs the job in a multi-instance deployment.
 *
 * No FIFO deduction is performed for auto-closed shifts — that requires end-meter
 * readings which the operator never submitted. AUTO_CLOSED_OVERDUE signals management
 * that a manual reconciliation is required.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OverdueShiftJob {

    private final ShiftRepository shiftRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;

    /**
     * Runs every 5 minutes. The dynamic shift system no longer has fixed boundary times,
     * so we poll frequently rather than scheduling at exact window-start times.
     * ShedLock prevents concurrent execution across pods.
     */
    @Scheduled(cron = "0 */5 * * * *")
    @SchedulerLock(name = "OverdueShiftJob", lockAtMostFor = "PT5M", lockAtLeastFor = "PT1M")
    @Transactional
    public void processOverdueShifts() {
        ZoneId ist = ZoneId.of("Asia/Kolkata");
        LocalTime now     = LocalTime.now(ist);
        LocalDate today   = LocalDate.now(ist);
        OffsetDateTime nowDt = OffsetDateTime.now(ist);

        List<Shift> openShifts = shiftRepository.findAllOpenShifts();

        // Pre-fetch all required shift definitions in one query instead of one per shift
        Set<Long> defIds = openShifts.stream()
                .filter(s -> s.getShiftDefinitionId() != null)
                .map(Shift::getShiftDefinitionId)
                .collect(Collectors.toSet());
        Map<Long, PumpShiftDefinition> defById = shiftDefinitionRepository.findAllById(defIds).stream()
                .collect(Collectors.toMap(PumpShiftDefinition::getId, d -> d));

        int markedOverdue = 0;
        int autoClosed    = 0;

        for (Shift shift : openShifts) {
            if (shift.getStatus() == ShiftStatus.OPEN_OVERDUE) {
                // Already flagged last cycle — force-close it now
                shift.setStatus(ShiftStatus.AUTO_CLOSED_OVERDUE);
                shift.setActualEndTime(nowDt);
                shiftRepository.save(shift);
                autoClosed++;
                continue;
            }

            // For OPEN shifts: check if the current time has passed the definition's end time
            if (shift.getShiftDefinitionId() == null) {
                // Defensive: no definition linked (should not happen after migration)
                log.warn("Shift {} has no shiftDefinitionId — skipping overdue check", shift.getId());
                continue;
            }

            PumpShiftDefinition def = defById.get(shift.getShiftDefinitionId());
            if (def != null && isPastEndTime(def, now, shift.getShiftDate(), today)) {
                shift.setStatus(ShiftStatus.OPEN_OVERDUE);
                shift.setIsOverdueFlag(true);
                shiftRepository.save(shift);
            }

            if (shift.getStatus() == ShiftStatus.OPEN_OVERDUE) markedOverdue++;
        }

        if (markedOverdue > 0 || autoClosed > 0) {
            log.info("OverdueShiftJob: markedOverdue={}, autoClosed={}", markedOverdue, autoClosed);
        }
    }

    /**
     * Returns true if the current time has passed the definition's expected end time.
     *
     * For cross-midnight definitions (e.g. 22:00–10:00):
     *   The shift ends the next day. It becomes overdue when today > shiftDate AND now >= endTime,
     *   or if it has been open across two full days (catch-all).
     *
     * For same-day definitions (e.g. 06:00–14:00):
     *   Overdue when now >= endTime (on the same shift date).
     */
    private boolean isPastEndTime(PumpShiftDefinition def, LocalTime now,
                                   LocalDate shiftDate, LocalDate today) {
        if (def.isCrossesMidnight()) {
            // Cross-midnight shift ends at def.endTime on the day AFTER shiftDate
            LocalDate expectedEndDate = shiftDate.plusDays(1);
            if (today.isAfter(expectedEndDate)) return true;              // seriously overdue
            if (today.equals(expectedEndDate) && !now.isBefore(def.getEndTime())) return true;
            return false;
        } else {
            // Same-day shift: overdue when current time >= endTime on the shift's date
            if (today.isAfter(shiftDate)) return true;                    // missed the entire day
            return today.equals(shiftDate) && !now.isBefore(def.getEndTime());
        }
    }
}
