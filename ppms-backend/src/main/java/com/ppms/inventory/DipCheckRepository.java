package com.ppms.inventory;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface DipCheckRepository extends JpaRepository<DipCheck, Long> {

    List<DipCheck> findByTankIdOrderByCheckedAtDesc(Long tankId);

    List<DipCheck> findByPumpIdOrderByCheckedAtDesc(Long pumpId);

    Page<DipCheck> findByPumpIdOrderByCheckedAtDesc(Long pumpId, Pageable pageable);

    /** Used by balance sheet generation to pull DIP variances within a report period. */
    List<DipCheck> findByPumpIdAndCheckedAtBetween(Long pumpId, OffsetDateTime from, OffsetDateTime to);
}
