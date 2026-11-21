package com.ppms.adjustment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface NozzleReadingAdjustmentRepository extends JpaRepository<NozzleReadingAdjustment, Long> {

    List<NozzleReadingAdjustment> findByNozzleIdOrderByCreatedAtDesc(Long nozzleId);

    /** Amendments recorded within [from, to) — used by balance sheet generation. */
    List<NozzleReadingAdjustment> findByPumpIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAsc(
            Long pumpId, OffsetDateTime from, OffsetDateTime to);
}
