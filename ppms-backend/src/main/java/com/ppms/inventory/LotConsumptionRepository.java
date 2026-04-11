package com.ppms.inventory;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LotConsumptionRepository extends JpaRepository<LotConsumption, Long> {

    List<LotConsumption> findByShiftId(Long shiftId);

    /** Batch fetch for all consumptions across multiple shifts — avoids N+1 in P&L report. */
    List<LotConsumption> findByShiftIdIn(java.util.Collection<Long> shiftIds);

    /** All consumptions from a specific lot — used by inventory lots report. */
    List<LotConsumption> findByLotId(Long lotId);

    /** Batch fetch for all consumptions across multiple lots — avoids N+1 in inventory lots report. */
    List<LotConsumption> findByLotIdIn(java.util.Collection<Long> lotIds);
}
