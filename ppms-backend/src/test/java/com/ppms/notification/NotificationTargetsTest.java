package com.ppms.notification;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTargetsTest {

    @Test
    void pageLevelAlertsOpenTheirPage() {
        assertThat(NotificationTargets.targetOf(NotificationType.SETTLEMENT_REMINDER, "SETTLEMENT_REMINDER:UPI:3:2026-11-20"))
                .isEqualTo(new NotificationTarget("/dashboard/settlements", Map.of()));
        assertThat(NotificationTargets.targetOf(NotificationType.LOW_STOCK, "LOW_STOCK:tank:4:2026-11-20"))
                .isEqualTo(new NotificationTarget("/dashboard/inventory", Map.of()));
        assertThat(NotificationTargets.targetOf(NotificationType.CALIBRATION_DUE, "CALIBRATION_DUE:nozzle:2:2026-11-20").route())
                .isEqualTo("/dashboard/calibration");
        assertThat(NotificationTargets.targetOf(NotificationType.CALIBRATION_DUE_SOON, "CALIBRATION_DUE_SOON:nozzle:2:2026-11-27").route())
                .isEqualTo("/dashboard/calibration");
        assertThat(NotificationTargets.targetOf(NotificationType.DOCUMENT_EXPIRING, "DOCUMENT_EXPIRING:doc:9:2026-12-01:SOON").route())
                .isEqualTo("/dashboard/documents");
        assertThat(NotificationTargets.targetOf(NotificationType.ANCILLARY_LOW_STOCK, "ANCILLARY_LOW_STOCK:product:5:2026-11-20").route())
                .isEqualTo("/dashboard/ancillary");
    }

    @Test
    void stalePricesOpenThePricesSectionOfSetup() {
        assertThat(NotificationTargets.targetOf(NotificationType.PRICE_STALE, "PRICE_STALE:2026-11-20"))
                .isEqualTo(new NotificationTarget("/dashboard/setup", Map.of("section", "prices")));
    }

    @ParameterizedTest
    @EnumSource(value = NotificationType.class, names = {"ZERO_SALE_SHIFT", "AUTO_CLOSED_SHIFT", "SHIFT_OVERDUE"})
    void shiftAlertsOpenTheShiftNamedInTheirKey(NotificationType type) {
        assertThat(NotificationTargets.targetOf(type, type + ":shift:123"))
                .isEqualTo(new NotificationTarget("/dashboard/shifts", Map.of("shift", "123")));
    }

    @Test
    void shiftAlertWithoutAShiftIdOpensTheShiftsPage() {
        assertThat(NotificationTargets.targetOf(NotificationType.PRICE_CHANGE_OPEN_SHIFT, "PRICE_CHANGE_OPEN_SHIFT:2026-11-20:3"))
                .isEqualTo(new NotificationTarget("/dashboard/shifts", Map.of()));
        assertThat(NotificationTargets.targetOf(NotificationType.SHIFT_OVERDUE, null))
                .isEqualTo(new NotificationTarget("/dashboard/shifts", Map.of()));
    }

    @ParameterizedTest
    @EnumSource(NotificationType.class)
    void everyTypeHasATargetInsideTheDashboard(NotificationType type) {
        assertThat(NotificationTargets.targetOf(type, type + ":test").route()).startsWith("/dashboard/");
    }
}
