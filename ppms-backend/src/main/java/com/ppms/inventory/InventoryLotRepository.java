package com.ppms.inventory;

import com.ppms.fuel.FuelType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface InventoryLotRepository extends JpaRepository<InventoryLot, Long> {

    /**
     * FIFO ordering scoped to pump + fuelType.
     *
     * Since nozzles are not assigned to specific tanks, deductions are taken from
     * the oldest available lot across all tanks for that fuel type at the pump.
     * This ensures correct FIFO cost accounting regardless of which physical tank
     * the fuel was dispensed from.
     *
     * Lots belonging to INACTIVE tanks are excluded — their stock is frozen until
     * the tank is re-enabled. This prevents consuming stock from a tank that is
     * under maintenance.
     *
     * Row-level ordering: oldest delivery_date first, then id as tiebreaker.
     */
    // PESSIMISTIC_WRITE lock prevents two concurrent shift-close transactions from deducting
    // from the same lot simultaneously. Without this, both transactions could read the same
    // remaining quantity and over-deduct — a FIFO inventory accuracy bug under concurrent load.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT l FROM InventoryLot l
            WHERE l.pumpId = :pumpId AND l.fuelType = :fuelType AND l.status = 'ACTIVE'
                  AND l.tankId NOT IN (
                      SELECT t.id FROM UndergroundTank t WHERE t.status = 'INACTIVE'
                  )
            ORDER BY l.deliveryDate ASC, l.id ASC
            """)
    List<InventoryLot> findActiveLotsByPumpAndFuelTypeFifo(Long pumpId, FuelType fuelType);

    /**
     * FIFO ordering scoped to a specific tank.
     *
     * Used at shift-close when the outlet has a frozen tankId on the
     * ShiftFuelReading. Only deducts from lots belonging to that tank.
     * INACTIVE tanks are guarded at shift-open time (blocked before the shift
     * starts), so no additional status filter is needed here.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT l FROM InventoryLot l
            WHERE l.tankId = :tankId AND l.status = 'ACTIVE'
            ORDER BY l.deliveryDate ASC, l.id ASC
            """)
    List<InventoryLot> findActiveLotsByTankFifo(Long tankId);

    // ── Backfill-specific queries (historically accurate: deliveryDate ≤ asOf) ──────────────────

    /**
     * FIFO lots for pump + fuelType whose delivery arrived on or before the backfill shift date.
     * Prevents consuming stock from tankers delivered AFTER the historical shift date.
     * Used by backfillShift() for both pre-validation and FIFO deduction.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT l FROM InventoryLot l
            WHERE l.pumpId = :pumpId AND l.fuelType = :fuelType AND l.status = 'ACTIVE'
                  AND l.deliveryDate <= :asOf
                  AND l.tankId NOT IN (
                      SELECT t.id FROM UndergroundTank t WHERE t.status = 'INACTIVE'
                  )
            ORDER BY l.deliveryDate ASC, l.id ASC
            """)
    List<InventoryLot> findActiveLotsByPumpAndFuelTypeAvailableAsOf(
            @Param("pumpId") Long pumpId,
            @Param("fuelType") FuelType fuelType,
            @Param("asOf") OffsetDateTime asOf);

    /**
     * FIFO lots for a specific tank whose delivery arrived on or before the backfill shift date.
     * Used by backfillShift() for both pre-validation and FIFO deduction when tankId is set.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT l FROM InventoryLot l
            WHERE l.tankId = :tankId AND l.status = 'ACTIVE'
                  AND l.deliveryDate <= :asOf
            ORDER BY l.deliveryDate ASC, l.id ASC
            """)
    List<InventoryLot> findActiveLotsByTankAvailableAsOf(
            @Param("tankId") Long tankId,
            @Param("asOf") OffsetDateTime asOf);

    /** All lots for a tank (all statuses) ordered by delivery date. Used by inventory lots report. */
    @Query("""
            SELECT l FROM InventoryLot l
            WHERE l.tankId = :tankId
            ORDER BY l.deliveryDate ASC, l.id ASC
            """)
    List<InventoryLot> findAllByTankIdOrdered(Long tankId);

    /** All lots for a pump across all tanks, ordered by tank then delivery date. Used by all-tanks inventory report. */
    @Query("SELECT l FROM InventoryLot l WHERE l.pumpId = :pumpId ORDER BY l.tankId ASC, l.deliveryDate ASC, l.id ASC")
    List<InventoryLot> findAllByPumpIdOrderedByTankAndDelivery(@Param("pumpId") Long pumpId);

    /**
     * ACTIVE lots for a specific tank in FIFO order — display use only (no row lock).
     *
     * Intentionally has no PESSIMISTIC_WRITE lock. This is safe for read-only display
     * because it is never used to deduct stock. Using a lock here would block concurrent
     * shift-close transactions that hold a write lock via findActiveLotsByTankFifo.
     */
    @Query("""
            SELECT l FROM InventoryLot l
            WHERE l.tankId = :tankId AND l.status = 'ACTIVE'
            ORDER BY l.deliveryDate ASC, l.id ASC
            """)
    List<InventoryLot> findActiveLotsByTankForDisplay(Long tankId);

    /** Finds the single lot created for a specific tanker delivery. Used by the edit-delivery flow. */
    java.util.Optional<InventoryLot> findByTankerDeliveryId(Long tankerDeliveryId);

    /** Most recent lot (any status) for a pump + fuelType — used to approximate cost price for synthetic healing lots. */
    java.util.Optional<InventoryLot> findFirstByPumpIdAndFuelTypeAndIsDipAdjustmentFalseOrderByDeliveryDateDesc(
            Long pumpId, FuelType fuelType);
}
