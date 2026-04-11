package com.ppms.credit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CreditEntryReassignmentRepository extends JpaRepository<CreditEntryReassignment, Long> {

    List<CreditEntryReassignment> findByCreditEntryIdOrderByReassignedAtDesc(Long creditEntryId);
}
