package com.ppms.fuel;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

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
}
