package com.ppms.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByPumpIdOrderByCreatedAtDesc(Long pumpId);

    List<Notification> findByPumpIdAndReadAtIsNullOrderByCreatedAtDesc(Long pumpId);

    boolean existsByPumpIdAndDedupKey(Long pumpId, String dedupKey);

    @Modifying
    @Query("UPDATE Notification n SET n.readAt = CURRENT_TIMESTAMP WHERE n.pumpId = :pumpId AND n.readAt IS NULL")
    int markAllReadForPump(Long pumpId);

    /**
     * Atomically inserts a notification if no row with the same (pump_id, dedup_key) exists.
     * ON CONFLICT DO NOTHING handles duplicates at the DB level — no exception is ever thrown,
     * regardless of race conditions between concurrent requests.
     *
     * This is the correct pattern for PostgreSQL: catching DataIntegrityViolationException
     * inside a @Transactional method does NOT work because PostgreSQL aborts the entire
     * transaction on any statement failure, causing UnexpectedRollbackException on commit.
     */
    @Modifying
    @Query(value = """
            INSERT INTO notifications (pump_id, type, title, message, dedup_key, created_at)
            VALUES (:pumpId, CAST(:type AS notification_type), :title, :message, :dedupKey, NOW())
            ON CONFLICT (pump_id, dedup_key) DO NOTHING
            """, nativeQuery = true)
    void insertIfNotExists(
            @Param("pumpId") Long pumpId,
            @Param("type") String type,
            @Param("title") String title,
            @Param("message") String message,
            @Param("dedupKey") String dedupKey
    );
}
