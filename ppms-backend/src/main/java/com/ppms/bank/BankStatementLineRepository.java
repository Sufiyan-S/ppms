package com.ppms.bank;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BankStatementLineRepository extends JpaRepository<BankStatementLine, Long> {

    /** Returns all lines for an import, ordered by transaction date. */
    List<BankStatementLine> findByImportIdOrderByTxnDateAscIdAsc(Long importId);

    /** Returns unmatched lines for an import. */
    List<BankStatementLine> findByImportIdAndMatchStatus(Long importId, BankLineMatchStatus matchStatus);

    /** Count of matched lines for an import — used to update the matched_lines counter. */
    @Query("SELECT COUNT(l) FROM BankStatementLine l WHERE l.importId = :importId AND l.matchStatus = 'MATCHED'")
    int countMatchedByImportId(@Param("importId") Long importId);
}
