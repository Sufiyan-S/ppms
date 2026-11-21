package com.ppms.common.config;

import com.ppms.common.time.BusinessClock;
import org.springframework.boot.autoconfigure.validation.ValidationConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ValidationClockConfig {

    // @PastOrPresent and @Future on dates must judge "today" in the business zone, not the JVM's.
    @Bean
    public ValidationConfigurationCustomizer businessZoneValidationClock(BusinessClock businessClock) {
        return configuration -> configuration.clockProvider(() -> Clock.system(businessClock.zone()));
    }
}
