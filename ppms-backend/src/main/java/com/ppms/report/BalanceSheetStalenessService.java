package com.ppms.report;

import com.ppms.common.text.CodedText;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * Flags saved balance sheets whose figures changed after they were generated, so the owner knows to regenerate them.
 * Runs inside the caller's transaction, so a sheet is only flagged when the change itself is saved.
 */
@Slf4j
@Service
@Transactional(propagation = Propagation.MANDATORY)
@RequiredArgsConstructor
public class BalanceSheetStalenessService {

    private final BalanceSheetRepository balanceSheetRepository;

    /** For changes every sheet of the day includes: dip checks, drains and fuel purchase cost. */
    public void markAllSheetsStale(Long pumpId, Collection<LocalDate> dates, CodedText reason) {
        if (dates.isEmpty()) {
            return;
        }
        logMarked(pumpId, dates, balanceSheetRepository.markStaleOnDates(pumpId, dates,
                reason.text(), reason.code(), reason.params()), reason);
    }

    /** For a shift closed on its date: the DAY sheet and the SHIFT sheet of its definition include it. */
    public void markSheetsOfShiftStale(Long pumpId, LocalDate shiftDate, Long shiftDefinitionId, CodedText reason) {
        List<LocalDate> dates = List.of(shiftDate);
        logMarked(pumpId, dates, balanceSheetRepository.markDayAndShiftSheetsStale(pumpId, dates, shiftDefinitionId,
                reason.text(), reason.code(), reason.params()), reason);
    }

    /** For figures only DAY sheets show: cash recoveries and counter product sales. */
    public void markDaySheetsStale(Long pumpId, Collection<LocalDate> dates, CodedText reason) {
        if (dates.isEmpty()) {
            return;
        }
        logMarked(pumpId, dates, balanceSheetRepository.markDayAndShiftSheetsStale(pumpId, dates, null,
                reason.text(), reason.code(), reason.params()), reason);
    }

    private void logMarked(Long pumpId, Collection<LocalDate> dates, int marked, CodedText reason) {
        if (marked > 0) {
            log.info("Balance sheets marked stale: pump={}, dates={}, sheets={}, reason={}", pumpId, dates, marked, reason.code());
        }
    }
}
