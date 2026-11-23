package com.ppms.notification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationDedupService {

    private final NotificationRepository notificationRepository;
    private final ObjectMapper objectMapper;

    /**
     * Inserts a notification if no row with the same (pump_id, dedup_key) exists.
     *
     * Uses INSERT ... ON CONFLICT DO NOTHING so the dedup is handled atomically at the DB
     * level. This is the only reliable approach for PostgreSQL: catching
     * DataIntegrityViolationException inside a @Transactional method does not work because
     * PostgreSQL aborts the entire transaction on any statement failure, which causes
     * UnexpectedRollbackException when Spring tries to commit.
     *
     * {@code params} are the values the English text was built from, kept so screens can show it in another language.
     */
    @Transactional
    public void maybeInsert(Long pumpId, NotificationType type, String dedupKey, String title, String message,
                            Map<String, Object> params) {
        notificationRepository.insertIfNotExists(pumpId, type.name(), title, message, dedupKey, toJson(params));
        log.debug("Notification upsert attempted: pump={} type={} key={}", pumpId, type, dedupKey);
    }

    /**
     * Inserts the notification of a condition that re-alerts every day, keyed {@code seriesKey:day}, and
     * removes that series' earlier days. Each user reads notifications separately, so without the removal
     * an unread alert from yesterday sits next to today's identical one in the bell.
     */
    @Transactional
    public void insertDaily(Long pumpId, NotificationType type, String seriesKey, LocalDate day,
                            String title, String message, Map<String, Object> params) {
        String dedupKey = seriesKey + ":" + day;
        if (notificationRepository.insertIfNotExists(pumpId, type.name(), title, message, dedupKey, toJson(params)) == 0) {
            return;
        }
        int replaced = notificationRepository.deleteSeriesExcept(pumpId, seriesKey + ":", dedupKey);
        log.debug("Daily notification inserted: pump={} type={} key={} replacedEarlier={}", pumpId, type, dedupKey, replaced);
    }

    private String toJson(Map<String, Object> params) {
        try {
            return objectMapper.writeValueAsString(params);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialise notification params " + params.keySet() + " to JSON", e);
        }
    }
}
