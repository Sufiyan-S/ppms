package com.ppms.bank;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BankStatementImportRepository extends JpaRepository<BankStatementImport, Long> {

    /** Returns all imports for a pump, newest first. */
    List<BankStatementImport> findByPumpIdOrderByImportedAtDesc(Long pumpId);
}
