package com.ppms.common.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Defines Prometheus counters for key business events.
 *
 * Counters increment monotonically and are scraped by Prometheus via /actuator/prometheus.
 * Grafana dashboards can be built on top of these to answer:
 *   - How many shifts were opened/closed in the last hour?
 *   - How many login failures are we seeing? (spike = brute-force attack)
 *   - How many credit payments were recorded?
 *   - How many bank statement lines were matched?
 *
 * How to use these beans in your service or controller:
 *   1. Inject the counter: @Autowired private Counter shiftOpenedCounter;
 *   2. Increment on the relevant event: shiftOpenedCounter.increment();
 *
 * Why not use @Timed or @Counted AOP annotations?
 * Method-level annotations count all invocations regardless of business outcome.
 * Manual increment gives you control to count only successful, committed events.
 */
@Configuration
public class MetricsConfig {

    // ── Authentication ────────────────────────────────────────────────────────

    @Bean
    public Counter loginSuccessCounter(MeterRegistry registry) {
        return Counter.builder("ppms.auth.login.success")
                .description("Number of successful login attempts")
                .register(registry);
    }

    @Bean
    public Counter loginFailureCounter(MeterRegistry registry) {
        return Counter.builder("ppms.auth.login.failure")
                .description("Number of failed login attempts — spikes may indicate brute-force")
                .register(registry);
    }

    // ── Shift lifecycle ───────────────────────────────────────────────────────

    @Bean
    public Counter shiftOpenedCounter(MeterRegistry registry) {
        return Counter.builder("ppms.shift.opened")
                .description("Number of shifts opened")
                .register(registry);
    }

    @Bean
    public Counter shiftClosedCounter(MeterRegistry registry) {
        return Counter.builder("ppms.shift.closed")
                .description("Number of shifts closed normally")
                .register(registry);
    }

    @Bean
    public Counter shiftAutoClosedCounter(MeterRegistry registry) {
        return Counter.builder("ppms.shift.auto_closed")
                .description("Number of shifts force-closed by the overdue job — high value = operators not submitting readings")
                .register(registry);
    }

    // ── Financial events ──────────────────────────────────────────────────────

    @Bean
    public Counter creditPaymentRecordedCounter(MeterRegistry registry) {
        return Counter.builder("ppms.credit.payment.recorded")
                .description("Number of credit payments recorded")
                .register(registry);
    }

    @Bean
    public Counter bankStatementImportedCounter(MeterRegistry registry) {
        return Counter.builder("ppms.bank.statement.imported")
                .description("Number of bank statement CSV files imported")
                .register(registry);
    }

    @Bean
    public Counter bankLineMatchedCounter(MeterRegistry registry) {
        return Counter.builder("ppms.bank.line.matched")
                .description("Number of bank statement lines matched or ignored")
                .register(registry);
    }
}
