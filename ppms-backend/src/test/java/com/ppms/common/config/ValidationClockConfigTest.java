package com.ppms.common.config;

import com.ppms.support.FixedBusinessClock;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.PastOrPresent;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class ValidationClockConfigTest {

    record DatedRequest(@PastOrPresent LocalDate date) {
    }

    @Test
    void todayInIndiaIsNotAFutureDateWhileTheServerZoneIsStillOnYesterday() {
        ZoneId india = ZoneId.of("Asia/Kolkata");
        ZoneId wellBehindIndia = ZoneOffset.ofHours(-12);
        LocalDate todayInIndia = LocalDate.now(india);
        // Holds at every hour of the day: a zone 17.5 hours behind India is never ahead of it.
        assertThat(LocalDate.now(wellBehindIndia)).isBeforeOrEqualTo(todayInIndia);

        var configuration = Validation.byDefaultProvider().configure();
        new ValidationClockConfig()
                .businessZoneValidationClock(new FixedBusinessClock(OffsetDateTime.now(india)))
                .customize(configuration);
        Validator validator = configuration.buildValidatorFactory().getValidator();

        assertThat(validator.validate(new DatedRequest(todayInIndia))).isEmpty();
        assertThat(validator.validate(new DatedRequest(todayInIndia.plusDays(1)))).hasSize(1);
    }
}
