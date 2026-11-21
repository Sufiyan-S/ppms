package com.ppms.scheduler;

import com.ppms.common.time.BusinessClock;
import com.ppms.credit.CreditExtensionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marks credit extensions whose expiry date has passed as EXPIRED once a day.
 * Reads already ignore such rows, so this only keeps the stored status accurate for listings.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CreditExtensionExpiryJob {

    private final CreditExtensionRepository extensionRepository;
    private final BusinessClock businessClock;

    @Scheduled(cron = "0 5 0 * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "CreditExtensionExpiryJob", lockAtMostFor = "PT10M", lockAtLeastFor = "PT1M")
    @Transactional
    public void expireOverdueExtensions() {
        int expired = extensionRepository.expireOverdueExtensions(businessClock.today());
        log.info("CreditExtensionExpiryJob expired {} credit extensions", expired);
    }
}
