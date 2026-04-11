package com.ppms.scheduler;

import com.ppms.credit.CreditInterestService;
import com.ppms.credit.InterestPeriod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Stages interest charges on a schedule driven by each client's interestPeriod setting:
 *
 *   WEEKLY  clients → every Monday at 01:00 IST (covers Mon–Sun of the just-ended week)
 *   MONTHLY clients → 1st of every month at 01:00 IST (covers the just-ended month)
 *
 * "Staging" means interest is calculated and written to credit_interest_charges but NOT
 * automatically collected — the Owner/Admin still reviews and approves charges via the UI.
 *
 * ShedLock prevents duplicate runs across multiple pods. The job is idempotent:
 * CreditInterestService.applyInterestForPeriod() skips clients whose interest window
 * has not yet elapsed, so re-running produces no duplicate entries.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InterestStagingJob {

    private final CreditInterestService creditInterestService;

    /**
     * Weekly interest — runs every Monday at 01:00 IST.
     * periodTo = yesterday (Sunday) so only the fully-elapsed week is charged.
     */
    @Scheduled(cron = "0 0 1 * * MON", zone = "Asia/Kolkata")
    @SchedulerLock(name = "InterestStagingJob_Weekly", lockAtMostFor = "PT30M", lockAtLeastFor = "PT5M")
    public void stageWeeklyInterest() {
        log.info("InterestStagingJob_Weekly started");
        LocalDate periodTo = LocalDate.now(ZoneId.of("Asia/Kolkata")).minusDays(1); // yesterday = last day of elapsed week
        int charged = creditInterestService.applyInterestForPeriod(InterestPeriod.WEEKLY, periodTo, "WEEKLY_SCHEDULED");
        log.info("InterestStagingJob_Weekly complete: {} clients charged", charged);
    }

    /**
     * Monthly interest — runs on the 1st of every month at 01:00 IST.
     * periodTo = yesterday (last day of the previous month) so only the fully-elapsed month is charged.
     */
    @Scheduled(cron = "0 0 1 1 * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "InterestStagingJob_Monthly", lockAtMostFor = "PT30M", lockAtLeastFor = "PT5M")
    public void stageMonthlyInterest() {
        log.info("InterestStagingJob_Monthly started");
        LocalDate periodTo = LocalDate.now(ZoneId.of("Asia/Kolkata")).minusDays(1); // yesterday = last day of previous month
        int charged = creditInterestService.applyInterestForPeriod(InterestPeriod.MONTHLY, periodTo, "MONTHLY_SCHEDULED");
        log.info("InterestStagingJob_Monthly complete: {} clients charged", charged);
    }
}
