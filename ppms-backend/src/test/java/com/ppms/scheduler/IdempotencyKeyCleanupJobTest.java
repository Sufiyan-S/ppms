package com.ppms.scheduler;

import com.ppms.common.idempotency.IdempotencyService;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IdempotencyKeyCleanupJobTest {

    private final IdempotencyService idempotencyService = mock(IdempotencyService.class);
    private final IdempotencyKeyCleanupJob job = new IdempotencyKeyCleanupJob(idempotencyService);

    @Test
    void keepsDeletingKeysOlderThan48HoursWhileFullBatchesComeBack() {
        when(idempotencyService.deleteBatchOlderThanHours(48, IdempotencyKeyCleanupJob.BATCH_SIZE))
                .thenReturn(IdempotencyKeyCleanupJob.BATCH_SIZE, IdempotencyKeyCleanupJob.BATCH_SIZE, 12);

        job.deleteOldKeys();

        verify(idempotencyService, times(3)).deleteBatchOlderThanHours(48, IdempotencyKeyCleanupJob.BATCH_SIZE);
    }
}
