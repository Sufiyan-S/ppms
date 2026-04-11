package com.ppms.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BsFuelLineRepository extends JpaRepository<BsFuelLine, Long> {
    List<BsFuelLine> findByBalanceSheetIdOrderByFuelType(Long balanceSheetId);
}
