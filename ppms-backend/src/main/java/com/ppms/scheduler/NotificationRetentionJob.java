package com.ppms.scheduler;

import com.ppms.notification.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily clean-up of notifications that someone first read more than 90 days ago, so the table does not grow forever.
 * Notifications nobody has read are never deleted.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationRetentionJob {

    private static final int RETENTION_DAYS = 90;
    private static final int BATCH_SIZE = 5_000;

    private final NotificationService notificationService;

    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "NotificationRetentionJob", lockAtMostFor = "PT10M", lockAtLeastFor = "PT1M")
    public void deleteOldReadNotifications() {
        int deleted = 0;
        int deletedInBatch;
        do {
            deletedInBatch = notificationService.deleteReadBatchOlderThan(RETENTION_DAYS, BATCH_SIZE);
            deleted += deletedInBatch;
        } while (deletedInBatch == BATCH_SIZE);
        log.info("NotificationRetentionJob deleted {} notifications read more than {} days ago", deleted, RETENTION_DAYS);
    }
}
