package com.ppms.common.time;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

@Component
public class DefaultBusinessClock implements BusinessClock {

    private final ZoneId zone;

    public DefaultBusinessClock(@Value("${ppms.time-zone:Asia/Kolkata}") String zoneId) {
        this.zone = ZoneId.of(zoneId);
    }

    @Override
    public ZoneId zone() {
        return zone;
    }

    @Override
    public OffsetDateTime now() {
        return OffsetDateTime.now(zone);
    }

    @Override
    public LocalDate today() {
        return LocalDate.now(zone);
    }

    @Override
    public OffsetDateTime startOfDay(LocalDate date) {
        return date.atStartOfDay(zone).toOffsetDateTime();
    }
}
