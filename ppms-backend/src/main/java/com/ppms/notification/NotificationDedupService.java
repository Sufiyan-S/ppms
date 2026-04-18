package com.ppms.notification;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationDedupService {

    private final NotificationRepository notificationRepository;

    /**
     * Inserts a notification if one with the same (pump_id, dedup_key) does not already exist.
     *
     * Uses PROPAGATION_REQUIRES_NEW so that a DataIntegrityViolationException from a race
     * condition (two fuel-type saves submitted simultaneously with the same dedup key) is caught
     * and swallowed within its own transaction — preventing it from rolling back the parent
     * transaction (the price save) and surfacing as a user-visible 409 error.
     *
     * Race condition scenario:
     *   POST /fuel-prices for Petrol and POST /fuel-prices for Diesel arrive simultaneously.
     *   Both generate the same dedup_key (keyed on pump_id, not fuel_type).
     *   Both pass the existsByPumpIdAndDedupKey check before either commits.
     *   The second insert hits the UNIQUE (pump_id, dedup_key) constraint — caught here.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void maybeInsert(Long pumpId, NotificationType type, String dedupKey, String title, String message) {
        if (notificationRepository.existsByPumpIdAndDedupKey(pumpId, dedupKey)) {
            return;
        }
        try {
            Notification notification = Notification.builder()
                    .pumpId(pumpId)
                    .type(type)
                    .title(title)
                    .message(message)
                    .dedupKey(dedupKey)
                    .build();
            notificationRepository.saveAndFlush(notification);
            log.debug("Notification created: pump={} type={} key={}", pumpId, type, dedupKey);
        } catch (DataIntegrityViolationException e) {
            // Another concurrent request already inserted this notification — safely ignore.
            log.debug("Duplicate notification skipped (race condition): pump={} key={}", pumpId, dedupKey);
        }
    }
}
