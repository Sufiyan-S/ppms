package com.ppms.scheduler;

import com.ppms.common.time.BusinessClock;
import com.ppms.shift.ShiftRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Automatically transitions open shifts when their configured window has ended.
 *
 * Runs every 5 minutes. For each open shift:
 *   - If the current time has passed the definition's end time → OPEN_OVERDUE (grace cycle)
 *   - If the shift was already OPEN_OVERDUE → AUTO_CLOSED_OVERDUE (force-close)
 *
 * Each shift is processed in its own transaction under a row lock (see OverdueShiftProcessor),
 * so one failing shift does not block the rest and a concurrent manual close is never overwritten.
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
    private final OverdueShiftProcessor overdueShiftProcessor;
    private final BusinessClock businessClock;

    @Scheduled(cron = "0 */5 * * * *")
    @SchedulerLock(name = "OverdueShiftJob", lockAtMostFor = "PT5M", lockAtLeastFor = "PT1M")
    public void processOverdueShifts() {
        OffsetDateTime now = businessClock.now();
        List<Long> openShiftIds = shiftRepository.findAllOpenShiftIds();

        int markedOverdue = 0;
        int autoClosed    = 0;
        int failed        = 0;

        for (Long shiftId : openShiftIds) {
            try {
                switch (overdueShiftProcessor.process(shiftId, now)) {
                    case MARKED_OVERDUE -> markedOverdue++;
                    case AUTO_CLOSED -> autoClosed++;
                    case UNCHANGED -> { }
                }
            } catch (Exception e) {
                log.error("OverdueShiftJob failed for shift={}: {}", shiftId, e.getMessage(), e);
                failed++;
            }
        }

        if (markedOverdue > 0 || autoClosed > 0 || failed > 0) {
            log.info("OverdueShiftJob: markedOverdue={}, autoClosed={}, failed={}", markedOverdue, autoClosed, failed);
        }
    }
}
