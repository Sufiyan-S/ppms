package com.ppms.notification;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationDedupService {

    private final NotificationRepository notificationRepository;

    public void maybeInsert(Long pumpId, NotificationType type, String dedupKey, String title, String message) {
        if (notificationRepository.existsByPumpIdAndDedupKey(pumpId, dedupKey)) {
            return;
        }

        Notification notification = Notification.builder()
                .pumpId(pumpId)
                .type(type)
                .title(title)
                .message(message)
                .dedupKey(dedupKey)
                .build();
        notificationRepository.save(notification);
        log.debug("Notification created: pump={} type={} key={}", pumpId, type, dedupKey);
    }
}
