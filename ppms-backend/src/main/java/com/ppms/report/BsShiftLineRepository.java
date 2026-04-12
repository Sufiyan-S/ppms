package com.ppms.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BsShiftLineRepository extends JpaRepository<BsShiftLine, Long> {
    List<BsShiftLine> findByBalanceSheetIdOrderByDuNumber(Long balanceSheetId);

    /** Count-only query — avoids loading full entities just to count shifts in the list view. */
    int countByBalanceSheetId(Long balanceSheetId);
}
