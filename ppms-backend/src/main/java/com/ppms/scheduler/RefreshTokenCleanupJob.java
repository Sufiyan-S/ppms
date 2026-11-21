package com.ppms.scheduler;

import com.ppms.auth.RefreshTokenService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily clean-up of refresh tokens that expired or were revoked more than a day ago.
 * Used but still unexpired tokens are kept, because reuse detection needs them.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RefreshTokenCleanupJob {

    private static final int RETENTION_DAYS = 1;
    private static final int BATCH_SIZE = 5_000;

    private final RefreshTokenService refreshTokenService;

    @Scheduled(cron = "0 45 3 * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "RefreshTokenCleanupJob", lockAtMostFor = "PT10M", lockAtLeastFor = "PT1M")
    public void deleteExpiredAndRevokedTokens() {
        int deleted = 0;
        int deletedInBatch;
        do {
            deletedInBatch = refreshTokenService.deleteExpiredOrRevokedBatchOlderThan(RETENTION_DAYS, BATCH_SIZE);
            deleted += deletedInBatch;
        } while (deletedInBatch == BATCH_SIZE);
        log.info("RefreshTokenCleanupJob deleted {} refresh tokens expired or revoked more than {} day ago", deleted, RETENTION_DAYS);
    }
}
