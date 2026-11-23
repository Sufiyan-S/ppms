package com.ppms.notification;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

/** One user has read one notification. A notification without a row for a user is unread for that user. */
@Entity
@Table(name = "notification_reads",
       uniqueConstraints = @UniqueConstraint(columnNames = {"notification_id", "user_id"}))
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationRead {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "notification_id", nullable = false)
    private Long notificationId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "read_at", nullable = false)
    private OffsetDateTime readAt;
}
