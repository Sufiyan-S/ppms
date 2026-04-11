package com.ppms.document;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PumpDocumentRepository extends JpaRepository<PumpDocument, Long> {

    List<PumpDocument> findByPumpIdOrderByExpiryDateAsc(Long pumpId);
}
