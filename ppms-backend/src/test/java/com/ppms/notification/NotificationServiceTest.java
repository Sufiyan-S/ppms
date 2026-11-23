package com.ppms.notification;

import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.common.time.BusinessClock;
import com.ppms.document.PumpDocument;
import com.ppms.document.PumpDocumentRepository;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleCalibrationLog;
import com.ppms.pump.NozzleCalibrationLogRepository;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.shift.ShiftRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationServiceTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final Long PUMP_ID = 3L;

    private final UndergroundTankRepository tankRepository = mock(UndergroundTankRepository.class);
    private final PumpDocumentRepository documentRepository = mock(PumpDocumentRepository.class);
    private final NotificationDedupService dedupService = mock(NotificationDedupService.class);
    private final NozzleCalibrationLogRepository calibrationLogRepository = mock(NozzleCalibrationLogRepository.class);
    private final NozzleRepository nozzleRepository = mock(NozzleRepository.class);
    private LocalDate today = LocalDate.of(2026, 3, 6);

    private final NotificationService notificationService = new NotificationService(
            mock(NotificationRepository.class), documentRepository, mock(GlobalFuelPriceRepository.class),
            mock(ShiftRepository.class), mock(AncillaryProductRepository.class), tankRepository,
            calibrationLogRepository, nozzleRepository, dedupService, movableClock());

    @Test
    void tankThatStaysLowAlertsAgainTheNextDay() {
        when(tankRepository.findByPumpId(PUMP_ID)).thenReturn(List.of(UndergroundTank.builder()
                .id(21L).pumpId(PUMP_ID).tankIdentifier("T1").fuelType(FuelType.PETROL)
                .capacity(new BigDecimal("10000")).currentStock(new BigDecimal("500"))
                .status(TankStatus.ACTIVE).build()));

        notificationService.generateNotificationsForPump(PUMP_ID);
        today = today.plusDays(1);
        notificationService.generateNotificationsForPump(PUMP_ID);

        ArgumentCaptor<LocalDate> days = ArgumentCaptor.forClass(LocalDate.class);
        verify(dedupService, times(2)).insertDaily(eq(PUMP_ID), eq(NotificationType.LOW_STOCK),
                eq("LOW_STOCK:tank:21"), days.capture(), eq("Low Tank Stock"), anyString(), anyMap());
        assertThat(days.getAllValues()).containsExactly(LocalDate.of(2026, 3, 6), LocalDate.of(2026, 3, 7));
    }

    @Test
    void documentAlertsAgainWhenItMovesFromExpiringToExpiredAndWhenRenewed() {
        PumpDocument licence = PumpDocument.builder()
                .id(5L).pumpId(PUMP_ID).name("Licence").docType("LICENCE")
                .expiryDate(today.plusDays(10)).build();
        when(documentRepository.findByPumpIdOrderByExpiryDateAsc(eq(PUMP_ID), any())).thenReturn(List.of(licence));

        notificationService.generateNotificationsForPump(PUMP_ID);
        today = today.plusDays(11);
        notificationService.generateNotificationsForPump(PUMP_ID);
        licence.setExpiryDate(today.plusDays(20));
        notificationService.generateNotificationsForPump(PUMP_ID);

        assertThat(keysSentFor(NotificationType.DOCUMENT_EXPIRING)).containsExactly(
                "DOCUMENT_EXPIRING:doc:5:2026-03-16:SOON",
                "DOCUMENT_EXPIRING:doc:5:2026-03-16:EXPIRED",
                "DOCUMENT_EXPIRING:doc:5:2026-04-06:SOON");
    }

    @Test
    void calibrationDueWithinSevenDaysAlertsWithOneKeyPerNozzleAndDueDate() {
        LocalDate due = today.plusDays(7);
        when(calibrationLogRepository.findCalibrationsDueBetween(PUMP_ID, today, today.plusDays(7)))
                .thenReturn(List.of(NozzleCalibrationLog.builder().nozzleId(40L).nextCalibrationDue(due).build()));
        when(nozzleRepository.findAllById(any())).thenReturn(List.of(Nozzle.builder().id(40L).nozzleNumber(2).build()));

        notificationService.generateNotificationsForPump(PUMP_ID);

        ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
        verify(dedupService).maybeInsert(eq(PUMP_ID), eq(NotificationType.CALIBRATION_DUE_SOON),
                eq("CALIBRATION_DUE_SOON:nozzle:40:2026-03-13"), eq("Nozzle Calibration Due Soon"), message.capture(),
                eq(Map.of("nozzleNumber", 2, "dueDate", "2026-03-13", "daysLeft", 7L)));
        assertThat(message.getValue()).contains("Nozzle #2", "2026-03-13", "7 day(s) left");
    }

    @Test
    void overdueCalibrationAlertNamesTheNozzleNumberNotItsId() {
        LocalDate due = today.minusDays(2);
        when(calibrationLogRepository.findOverdueCalibrations(PUMP_ID, today))
                .thenReturn(List.of(NozzleCalibrationLog.builder().nozzleId(40L).nextCalibrationDue(due).build()));
        when(nozzleRepository.findAllById(any())).thenReturn(List.of(Nozzle.builder().id(40L).nozzleNumber(2).build()));

        notificationService.generateNotificationsForPump(PUMP_ID);

        ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
        verify(dedupService).maybeInsert(eq(PUMP_ID), eq(NotificationType.CALIBRATION_DUE),
                eq("CALIBRATION_DUE:nozzle:40:2026-03-04"), eq("Nozzle Calibration Overdue"), message.capture(), anyMap());
        assertThat(message.getValue()).contains("Nozzle #2", "2026-03-04").doesNotContain("#40");
    }

    private List<String> keysSentFor(NotificationType type) {
        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        verify(dedupService, atLeastOnce()).maybeInsert(eq(PUMP_ID), eq(type), keys.capture(), anyString(), anyString(), anyMap());
        return keys.getAllValues();
    }

    private BusinessClock movableClock() {
        return new BusinessClock() {
            @Override public ZoneId zone() { return IST; }
            @Override public OffsetDateTime now() { return today.atTime(10, 0).atZone(IST).toOffsetDateTime(); }
            @Override public LocalDate today() { return today; }
            @Override public OffsetDateTime startOfDay(LocalDate date) { return date.atStartOfDay(IST).toOffsetDateTime(); }
        };
    }
}
