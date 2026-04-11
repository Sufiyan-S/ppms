package com.ppms.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByPumpIdOrderByCreatedAtDesc(Long pumpId);

    List<Notification> findByPumpIdAndReadAtIsNullOrderByCreatedAtDesc(Long pumpId);

    boolean existsByPumpIdAndDedupKey(Long pumpId, String dedupKey);

    @Modifying
    @Query("UPDATE Notification n SET n.readAt = CURRENT_TIMESTAMP WHERE n.pumpId = :pumpId AND n.readAt IS NULL")
    int markAllReadForPump(Long pumpId);
}
