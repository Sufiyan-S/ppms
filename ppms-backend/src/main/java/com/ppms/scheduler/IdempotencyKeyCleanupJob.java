package com.ppms.scheduler;

import com.ppms.common.idempotency.IdempotencyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Daily clean-up of idempotency keys; clients only retry within minutes, so 48 hours is ample. */
@Slf4j
@Component
@RequiredArgsConstructor
public class IdempotencyKeyCleanupJob {

    static final int RETENTION_HOURS = 48;
    static final int BATCH_SIZE = 5_000;

    private final IdempotencyService idempotencyService;

    @Scheduled(cron = "0 50 3 * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "IdempotencyKeyCleanupJob", lockAtMostFor = "PT10M", lockAtLeastFor = "PT1M")
    public void deleteOldKeys() {
        int deleted = 0;
        int deletedInBatch;
        do {
            deletedInBatch = idempotencyService.deleteBatchOlderThanHours(RETENTION_HOURS, BATCH_SIZE);
            deleted += deletedInBatch;
        } while (deletedInBatch == BATCH_SIZE);
        log.info("IdempotencyKeyCleanupJob deleted {} idempotency keys older than {} hours", deleted, RETENTION_HOURS);
    }
}
