package com.ppms.shift;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ShiftRepository extends JpaRepository<Shift, Long> {

    Optional<Shift> findByIdAndPumpId(Long id, Long pumpId);

    boolean existsByIdAndPumpId(Long id, Long pumpId);

    // Lock order for state changes: shift, then tanks (by id), then inventory lots.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Shift s WHERE s.id = :id AND s.pumpId = :pumpId")
    Optional<Shift> findByIdAndPumpIdForUpdate(@Param("id") Long id, @Param("pumpId") Long pumpId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Shift s WHERE s.id = :id")
    Optional<Shift> findByIdForUpdate(@Param("id") Long id);

    // Active shifts for a pump (OPEN or OPEN_OVERDUE)
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            ORDER BY s.actualStartTime DESC
            """)
    List<Shift> findActiveShiftsByPump(Long pumpId);

    // Check if a nozzle already has an open shift — enforces one operator per nozzle at a time.
    // Queries via the shift_nozzles join table.
    @Query("""
            SELECT s FROM Shift s
            JOIN ShiftNozzle sn ON sn.shiftId = s.id
            WHERE sn.nozzleId = :nozzleId
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    Optional<Shift> findOpenShiftByNozzle(@Param("nozzleId") Long nozzleId);

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

    Page<Shift> findByPumpIdAndShiftDateBetweenOrderByActualStartTimeDesc(
            Long pumpId, LocalDate from, LocalDate to, Pageable pageable);

    Page<Shift> findByPumpIdAndShiftDateBetweenAndDiscrepancyTypeInOrderByActualStartTimeDesc(
            Long pumpId, LocalDate from, LocalDate to, List<DiscrepancyType> discrepancyTypes, Pageable pageable);

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

    /** Ids of all OPEN or OPEN_OVERDUE shifts across all pumps. Used by the auto-close scheduler. */
    @Query("""
            SELECT s.id FROM Shift s
            WHERE s.status IN ('OPEN', 'OPEN_OVERDUE')
            ORDER BY s.actualStartTime ASC
            """)
    List<Long> findAllOpenShiftIds();

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

    /**
     * All shifts (open and closed) for a pump within a date range.
     * Used by attendance tracking to include operators who have opened but not yet closed a shift.
     */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate BETWEEN :from AND :to
            ORDER BY s.shiftDate ASC, s.actualStartTime ASC
            """)
    List<Shift> findAllShiftsByDateRange(Long pumpId, LocalDate from, LocalDate to);

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
     * via SALARY_DEDUCTION and no payroll has already taken the deduction (payroll_resolved_shifts).
     * deductions = SUM(discrepancy_amount) for these shifts.
     *
     * Native query required: Hibernate maps the JPQL enum literal to
     * 'SALARY_DEDUCTION'::DiscrepancyResolution (Java class name), but the PostgreSQL
     * type is discrepancy_resolution (snake_case), causing a type-not-found error.
     */
    @Query(value = """
            SELECT * FROM shifts
            WHERE pump_id = :pumpId
              AND operator_id = :operatorId
              AND shift_date BETWEEN :from AND :to
              AND discrepancy_resolution = 'SALARY_DEDUCTION'::discrepancy_resolution
              AND discrepancy_amount IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM payroll_resolved_shifts prs WHERE prs.shift_id = shifts.id)
            ORDER BY shift_date ASC
            """, nativeQuery = true)
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
     * All closed shifts for a full calendar date.
     * Used for historical DAY balance sheets where reportDate is in the past.
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
     * Shifts that ended (closed by an operator or auto-closed by the overdue job) within (from, to].
     * Used by alert generation, which must see night shifts whose shift date is the previous day.
     */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.actualEndTime > :from
              AND s.actualEndTime <= :to
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE')
            ORDER BY s.actualEndTime ASC
            """)
    List<Shift> findShiftsEndedBetween(@Param("pumpId") Long pumpId,
                                       @Param("from") OffsetDateTime from,
                                       @Param("to") OffsetDateTime to);

    /**
     * All closed shifts whose actualEndTime falls in (windowStart, windowEnd].
     * Used for live DAY balance sheets — captures every shift that finished in
     * the last 24 hours regardless of which calendar date they started on.
     * Open/overdue shifts are excluded so a mid-day report never includes
     * a shift that is still running.
     */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.actualEndTime > :windowStart
              AND s.actualEndTime <= :windowEnd
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            ORDER BY s.actualEndTime ASC
            """)
    List<Shift> findClosedShiftsByEndTimeWindow(
            @Param("pumpId") Long pumpId,
            @Param("windowStart") OffsetDateTime windowStart,
            @Param("windowEnd") OffsetDateTime windowEnd);

    // ── Settlement wallet queries ─────────────────────────────────────────────

    /**
     * Total UPI collected across ALL closed shifts for a pump.
     * Used by the settlement wallet to compute pending balance: collected − settled.
     * COALESCE guarantees non-null even when no shifts exist yet.
     */
    @Query("""
            SELECT COALESCE(SUM(s.upiCollected), 0)
            FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    BigDecimal sumUpiCollectedByPumpId(@Param("pumpId") Long pumpId);

    @Query("""
            SELECT COALESCE(SUM(s.cardCollected), 0)
            FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    BigDecimal sumCardCollectedByPumpId(@Param("pumpId") Long pumpId);

    @Query("""
            SELECT COALESCE(SUM(s.fleetCardCollected), 0)
            FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    BigDecimal sumFleetCardCollectedByPumpId(@Param("pumpId") Long pumpId);

    /**
     * Total UPI collected across ALL closed shifts for a pump on or before a given date.
     * Used for the historical wallet snapshot on balance sheets.
     */
    @Query("""
            SELECT COALESCE(SUM(s.upiCollected), 0)
            FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate <= :asOf
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    BigDecimal sumUpiCollectedByPumpIdAsOf(@Param("pumpId") Long pumpId, @Param("asOf") LocalDate asOf);

    @Query("""
            SELECT COALESCE(SUM(s.cardCollected), 0)
            FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate <= :asOf
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    BigDecimal sumCardCollectedByPumpIdAsOf(@Param("pumpId") Long pumpId, @Param("asOf") LocalDate asOf);

    @Query("""
            SELECT COALESCE(SUM(s.fleetCardCollected), 0)
            FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate <= :asOf
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            """)
    BigDecimal sumFleetCardCollectedByPumpIdAsOf(@Param("pumpId") Long pumpId, @Param("asOf") LocalDate asOf);

    /**
     * Per-date breakdown of closed-shift collections for the given pump and date range.
     * Returns one row per shift date: [shiftDate, sumUpi, sumCard, sumFleetCard].
     * Used by the payment settlement daily-summary endpoint.
     */
    @Query("""
            SELECT s.shiftDate,
                   COALESCE(SUM(s.upiCollected),        0),
                   COALESCE(SUM(s.cardCollected),       0),
                   COALESCE(SUM(s.fleetCardCollected),  0)
            FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.shiftDate BETWEEN :from AND :to
              AND s.status NOT IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            GROUP BY s.shiftDate
            ORDER BY s.shiftDate ASC
            """)
    List<Object[]> collectionsGroupedByDate(@Param("pumpId") Long pumpId,
                                            @Param("from") LocalDate from,
                                            @Param("to") LocalDate to);

    /**
     * Returns true if any shift (in any status) references one of the given shift definition IDs.
     * Used before deleting a shift definition group to enforce referential safety at the application layer.
     */
    @Query("""
            SELECT COUNT(s) > 0 FROM Shift s
            WHERE s.shiftDefinitionId IN :definitionIds
            """)
    boolean existsByShiftDefinitionIdIn(@Param("definitionIds") List<Long> definitionIds);

    /**
     * All shifts for a user on a pump that still have an unresolved discrepancy.
     * Used by the payroll generation flow to present the owner with pending discrepancies
     * and offer to resolve them as SALARY_DEDUCTION in the current payroll run.
     */
    @Query("""
            SELECT s FROM Shift s
            WHERE s.pumpId = :pumpId
              AND s.operatorId = :operatorId
              AND s.status IN ('CLOSED_DISCREPANCY_PENDING', 'CLOSED_DISCREPANCY_PENDING_APPROVAL')
            ORDER BY s.shiftDate DESC
            """)
    List<Shift> findPendingDiscrepanciesByPumpAndOperator(
            @Param("pumpId") Long pumpId, @Param("operatorId") Long operatorId);

    /**
     * Total cash recoveries for SHORT discrepancies resolved via CASH_RECOVERY on a given IST calendar date.
     * Used by DAY balance sheets to show inbound cash from operator repayments on the resolution day.
     * Native query required to avoid Hibernate's NAMED_ENUM type-cast issue (see findSalaryDeductionShifts).
     */
    @Query(value = """
            SELECT COALESCE(SUM(cash_recovery_amount), 0)
            FROM shifts
            WHERE pump_id = :pumpId
              AND discrepancy_resolution = 'CASH_RECOVERY'::discrepancy_resolution
              AND cash_recovery_amount IS NOT NULL
              AND cash_recovery_amount > 0
              AND DATE(discrepancy_resolved_at AT TIME ZONE 'Asia/Kolkata') = :date
            """, nativeQuery = true)
    BigDecimal sumCashRecoveriesOnDate(@Param("pumpId") Long pumpId, @Param("date") LocalDate date);

    /** Cash recoveries resolved within [from, to) — used by live DAY balance sheets. */
    @Query(value = """
            SELECT COALESCE(SUM(cash_recovery_amount), 0)
            FROM shifts
            WHERE pump_id = :pumpId
              AND discrepancy_resolution = 'CASH_RECOVERY'::discrepancy_resolution
              AND cash_recovery_amount IS NOT NULL
              AND cash_recovery_amount > 0
              AND discrepancy_resolved_at >= :from AND discrepancy_resolved_at < :to
            """, nativeQuery = true)
    BigDecimal sumCashRecoveriesBetween(@Param("pumpId") Long pumpId,
                                        @Param("from") OffsetDateTime from,
                                        @Param("to") OffsetDateTime to);

    /**
     * Counts shifts for the given nozzle, business date, and shift definition.
     * Used during backfill to enforce the one-shift-per-nozzle-per-window-per-day constraint.
     *
     * Native SQL is used here because JPQL cannot combine an unrelated-entity JOIN (ShiftNozzle
     * has no mapped association to Shift) with a COUNT aggregate in the SELECT clause — Hibernate
     * fails to parse that combination at EntityManagerFactory initialisation time.
     */
    @Query(value = """
            SELECT COUNT(*) FROM shifts s
            JOIN shift_nozzles sn ON sn.shift_id = s.id
            WHERE sn.nozzle_id = :nozzleId
              AND s.shift_date = :shiftDate
              AND s.shift_definition_id = :shiftDefinitionId
            """, nativeQuery = true)
    Long countForNozzleDateAndDefinition(
            @Param("nozzleId") Long nozzleId,
            @Param("shiftDate") LocalDate shiftDate,
            @Param("shiftDefinitionId") Long shiftDefinitionId);

    boolean existsByPumpId(Long pumpId);

    // ── Multi-pump overview ───────────────────────────────────────────────────

    /** One row per pump: [pumpId, SUM(totalAmountDue)] for shifts dated {@code shiftDate} that have an amount due. */
    @Query("""
            SELECT s.pumpId, SUM(s.totalAmountDue)
            FROM Shift s
            WHERE s.pumpId IN :pumpIds
              AND s.shiftDate = :shiftDate
              AND s.totalAmountDue IS NOT NULL
            GROUP BY s.pumpId
            """)
    List<Object[]> sumAmountDueByPumpForDate(@Param("pumpIds") Collection<Long> pumpIds,
                                             @Param("shiftDate") LocalDate shiftDate);

    /** One row per pump and status: [pumpId, status, count] for shifts that are still open. */
    @Query("""
            SELECT s.pumpId, s.status, COUNT(s)
            FROM Shift s
            WHERE s.pumpId IN :pumpIds
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            GROUP BY s.pumpId, s.status
            """)
    List<Object[]> countOpenShiftsByPumpAndStatus(@Param("pumpIds") Collection<Long> pumpIds);
}
