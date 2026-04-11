package com.ppms.scheduler;

import com.ppms.notification.NotificationService;
import com.ppms.pump.PumpLocationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Generates in-app notifications for all pumps on a 5-minute schedule.
 *
 * Previously, notifications were generated inline on the GET /notifications request.
 * That approach blocked the API response with potentially expensive state checks
 * (tank stock queries, document expiry scans, shift analysis).
 *
 * Now generation runs in the background, and the API endpoint serves pre-computed
 * results from the DB — making the poll response fast and O(1) regardless of pump
 * data volume.
 *
 * ShedLock prevents multiple pods from running the same generation cycle concurrently
 * and creating duplicate notifications (the DB unique constraint also acts as a safety net).
 *
 * Failure isolation: if one pump's generation throws an exception, the job logs the error
 * and continues to the next pump. A single faulty pump cannot block all others.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationGenerationJob {

    private final NotificationService    notificationService;
    private final PumpLocationRepository pumpLocationRepository;

    /**
     * Runs every 5 minutes.
     * lockAtMostFor: maximum lock hold time if this pod crashes mid-run (safety net).
     * lockAtLeastFor: minimum time the lock is held to debounce rapid re-triggers.
     */
    @Scheduled(fixedDelay = 5 * 60 * 1000)   // 5 minutes in milliseconds
    @SchedulerLock(name = "NotificationGenerationJob", lockAtMostFor = "PT4M", lockAtLeastFor = "PT1M")
    public void generateNotificationsForAllPumps() {
        var pumps = pumpLocationRepository.findAll();
        log.debug("NotificationGenerationJob started: processing {} pumps", pumps.size());

        int succeeded = 0;
        int failed = 0;

        for (var pump : pumps) {
            try {
                notificationService.generateNotificationsForPump(pump.getId());
                succeeded++;
            } catch (Exception e) {
                // Log error for this pump but continue processing others
                log.error("Failed to generate notifications for pump={}: {}", pump.getId(), e.getMessage(), e);
                failed++;
            }
        }

        log.info("NotificationGenerationJob complete: succeeded={}, failed={}", succeeded, failed);
    }
}
