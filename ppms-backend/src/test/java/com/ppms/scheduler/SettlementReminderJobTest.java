package com.ppms.scheduler;

import com.ppms.notification.NotificationDedupService;
import com.ppms.notification.NotificationType;
import com.ppms.settlement.PaymentSettlementConfig;
import com.ppms.settlement.PaymentSettlementConfigRepository;
import com.ppms.settlement.SettlementPaymentType;
import com.ppms.support.FixedBusinessClock;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SettlementReminderJobTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 10);
    private static final Long PUMP_ID = 3L;

    private final PaymentSettlementConfigRepository configRepository = mock(PaymentSettlementConfigRepository.class);
    private final NotificationDedupService dedupService = mock(NotificationDedupService.class);

    @Test
    void noReminderIsRaisedBeforeTheAlertTime() {
        givenUpiAlertAt("18:00");

        jobRunningAt("17:59").fireReminders();

        verify(dedupService, never()).maybeInsert(any(), any(), anyString(), anyString(), anyString());
    }

    @Test
    void reminderIsRaisedFromTheAlertTimeOnwardsUnderOneKeyPerPumpTypeAndDay() {
        givenUpiAlertAt("18:00");

        jobRunningAt("18:00").fireReminders();

        verify(dedupService).maybeInsert(eq(PUMP_ID), eq(NotificationType.SETTLEMENT_REMINDER),
                eq("SETTLEMENT_REMINDER:UPI:" + PUMP_ID + ":" + TODAY), eq("UPI Settlement Reminder"), anyString());
    }

    @Test
    void alertTimeIsComparedInIndianTimeWhateverZoneTheServerClockUses() {
        givenUpiAlertAt("18:00");
        OffsetDateTime sixPmIstSeenFromUtc = LocalDateTime.of(TODAY, LocalTime.parse("12:30"))
                .atZone(ZoneId.of("UTC")).toOffsetDateTime();

        new SettlementReminderJob(configRepository, dedupService, new FixedBusinessClock(sixPmIstSeenFromUtc))
                .fireReminders();

        verify(dedupService).maybeInsert(eq(PUMP_ID), eq(NotificationType.SETTLEMENT_REMINDER),
                eq("SETTLEMENT_REMINDER:UPI:" + PUMP_ID + ":" + TODAY), anyString(), anyString());
    }

    private void givenUpiAlertAt(String alertTime) {
        when(configRepository.findByEnabledTrue()).thenReturn(List.of(PaymentSettlementConfig.builder()
                .pumpId(PUMP_ID)
                .paymentType(SettlementPaymentType.UPI)
                .alertTime(LocalTime.parse(alertTime))
                .enabled(true)
                .build()));
    }

    private SettlementReminderJob jobRunningAt(String time) {
        OffsetDateTime now = LocalDateTime.of(TODAY, LocalTime.parse(time))
                .atZone(ZoneId.of("Asia/Kolkata")).toOffsetDateTime();
        return new SettlementReminderJob(configRepository, dedupService, new FixedBusinessClock(now));
    }
}
