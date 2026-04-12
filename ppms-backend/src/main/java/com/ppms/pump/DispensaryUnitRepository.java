package com.ppms.pump;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DispensaryUnitRepository extends JpaRepository<DispensaryUnit, Long> {

    List<DispensaryUnit> findByPumpIdOrderByDuNumberAsc(Long pumpId);

    List<DispensaryUnit> findByPumpIdAndStatus(Long pumpId, NozzleStatus status);

    boolean existsByPumpIdAndName(Long pumpId, String name);

    long countByPumpId(Long pumpId);

    /** Used when assigning the next du_number for a new DU. */
    @Query("SELECT COALESCE(MAX(d.duNumber), 0) FROM DispensaryUnit d WHERE d.pumpId = :pumpId")
    int findMaxDuNumberByPumpId(Long pumpId);

    Optional<DispensaryUnit> findByPumpIdAndDuNumber(Long pumpId, Integer duNumber);
}
