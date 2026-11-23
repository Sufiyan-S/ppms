package com.ppms.notification;

import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** A daily alert keeps one current copy per pump and series, so an unread yesterday's copy never doubles up with today's. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({PostgresTestContainerConfig.class, NotificationDedupService.class, JacksonAutoConfiguration.class})
class NotificationDedupServiceTest {

    private static final LocalDate YESTERDAY = LocalDate.of(2026, 11, 9);
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 10);

    @Autowired private NotificationDedupService dedupService;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private UserRepository userRepository;

    private Long pumpId;
    private Long otherPumpId;

    @BeforeEach
    void createTwoPumps() {
        User owner = userRepository.save(User.builder()
                .employeeId("EMP-" + shortId())
                .fullName("Owner")
                .phoneNumber("8" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L))
                .passwordHash("hash")
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TestDates.today())
                .build());
        pumpId = savePump(owner).getId();
        otherPumpId = savePump(owner).getId();
    }

    @Test
    void todaysReminderReplacesYesterdaysUnreadOne() {
        upiReminder(pumpId, YESTERDAY);
        upiReminder(pumpId, TODAY);

        assertThat(dedupKeysOf(pumpId)).containsExactly(upiSeries(pumpId) + ":" + TODAY);
    }

    @Test
    void repeatedRunsOnTheSameDayKeepOneReminder() {
        upiReminder(pumpId, TODAY);
        upiReminder(pumpId, TODAY);

        assertThat(dedupKeysOf(pumpId)).containsExactly(upiSeries(pumpId) + ":" + TODAY);
    }

    @Test
    void otherSeriesAndOtherPumpsAreLeftAlone() {
        String cardSeries = "SETTLEMENT_REMINDER:CARD:" + pumpId;
        dedupService.insertDaily(pumpId, NotificationType.SETTLEMENT_REMINDER, cardSeries, YESTERDAY, "Card Settlement Reminder", "Record it",
                Map.of("paymentTypeCode", "CARD"));
        upiReminder(otherPumpId, YESTERDAY);

        upiReminder(pumpId, TODAY);

        assertThat(dedupKeysOf(pumpId)).containsExactlyInAnyOrder(cardSeries + ":" + YESTERDAY, upiSeries(pumpId) + ":" + TODAY);
        assertThat(dedupKeysOf(otherPumpId)).containsExactly(upiSeries(otherPumpId) + ":" + YESTERDAY);
    }

    private void upiReminder(Long pump, LocalDate day) {
        dedupService.insertDaily(pump, NotificationType.SETTLEMENT_REMINDER, upiSeries(pump), day,
                "UPI Settlement Reminder", "Record today's UPI settlement", Map.of("paymentTypeCode", "UPI"));
    }

    private static String upiSeries(Long pump) {
        return "SETTLEMENT_REMINDER:UPI:" + pump;
    }

    private List<String> dedupKeysOf(Long pump) {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getPumpId().equals(pump))
                .map(Notification::getDedupKey)
                .toList();
    }

    private PumpLocation savePump(User owner) {
        return pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId()).name("Pump " + shortId()).address("Address").maxDuCount(2).build());
    }

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
