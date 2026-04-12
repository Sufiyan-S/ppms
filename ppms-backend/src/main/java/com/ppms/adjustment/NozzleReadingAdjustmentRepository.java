package com.ppms.adjustment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface NozzleReadingAdjustmentRepository extends JpaRepository<NozzleReadingAdjustment, Long> {

    List<NozzleReadingAdjustment> findByNozzleIdOrderByCreatedAtDesc(Long nozzleId);

    /** Used by balance sheet generation to surface amendments within a report period. */
    List<NozzleReadingAdjustment> findByPumpIdAndCreatedAtBetweenOrderByCreatedAtAsc(
            Long pumpId, OffsetDateTime from, OffsetDateTime to);
}
