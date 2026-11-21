package com.ppms.notification;

import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.common.time.BusinessClock;
import com.ppms.document.PumpDocument;
import com.ppms.document.PumpDocumentRepository;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.NozzleCalibrationLogRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationServiceTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final Long PUMP_ID = 3L;

    private final UndergroundTankRepository tankRepository = mock(UndergroundTankRepository.class);
    private final PumpDocumentRepository documentRepository = mock(PumpDocumentRepository.class);
    private final NotificationDedupService dedupService = mock(NotificationDedupService.class);
    private LocalDate today = LocalDate.of(2026, 3, 6);

    private final NotificationService notificationService = new NotificationService(
            mock(NotificationRepository.class), documentRepository, mock(GlobalFuelPriceRepository.class),
            mock(ShiftRepository.class), mock(AncillaryProductRepository.class), tankRepository,
            mock(NozzleCalibrationLogRepository.class), dedupService, movableClock());

    @Test
    void tankThatStaysLowAlertsAgainTheNextDay() {
        when(tankRepository.findByPumpId(PUMP_ID)).thenReturn(List.of(UndergroundTank.builder()
                .id(21L).pumpId(PUMP_ID).tankIdentifier("T1").fuelType(FuelType.PETROL)
                .capacity(new BigDecimal("10000")).currentStock(new BigDecimal("500"))
                .status(TankStatus.ACTIVE).build()));

        notificationService.generateNotificationsForPump(PUMP_ID);
        today = today.plusDays(1);
        notificationService.generateNotificationsForPump(PUMP_ID);

        assertThat(keysSentFor(NotificationType.LOW_STOCK))
                .containsExactly("LOW_STOCK:tank:21:2026-03-06", "LOW_STOCK:tank:21:2026-03-07");
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

    private List<String> keysSentFor(NotificationType type) {
        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        verify(dedupService, atLeastOnce()).maybeInsert(eq(PUMP_ID), eq(type), keys.capture(), anyString(), anyString());
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
