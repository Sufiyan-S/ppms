package com.ppms.fuel;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface GlobalFuelPriceRepository extends JpaRepository<GlobalFuelPrice, Long> {

    // Returns the most recently set price for a given pump and fuel type
    Optional<GlobalFuelPrice> findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(Long pumpId, FuelType fuelType);

    // Returns all current prices for a pump (latest per fuel type)
    @Query("""
            SELECT g FROM GlobalFuelPrice g
            WHERE g.pumpId = :pumpId
              AND g.effectiveFrom = (
                  SELECT MAX(g2.effectiveFrom) FROM GlobalFuelPrice g2
                  WHERE g2.pumpId = g.pumpId AND g2.fuelType = g.fuelType
              )
            """)
    List<GlobalFuelPrice> findCurrentPricesForPump(Long pumpId);

    /**
     * Returns the most recently set price for a pump and fuel type on or before a given point in time.
     * Used during backfill to resolve the historical price that was in effect on the shift date.
     *
     * Spring Data's findFirst + OrderBy translates to LIMIT 1 in native SQL without requiring
     * JPQL LIMIT syntax (which is not part of the JPQL spec).
     *
     * @param pumpId    the pump
     * @param fuelType  the fuel type
     * @param asOf      the upper bound (exclusive start of the day AFTER the shift date in IST)
     */
    Optional<GlobalFuelPrice> findFirstByPumpIdAndFuelTypeAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
            Long pumpId, FuelType fuelType, OffsetDateTime asOf);
}
