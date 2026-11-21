package com.ppms.inventory;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface LotConsumptionRepository extends JpaRepository<LotConsumption, Long> {

    List<LotConsumption> findByShiftId(Long shiftId);

    /** Batch fetch for all consumptions across multiple shifts — avoids N+1 in P&L report. */
    List<LotConsumption> findByShiftIdIn(java.util.Collection<Long> shiftIds);

    /** All consumptions from a specific lot — used by inventory lots report. */
    List<LotConsumption> findByLotId(Long lotId);

    /** Batch fetch for all consumptions across multiple lots — avoids N+1 in inventory lots report. */
    List<LotConsumption> findByLotIdIn(java.util.Collection<Long> lotIds);

    /** Consumptions of the lots selected by InventoryLotRepository.findReportLots, joined instead of passing lot ids. */
    @Query("""
            SELECT c FROM LotConsumption c, InventoryLot l
            WHERE c.lotId = l.id AND l.pumpId = :pumpId
              AND (l.status = 'ACTIVE' OR (l.deliveryDate >= :from AND l.deliveryDate < :to))
            """)
    List<LotConsumption> findForReportLots(@Param("pumpId") Long pumpId,
                                           @Param("from") OffsetDateTime from,
                                           @Param("to") OffsetDateTime to);

    /** [shiftId, shiftName] of the shifts that consumed from the report lots. */
    @Query("""
            SELECT DISTINCT s.id, s.shiftName FROM Shift s, LotConsumption c, InventoryLot l
            WHERE c.shiftId = s.id AND c.lotId = l.id AND l.pumpId = :pumpId
              AND (l.status = 'ACTIVE' OR (l.deliveryDate >= :from AND l.deliveryDate < :to))
            """)
    List<Object[]> findShiftNamesForReportLots(@Param("pumpId") Long pumpId,
                                               @Param("from") OffsetDateTime from,
                                               @Param("to") OffsetDateTime to);

    /**
     * Litres consumed per fuel type as of {@code asOf}. A shift's consumption counts once the shift has ended
     * (end at or before {@code asOf}), matching how live and SHIFT balance sheets pick their shifts; a dip
     * correction counts strictly before {@code asOf}, matching how received lots are counted.
     */
    @Query("""
            SELECT l.fuelType, SUM(c.quantityConsumed)
            FROM LotConsumption c
            JOIN InventoryLot l ON l.id = c.lotId
            LEFT JOIN Shift s ON s.id = c.shiftId
            LEFT JOIN DipCheck d ON d.id = c.dipCorrectionId
            WHERE l.pumpId = :pumpId
              AND ((s.id IS NOT NULL AND COALESCE(s.actualEndTime, c.consumedAt) <= :asOf)
                   OR (s.id IS NULL AND COALESCE(d.checkedAt, c.consumedAt) < :asOf))
            GROUP BY l.fuelType
            """)
    List<Object[]> sumConsumedByFuelTypeAsOf(@Param("pumpId") Long pumpId, @Param("asOf") OffsetDateTime asOf);

    /**
     * Litres consumed per fuel type before the business day starting at {@code dayStart}. A shift's
     * consumption belongs to its shift date (so a night shift's after-midnight sales stay on the day the
     * historical DAY report lists it); a dip correction counts strictly before {@code dayStart}.
     */
    @Query("""
            SELECT l.fuelType, SUM(c.quantityConsumed)
            FROM LotConsumption c
            JOIN InventoryLot l ON l.id = c.lotId
            LEFT JOIN Shift s ON s.id = c.shiftId
            LEFT JOIN DipCheck d ON d.id = c.dipCorrectionId
            WHERE l.pumpId = :pumpId
              AND ((s.id IS NOT NULL AND s.shiftDate < :day)
                   OR (s.id IS NULL AND COALESCE(d.checkedAt, c.consumedAt) < :dayStart))
            GROUP BY l.fuelType
            """)
    List<Object[]> sumConsumedByFuelTypeBeforeDay(@Param("pumpId") Long pumpId,
                                                  @Param("day") LocalDate day,
                                                  @Param("dayStart") OffsetDateTime dayStart);

    /** When the lot was first drawn down, dated the same way as {@link #sumConsumedByFuelTypeAsOf}. */
    @Query("""
            SELECT MIN(COALESCE(s.actualEndTime, d.checkedAt, c.consumedAt))
            FROM LotConsumption c
            LEFT JOIN Shift s ON s.id = c.shiftId
            LEFT JOIN DipCheck d ON d.id = c.dipCorrectionId
            WHERE c.lotId = :lotId
            """)
    Optional<OffsetDateTime> findFirstConsumptionTime(@Param("lotId") Long lotId);
}
