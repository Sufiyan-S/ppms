package com.ppms.pump;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface NozzleCalibrationLogRepository extends JpaRepository<NozzleCalibrationLog, Long> {

    /** Returns all calibration records for a nozzle, newest logged first. */
    List<NozzleCalibrationLog> findByNozzleIdOrderByCreatedAtDescCalibrationDateDesc(Long nozzleId);

    /** Paginated version — used by the calibration history API. */
    Page<NozzleCalibrationLog> findByNozzleIdOrderByCreatedAtDescCalibrationDateDesc(Long nozzleId, Pageable pageable);

    /** Returns all calibration records for a pump, newest logged first. */
    List<NozzleCalibrationLog> findByPumpIdOrderByCreatedAtDescCalibrationDateDesc(Long pumpId);

    /** Paginated version for the pump-wide calibration history view. */
    Page<NozzleCalibrationLog> findByPumpIdOrderByCreatedAtDescCalibrationDateDesc(Long pumpId, Pageable pageable);

    /**
     * Returns the most recent calibration log for a nozzle.
     * Used by ShiftService to get the current next_calibration_due date.
     */
    @Query("""
            SELECT c FROM NozzleCalibrationLog c
            WHERE c.nozzleId = :nozzleId
            ORDER BY c.calibrationDate DESC, c.id DESC
            LIMIT 1
            """)
    Optional<NozzleCalibrationLog> findLatestByNozzleId(@Param("nozzleId") Long nozzleId);

    /**
     * Returns all nozzle calibration logs for a pump where next_calibration_due is before
     * the given date — used by the notification service for overdue calibration alerts.
     */
    @Query("""
            SELECT c FROM NozzleCalibrationLog c
            WHERE c.pumpId = :pumpId
              AND c.nextCalibrationDue IS NOT NULL
              AND c.nextCalibrationDue < :date
              AND c.nozzleId NOT IN (
                  SELECT c2.nozzleId FROM NozzleCalibrationLog c2
                  WHERE c2.pumpId = :pumpId
                    AND c2.calibrationDate > c.calibrationDate
              )
            """)
    List<NozzleCalibrationLog> findOverdueCalibrations(@Param("pumpId") Long pumpId,
                                                       @Param("date") LocalDate date);
}
