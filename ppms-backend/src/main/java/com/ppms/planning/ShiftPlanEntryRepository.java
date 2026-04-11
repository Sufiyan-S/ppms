package com.ppms.planning;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ShiftPlanEntryRepository extends JpaRepository<ShiftPlanEntry, Long> {

    List<ShiftPlanEntry> findByShiftPlanId(Long shiftPlanId);

    /** All PLANNED entries for a specific date + shift definition — used when opening a shift. */
    @Query("""
        SELECT e FROM ShiftPlanEntry e
        JOIN ShiftPlan p ON p.id = e.shiftPlanId
        WHERE p.pumpId = :pumpId
          AND e.shiftDate = :shiftDate
          AND e.shiftDefinitionId = :shiftDefinitionId
          AND p.status = 'PUBLISHED'
          AND e.status = 'PLANNED'
        """)
    List<ShiftPlanEntry> findPlannedForSlot(
            @Param("pumpId") Long pumpId,
            @Param("shiftDate") LocalDate shiftDate,
            @Param("shiftDefinitionId") Long shiftDefinitionId);

    /** All PLANNED entries for a date + definition — used to mark ABSENT at shift open. */
    @Query("""
        SELECT e FROM ShiftPlanEntry e
        JOIN ShiftPlan p ON p.id = e.shiftPlanId
        WHERE p.pumpId = :pumpId
          AND e.shiftDate = :shiftDate
          AND e.shiftDefinitionId = :shiftDefinitionId
          AND p.status = 'PUBLISHED'
          AND e.status = 'PLANNED'
        """)
    List<ShiftPlanEntry> findPlannedEntries(
            @Param("pumpId") Long pumpId,
            @Param("shiftDate") LocalDate shiftDate,
            @Param("shiftDefinitionId") Long shiftDefinitionId);

    /** Upcoming planned shifts for a specific operator — used for staff's own schedule view. */
    @Query("""
        SELECT e FROM ShiftPlanEntry e
        JOIN ShiftPlan p ON p.id = e.shiftPlanId
        WHERE e.operatorUserId = :userId
          AND e.shiftDate >= :from
          AND p.status = 'PUBLISHED'
        ORDER BY e.shiftDate ASC, e.shiftDefinitionId ASC
        """)
    List<ShiftPlanEntry> findUpcomingForOperator(
            @Param("userId") Long userId,
            @Param("from") LocalDate from);

    /** All entries for a plan, to check consecutive shift constraints. */
    List<ShiftPlanEntry> findByShiftPlanIdAndOperatorUserId(Long shiftPlanId, Long operatorUserId);

    Optional<ShiftPlanEntry> findByShiftPlanIdAndShiftDateAndShiftDefinitionIdAndOperatorUserId(
            Long shiftPlanId, LocalDate shiftDate, Long shiftDefinitionId, Long operatorUserId);
}
