package com.ppms.notification;

import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Per-user read state: one user's read never hides a notification from another, and reads go with their notification. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestContainerConfig.class)
class NotificationReadRepositoryTest {

    private static final Set<NotificationType> STOCK_ONLY = Set.of(NotificationType.LOW_STOCK);

    @Autowired private NotificationRepository notificationRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private EntityManager entityManager;

    private PumpLocation pump;
    private User reader;
    private User otherUser;

    @BeforeEach
    void createPumpAndTwoUsers() {
        User owner = saveUser(UserRole.OWNER, null);
        pump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId()).name("Pump " + shortId()).address("Address").maxDuCount(2).build());
        reader = saveUser(UserRole.MANAGER, pump.getId());
        otherUser = saveUser(UserRole.OPERATOR, pump.getId());
    }

    @Test
    void readIsRecordedOnceAndOnlyForTheReader() {
        long id = insertNotification(NotificationType.LOW_STOCK);

        assertThat(notificationRepository.markReadForUser(pump.getId(), reader.getId(), List.of(id), List.of("LOW_STOCK")))
                .isEqualTo(1);
        assertThat(notificationRepository.markReadForUser(pump.getId(), reader.getId(), List.of(id), List.of("LOW_STOCK")))
                .isZero();

        assertThat(unreadIds(reader)).doesNotContain(id);
        assertThat(unreadIds(otherUser)).contains(id);
        assertThat(notificationRepository.countUnreadForUser(pump.getId(), otherUser.getId(), STOCK_ONLY)).isEqualTo(1);
    }

    @Test
    void readOfATypeTheUserMayNotSeeIsNotRecorded() {
        long id = insertNotification(NotificationType.ZERO_SALE_SHIFT);

        assertThat(notificationRepository.markReadForUser(pump.getId(), otherUser.getId(), List.of(id), List.of("LOW_STOCK")))
                .isZero();
        assertThat(notificationRepository.findUnreadForUser(pump.getId(), otherUser.getId(), STOCK_ONLY, PageRequest.of(0, 10)))
                .isEmpty();
    }

    @Test
    void deletingAnOldReadNotificationAlsoDeletesItsReads() {
        long id = insertNotification(NotificationType.LOW_STOCK);
        notificationRepository.markReadForUser(pump.getId(), reader.getId(), List.of(id), List.of("LOW_STOCK"));
        notificationRepository.markReadForUser(pump.getId(), otherUser.getId(), List.of(id), List.of("LOW_STOCK"));
        entityManager.createNativeQuery("UPDATE notification_reads SET read_at = :readAt WHERE notification_id = :id")
                .setParameter("readAt", TestDates.now().minusDays(120))
                .setParameter("id", id)
                .executeUpdate();

        int deleted = notificationRepository.deleteReadBefore(TestDates.now().minusDays(90), 100);

        assertThat(deleted).isGreaterThanOrEqualTo(1);
        Number readsLeft = (Number) entityManager
                .createNativeQuery("SELECT COUNT(*) FROM notification_reads WHERE notification_id = :id")
                .setParameter("id", id)
                .getSingleResult();
        assertThat(readsLeft.longValue()).isZero();
    }

    private List<Long> unreadIds(User user) {
        return notificationRepository.findUnreadForUser(pump.getId(), user.getId(), STOCK_ONLY, PageRequest.of(0, 10))
                .stream()
                .map(Notification::getId)
                .toList();
    }

    private long insertNotification(NotificationType type) {
        String dedupKey = type + ":test:" + shortId();
        notificationRepository.insertIfNotExists(pump.getId(), type.name(), "Title", "Message", dedupKey, "{}");
        return notificationRepository.findAll().stream()
                .filter(notification -> dedupKey.equals(notification.getDedupKey()))
                .findFirst()
                .orElseThrow()
                .getId();
    }

    private User saveUser(UserRole role, Long pumpId) {
        String unique = shortId();
        return userRepository.save(User.builder()
                .employeeId("EMP-" + unique)
                .fullName(role + " " + unique)
                .phoneNumber("8" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L))
                .passwordHash("hash")
                .role(role)
                .status(UserStatus.ACTIVE)
                .assignedPumpId(pumpId)
                .dateOfJoining(TestDates.today())
                .build());
    }

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
