package com.ppms.report;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface BalanceSheetRepository extends JpaRepository<BalanceSheet, Long> {

    /** All reports for a pump, newest first — used for history list */
    List<BalanceSheet> findByPumpIdOrderByReportDateDescGeneratedAtDesc(Long pumpId);

    /** All reports for a pump, paginated — used for history list with pagination */
    Page<BalanceSheet> findByPumpIdOrderByReportDateDescGeneratedAtDesc(Long pumpId, Pageable pageable);

    /** Reports within a date range */
    List<BalanceSheet> findByPumpIdAndReportDateBetweenOrderByReportDateDescGeneratedAtDesc(
            Long pumpId, LocalDate from, LocalDate to);

    /** Reports within a date range, paginated */
    Page<BalanceSheet> findByPumpIdAndReportDateBetweenOrderByReportDateDescGeneratedAtDesc(
            Long pumpId, LocalDate from, LocalDate to, Pageable pageable);

    /** Check if a SHIFT report already exists for this pump / date / shift definition */
    Optional<BalanceSheet> findFirstByPumpIdAndReportDateAndShiftDefinitionId(
            Long pumpId, LocalDate reportDate, Long shiftDefinitionId);

    /** Check if a DAY report already exists */
    Optional<BalanceSheet> findFirstByPumpIdAndReportDateAndReportType(
            Long pumpId, LocalDate reportDate, BalanceSheetReportType reportType);

    /** Count of SHIFT reports for this definition — used to compute revision numbers */
    long countByPumpIdAndReportDateAndShiftDefinitionId(Long pumpId, LocalDate reportDate, Long shiftDefinitionId);

    /** Count of DAY reports for this period — used to compute revision numbers */
    long countByPumpIdAndReportDateAndReportType(Long pumpId, LocalDate reportDate, BalanceSheetReportType reportType);
}
