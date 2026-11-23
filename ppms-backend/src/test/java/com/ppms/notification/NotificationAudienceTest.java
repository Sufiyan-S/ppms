package com.ppms.notification;

import com.ppms.user.UserRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationAudienceTest {

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"OWNER", "ADMIN", "MANAGER"})
    void pumpManagementReceivesEveryType(UserRole role) {
        assertThat(NotificationAudience.typesVisibleTo(role)).containsExactlyInAnyOrder(NotificationType.values());
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"OPERATOR", "ACCOUNTANT"})
    void operatorsAndAccountantsReceiveOnlyStockAlerts(UserRole role) {
        assertThat(NotificationAudience.typesVisibleTo(role))
                .containsExactlyInAnyOrder(NotificationType.LOW_STOCK, NotificationType.ANCILLARY_LOW_STOCK);
    }

    @Test
    void operatorsNeverReceiveShiftIntegrityAlerts() {
        assertThat(NotificationAudience.typesVisibleTo(UserRole.OPERATOR)).doesNotContain(
                NotificationType.ZERO_SALE_SHIFT, NotificationType.AUTO_CLOSED_SHIFT, NotificationType.SHIFT_OVERDUE,
                NotificationType.PRICE_STALE, NotificationType.PRICE_CHANGE_OPEN_SHIFT, NotificationType.CALIBRATION_DUE,
                NotificationType.CALIBRATION_DUE_SOON, NotificationType.DOCUMENT_EXPIRING, NotificationType.SETTLEMENT_REMINDER);
    }
}
