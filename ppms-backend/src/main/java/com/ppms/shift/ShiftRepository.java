package com.ppms.shift;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ShiftRepository extends JpaRepository<Shift, Long> {

    // Active shifts for a pump (OPEN or OPEN_OVERDUE)
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            ORDER BY s.actualStartTime DESC
            """)
    List<Shift> findActiveShiftsByPump(Long pumpId);

    // Check if nozzle already has an open shift (Rule 33)
    @Query("""
            SELECT s FROM Shift s
            WHERE s.nozzleId = :nozzleId
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    Optional<Shift> findOpenShiftByNozzle(Long nozzleId);

    // Check if operator already has an open shift (Rule 27)
    @Query("""
            SELECT s FROM Shift s
            WHERE s.operatorId = :operatorId
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    Optional<Shift> findOpenShiftByOperator(Long operatorId);

    // Recent shifts for a pump (for history display — unbounded, kept for internal use)
    List<Shift> findByPumpIdOrderByActualStartTimeDesc(Long pumpId);

    // Paginated version for the API — prevents unbounded result sets on busy pumps
    Page<Shift> findByPumpIdOrderByActualStartTimeDesc(Long pumpId, Pageable pageable);

    // ── Operator deactivation guards (Business Rules 30, 45) ─────────────────

    /** True if operator has any open shift — blocks deactivation (Rule 45). */
    @Query("""
            SELECT COUNT(s) > 0 FROM Shift s
            WHERE s.operatorId = :operatorId
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    boolean hasOpenShift(Long operatorId);

    /** True if operator has any unresolved discrepancy — blocks deactivation (Rule 30). */
    @Query("""
            SELECT COUNT(s) > 0 FROM Shift s
            WHERE s.operatorId = :operatorId
              AND s.status = 'CLOSED_DISCREPANCY_PENDING'
            """)
    boolean hasUnresolvedDiscrepancy(Long operatorId);

    // ── Overdue shift auto-close job ──────────────────────────────────────────

    /** All OPEN or OPEN_OVERDUE shifts across all pumps. Used by the auto-close scheduler. */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.status IN ('OPEN', 'OPEN_OVERDUE')
            ORDER BY s.actualStartTime ASC
            """)
    List<Shift> findAllOpenShifts();

    // ── Report queries ────────────────────────────────────────────────────────

    /** Closed shifts for a pump within a date range (inclusive). Used by P&L and discrepancy reports. */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate BETWEEN :from AND :to
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE')
            ORDER BY s.shiftDate ASC, s.actualStartTime ASC
            """)
    List<Shift> findClosedShiftsByDateRange(Long pumpId, LocalDate from, LocalDate to);

    /** Shifts for a specific operator on a pump within a date range. Used by operator duty report. */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.operatorId = :operatorId
              AND s.shiftDate BETWEEN :from AND :to
            ORDER BY s.shiftDate ASC, s.actualStartTime ASC
            """)
    List<Shift> findByPumpIdAndOperatorIdAndDateRange(Long pumpId, Long operatorId, LocalDate from, LocalDate to);

    /**
     * Returns closed shifts for an operator in a date range where the discrepancy was resolved
     * via SALARY_DEDUCTION. Used by PayrollController to compute payroll deductions:
     * deductions = SUM(discrepancy_amount) for these shifts.
     */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.operatorId = :operatorId
              AND s.shiftDate BETWEEN :from AND :to
              AND s.discrepancyResolution = com.ppms.shift.DiscrepancyResolution.SALARY_DEDUCTION
              AND s.discrepancyAmount IS NOT NULL
            ORDER BY s.shiftDate ASC
            """)
    List<Shift> findSalaryDeductionShifts(
            @Param("pumpId") Long pumpId,
            @Param("operatorId") Long operatorId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    // ── Balance sheet queries ─────────────────────────────────────────────────

    /**
     * Closed shifts for a specific shift definition on a given business date.
     * Used when generating a SHIFT balance sheet.
     * Excludes any shift still in an open/active state.
     */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate = :shiftDate
              AND s.shiftDefinitionId = :shiftDefinitionId
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            ORDER BY s.actualEndTime ASC
            """)
    List<Shift> findClosedShiftsByDefinition(Long pumpId, LocalDate shiftDate, Long shiftDefinitionId);

    /**
     * All closed shifts for a full business date.
     * Used when generating a DAY balance sheet.
     */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate = :shiftDate
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            ORDER BY s.actualEndTime ASC
            """)
    List<Shift> findClosedShiftsByDate(Long pumpId, LocalDate shiftDate);

    /**
     * Returns true if any shift (in any status) references one of the given shift definition IDs.
     * Used before deleting a shift definition group to enforce referential safety at the application layer.
     */
    @Query("""
            SELECT COUNT(s) > 0 FROM Shift s
            WHERE s.shiftDefinitionId IN :definitionIds
            """)
    boolean existsByShiftDefinitionIdIn(@Param("definitionIds") List<Long> definitionIds);
}
