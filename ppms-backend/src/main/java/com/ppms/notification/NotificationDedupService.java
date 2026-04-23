package com.ppms.notification;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationDedupService {

    private final NotificationRepository notificationRepository;

    /**
     * Inserts a notification if no row with the same (pump_id, dedup_key) exists.
     *
     * Uses INSERT ... ON CONFLICT DO NOTHING so the dedup is handled atomically at the DB
     * level. This is the only reliable approach for PostgreSQL: catching
     * DataIntegrityViolationException inside a @Transactional method does not work because
     * PostgreSQL aborts the entire transaction on any statement failure, which causes
     * UnexpectedRollbackException when Spring tries to commit.
     */
    @Transactional
    public void maybeInsert(Long pumpId, NotificationType type, String dedupKey, String title, String message) {
        notificationRepository.insertIfNotExists(pumpId, type.name(), title, message, dedupKey);
        log.debug("Notification upsert attempted: pump={} type={} key={}", pumpId, type, dedupKey);
    }
}
