package com.ppms.pump;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NozzleRepository extends JpaRepository<Nozzle, Long> {

    List<Nozzle> findByPumpIdAndStatus(Long pumpId, NozzleStatus status);

    List<Nozzle> findByPumpIdOrderByNozzleNumberAsc(Long pumpId);

    boolean existsByPumpIdAndNozzleNumber(Long pumpId, Integer nozzleNumber);

    long countByPumpId(Long pumpId);
}
