package com.ppms.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    /** Newest notifications of the given types that this user has not read yet. */
    @Query("""
            SELECT n FROM Notification n
            WHERE n.pumpId = :pumpId
              AND n.type IN :types
              AND NOT EXISTS (SELECT 1 FROM NotificationRead r WHERE r.notificationId = n.id AND r.userId = :userId)
            ORDER BY n.createdAt DESC
            """)
    List<Notification> findUnreadForUser(@Param("pumpId") Long pumpId,
                                         @Param("userId") Long userId,
                                         @Param("types") Collection<NotificationType> types,
                                         Pageable pageable);

    @Query("""
            SELECT COUNT(n) FROM Notification n
            WHERE n.pumpId = :pumpId
              AND n.type IN :types
              AND NOT EXISTS (SELECT 1 FROM NotificationRead r WHERE r.notificationId = n.id AND r.userId = :userId)
            """)
    long countUnreadForUser(@Param("pumpId") Long pumpId,
                            @Param("userId") Long userId,
                            @Param("types") Collection<NotificationType> types);

    /** Every notification of the given types for a pump, read or not, newest first. */
    @Query("""
            SELECT n FROM Notification n
            WHERE n.pumpId = :pumpId
              AND n.type IN :types
            ORDER BY n.createdAt DESC, n.id DESC
            """)
    Page<Notification> findHistory(@Param("pumpId") Long pumpId,
                                   @Param("types") Collection<NotificationType> types,
                                   Pageable pageable);

    /** Which of the given notifications this user has read. */
    @Query("""
            SELECT r.notificationId FROM NotificationRead r
            WHERE r.userId = :userId AND r.notificationId IN :notificationIds
            """)
    Set<Long> findReadIdsForUser(@Param("userId") Long userId,
                                 @Param("notificationIds") Collection<Long> notificationIds);

    boolean existsByPumpIdAndDedupKey(Long pumpId, String dedupKey);

    /** Records a read for this user only, and only for notifications of this pump and of types the user may see. */
    @Modifying
    @Query(value = """
            INSERT INTO notification_reads (notification_id, user_id, read_at)
            SELECT n.id, :userId, NOW()
            FROM notifications n
            WHERE n.pump_id = :pumpId
              AND n.id IN (:ids)
              AND CAST(n.type AS TEXT) IN (:types)
            ON CONFLICT (notification_id, user_id) DO NOTHING
            """, nativeQuery = true)
    int markReadForUser(@Param("pumpId") Long pumpId,
                        @Param("userId") Long userId,
                        @Param("ids") List<Long> ids,
                        @Param("types") Collection<String> types);

    /**
     * Deletes up to {@code batchSize} notifications that someone first read before {@code readBefore};
     * uses idx_notification_reads_read_at. Their read rows go with them (ON DELETE CASCADE).
     */
    @Modifying
    @Query(value = """
            DELETE FROM notifications
            WHERE id IN (
                SELECT DISTINCT r.notification_id FROM notification_reads r
                WHERE r.read_at < :readBefore
                LIMIT :batchSize
            )
            """, nativeQuery = true)
    int deleteReadBefore(@Param("readBefore") OffsetDateTime readBefore, @Param("batchSize") int batchSize);

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
            INSERT INTO notifications (pump_id, type, title, message, dedup_key, params, created_at)
            VALUES (:pumpId, CAST(:type AS notification_type), :title, :message, :dedupKey, CAST(:params AS jsonb), NOW())
            ON CONFLICT (pump_id, dedup_key) DO NOTHING
            """, nativeQuery = true)
    int insertIfNotExists(
            @Param("pumpId") Long pumpId,
            @Param("type") String type,
            @Param("title") String title,
            @Param("message") String message,
            @Param("dedupKey") String dedupKey,
            @Param("params") String params
    );

    /** Deletes this pump's notifications whose dedup key starts with {@code seriesPrefix}, except {@code keptKey}. */
    @Modifying
    @Query(value = """
            DELETE FROM notifications
            WHERE pump_id = :pumpId
              AND LEFT(dedup_key, LENGTH(:seriesPrefix)) = :seriesPrefix
              AND dedup_key <> :keptKey
            """, nativeQuery = true)
    int deleteSeriesExcept(@Param("pumpId") Long pumpId,
                           @Param("seriesPrefix") String seriesPrefix,
                           @Param("keptKey") String keptKey);
}
