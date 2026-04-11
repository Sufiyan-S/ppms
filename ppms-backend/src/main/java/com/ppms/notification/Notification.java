package com.ppms.notification;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

/**
 * In-app notification for the pump dashboard bell icon.
 *
 * Notifications are generated lazily (on demand when the user fetches the bell) rather than
 * by a background scheduler — this avoids an extra scheduler thread and keeps the system simple.
 *
 * The dedup_key unique constraint (pump_id, dedup_key) prevents duplicate alerts for the
 * same event. For example, a tank will only produce one LOW_STOCK notification until it
 * is restocked (at which point we can delete or mark the notification resolved).
 */
@Entity
@Table(name = "notifications",
       uniqueConstraints = @UniqueConstraint(columnNames = {"pump_id", "dedup_key"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "type", nullable = false)
    private NotificationType type;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "message", nullable = false)
    private String message;

    @Column(name = "dedup_key", nullable = false)
    private String dedupKey;

    @Column(name = "read_at")
    private OffsetDateTime readAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
