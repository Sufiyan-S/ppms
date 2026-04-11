package com.ppms.pump;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UndergroundTankRepository extends JpaRepository<UndergroundTank, Long> {

    List<UndergroundTank> findByPumpIdAndStatus(Long pumpId, TankStatus status);

    /** Returns all tanks for a pump regardless of status. Used for deletions and setup listing. */
    List<UndergroundTank> findByPumpId(Long pumpId);

    boolean existsByPumpIdAndTankIdentifier(Long pumpId, String tankIdentifier);
}
