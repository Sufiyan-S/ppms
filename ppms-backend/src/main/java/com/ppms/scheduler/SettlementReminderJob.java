package com.ppms.scheduler;

import com.ppms.common.time.BusinessClock;
import com.ppms.notification.NotificationDedupService;
import com.ppms.notification.NotificationType;
import com.ppms.settlement.PaymentSettlementConfig;
import com.ppms.settlement.PaymentSettlementConfigRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

/**
 * Fires daily settlement reminder notifications after the configured alert time (per pump, per type).
 *
 * How it works:
 * 1. Runs every 5 minutes alongside NotificationGenerationJob.
 * 2. Loads all enabled settlement configs across all pumps.
 * 3. For each config, if the current IST time has reached or passed the configured alertTime,
 *    it calls NotificationDedupService with a date-scoped dedup key.
 * 4. The dedup key (SETTLEMENT_REMINDER:{type}:{pumpId}:{today}) guarantees exactly one
 *    notification per payment type per pump per calendar day — regardless of how many
 *    job runs occur after the alert fires — and today's reminder replaces earlier days' ones.
 *
 * The notification prompts Admin/Owner to record the day's settlement
 * (i.e. how much arrived in the bank account) before end of business.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SettlementReminderJob {

    private final PaymentSettlementConfigRepository configRepository;
    private final NotificationDedupService          dedupService;
    private final BusinessClock businessClock;

    @Scheduled(fixedDelay = 5 * 60 * 1000)   // every 5 minutes
    @SchedulerLock(name = "SettlementReminderJob", lockAtMostFor = "PT4M", lockAtLeastFor = "PT1M")
    public void fireReminders() {
        List<PaymentSettlementConfig> configs = configRepository.findByEnabledTrue();
        if (configs.isEmpty()) return;

        LocalDate today    = businessClock.today();
        LocalTime nowTime  = businessClock.now().toLocalTime();

        int fired = 0;
        for (PaymentSettlementConfig cfg : configs) {
            if (nowTime.isBefore(cfg.getAlertTime())) {
                // Alert time not reached yet for this config — skip
                continue;
            }

            String type      = cfg.getPaymentType().name();
            Long   pumpId    = cfg.getPumpId();
            String seriesKey = "SETTLEMENT_REMINDER:" + type + ":" + pumpId;
            String typeLabel = toLabel(type);

            dedupService.insertDaily(
                    pumpId,
                    NotificationType.SETTLEMENT_REMINDER,
                    seriesKey,
                    today,
                    typeLabel + " Settlement Reminder",
                    "Record today's " + typeLabel + " settlement — amount received in bank account. " +
                    "Go to Settlements to log the credit.",
                    Map.of("paymentTypeCode", type)
            );
            fired++;
        }

        if (fired > 0) {
            log.debug("SettlementReminderJob: {} reminder(s) processed", fired);
        }
    }

    private String toLabel(String type) {
        return switch (type) {
            case "UPI"        -> "UPI";
            case "CARD"       -> "Card";
            case "FLEET_CARD" -> "Fleet Card";
            default           -> type;
        };
    }
}
