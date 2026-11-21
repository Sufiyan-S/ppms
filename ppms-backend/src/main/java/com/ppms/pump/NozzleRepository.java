package com.ppms.pump;

import com.ppms.fuel.FuelType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NozzleRepository extends JpaRepository<Nozzle, Long> {

    List<Nozzle> findByDuIdOrderByNozzleNumberAsc(Long duId);

    Optional<Nozzle> findByIdAndDuId(Long id, Long duId);

    @Query("""
            SELECT COUNT(n) > 0 FROM Nozzle n, DispensaryUnit d
            WHERE n.id = :nozzleId AND d.id = n.duId AND d.pumpId = :pumpId
            """)
    boolean existsOnPump(@Param("nozzleId") Long nozzleId, @Param("pumpId") Long pumpId);

    List<Nozzle> findByDuIdAndStatus(Long duId, NozzleStatus status);

    /** Returns all nozzles across multiple DUs — used when building DU responses. */
    List<Nozzle> findByDuIdIn(List<Long> duIds);

    boolean existsByDuIdAndNozzleNumber(Long duId, Integer nozzleNumber);

    /** Used to check if any nozzle on a DU is CNG, to enforce the CNG-only DU rule. */
    boolean existsByDuIdAndFuelType(Long duId, FuelType fuelType);

    long countByDuId(Long duId);
}
