package com.ppms.scheduler;

import com.ppms.common.time.BusinessClock;
import com.ppms.credit.CreditInterestRunService;
import com.ppms.credit.InterestPeriod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Stages interest charges on a schedule driven by each client's interestPeriod setting:
 *
 *   WEEKLY  clients → every Monday at 01:00 IST (covers Mon–Sun of the just-ended week)
 *   MONTHLY clients → 1st of every month at 01:00 IST (covers the just-ended month)
 *
 * "Staging" means interest is calculated and written to credit_interest_charges but NOT
 * automatically collected — the Owner/Admin still reviews and approves charges via the UI.
 *
 * ShedLock prevents duplicate runs across multiple pods. Each client group is charged in its own
 * transaction, so one failure does not cancel the others. The job is idempotent: a group whose
 * interest window has not elapsed is skipped, so re-running produces no duplicate entries.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InterestStagingJob {

    private final CreditInterestRunService interestRunService;
    private final BusinessClock businessClock;

    /**
     * Weekly interest — runs every Monday at 01:00 IST.
     * periodTo = yesterday (Sunday) so only the fully-elapsed week is charged.
     */
    @Scheduled(cron = "0 0 1 * * MON", zone = "Asia/Kolkata")
    @SchedulerLock(name = "InterestStagingJob_Weekly", lockAtMostFor = "PT30M", lockAtLeastFor = "PT5M")
    public void stageWeeklyInterest() {
        log.info("InterestStagingJob_Weekly started");
        LocalDate periodTo = businessClock.today().minusDays(1); // yesterday = last day of elapsed week
        CreditInterestRunService.InterestRunResult result =
                interestRunService.applyInterestForPeriod(InterestPeriod.WEEKLY, periodTo, "WEEKLY_SCHEDULED");
        log.info("InterestStagingJob_Weekly complete: charged={} skipped={} failed={} failedClientIds={}",
                result.groupsCharged(), result.groupsSkipped(), result.groupsFailed(), result.failedClientIds());
    }

    /**
     * Monthly interest — runs on the 1st of every month at 01:00 IST.
     * periodTo = yesterday (last day of the previous month) so only the fully-elapsed month is charged.
     */
    @Scheduled(cron = "0 0 1 1 * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "InterestStagingJob_Monthly", lockAtMostFor = "PT30M", lockAtLeastFor = "PT5M")
    public void stageMonthlyInterest() {
        log.info("InterestStagingJob_Monthly started");
        LocalDate periodTo = businessClock.today().minusDays(1); // yesterday = last day of previous month
        CreditInterestRunService.InterestRunResult result =
                interestRunService.applyInterestForPeriod(InterestPeriod.MONTHLY, periodTo, "MONTHLY_SCHEDULED");
        log.info("InterestStagingJob_Monthly complete: charged={} skipped={} failed={} failedClientIds={}",
                result.groupsCharged(), result.groupsSkipped(), result.groupsFailed(), result.failedClientIds());
    }
}
