package com.ppms.scheduler;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/**
 * Configures ShedLock for all scheduled jobs in this application.
 *
 * ShedLock prevents the same job from running concurrently across multiple pods by writing
 * a distributed lock row to the shedlock table (created by V13 migration).
 *
 * defaultLockAtMostFor: the lock is held for at most 10 minutes. If a pod crashes mid-job,
 * ShedLock will auto-release the lock after this duration so another pod can pick it up.
 */
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
public class SchedulerConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(new JdbcTemplate(dataSource))
                        .usingDbTime()   // use DB server time to avoid clock-skew issues between pods
                        .build()
        );
    }
}
