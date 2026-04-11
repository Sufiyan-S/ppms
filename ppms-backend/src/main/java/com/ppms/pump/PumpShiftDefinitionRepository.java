package com.ppms.pump;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface PumpShiftDefinitionRepository extends JpaRepository<PumpShiftDefinition, Long> {

    /**
     * All definitions for a pump, ordered for display (effective date desc, then sort_order).
     * Used by the admin UI to list all active and historical configurations.
     */
    List<PumpShiftDefinition> findByPumpIdOrderByEffectiveFromDescSortOrderAsc(Long pumpId);

    /**
     * Active definitions for a pump on a specific date.
     * A definition is active when effectiveFrom <= date AND (effectiveTo IS NULL OR effectiveTo >= date).
     * Ordered by sortOrder for deterministic shift matching.
     */
    @Query("""
            SELECT d FROM PumpShiftDefinition d
            WHERE d.pumpId = :pumpId
              AND d.effectiveFrom <= :date
              AND (d.effectiveTo IS NULL OR d.effectiveTo >= :date)
            ORDER BY d.sortOrder ASC
            """)
    List<PumpShiftDefinition> findActiveForPumpOnDate(
            @Param("pumpId") Long pumpId,
            @Param("date") LocalDate date);

    /**
     * All definitions that share the same effectiveFrom date for a pump.
     * Used during validation to enforce the max-4 and night-shift-required rules
     * before persisting a new configuration group.
     */
    @Query("""
            SELECT d FROM PumpShiftDefinition d
            WHERE d.pumpId = :pumpId
              AND d.effectiveFrom = :effectiveFrom
            ORDER BY d.sortOrder ASC
            """)
    List<PumpShiftDefinition> findByPumpIdAndEffectiveFrom(
            @Param("pumpId") Long pumpId,
            @Param("effectiveFrom") LocalDate effectiveFrom);

    /**
     * Currently open (no effectiveTo) definitions for a pump.
     * Used to close out old definitions when a new configuration is published.
     */
    @Query("""
            SELECT d FROM PumpShiftDefinition d
            WHERE d.pumpId = :pumpId
              AND d.effectiveTo IS NULL
            """)
    List<PumpShiftDefinition> findOpenDefinitionsForPump(@Param("pumpId") Long pumpId);

    /**
     * Finds definitions whose effective date range overlaps with [fromDate, toDate].
     * Used to block creation of a new group that would overlap an existing group.
     * Open-ended groups (effectiveTo IS NULL) overlap any range starting on or after their effectiveFrom.
     */
    @Query("""
            SELECT d FROM PumpShiftDefinition d
            WHERE d.pumpId = :pumpId
              AND d.effectiveFrom <= :toDate
              AND (d.effectiveTo IS NULL OR d.effectiveTo >= :fromDate)
            """)
    List<PumpShiftDefinition> findOverlappingDefinitions(
            @Param("pumpId") Long pumpId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);
}
