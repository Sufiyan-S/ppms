package com.ppms.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface BsShiftLineRepository extends JpaRepository<BsShiftLine, Long> {
    List<BsShiftLine> findByBalanceSheetIdOrderByDuNumber(Long balanceSheetId);

    /** Count-only query — avoids loading full entities just to count shifts in the list view. */
    int countByBalanceSheetId(Long balanceSheetId);

    /** Batch count for the list view — single query instead of one per balance sheet row. */
    @Query("SELECT b.balanceSheetId, COUNT(b) FROM BsShiftLine b WHERE b.balanceSheetId IN :ids GROUP BY b.balanceSheetId")
    List<Object[]> countGroupedByBalanceSheetIdIn(@Param("ids") Collection<Long> ids);
}
