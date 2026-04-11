package com.ppms.credit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CreditExtensionRepository extends JpaRepository<CreditExtension, Long> {

    List<CreditExtension> findByPumpIdAndClientIdOrderByCreatedAtDesc(Long pumpId, Long clientId);

    /** Active extension of a specific type for a client at a pump — used to enforce Business Rule 60. */
    Optional<CreditExtension> findByPumpIdAndClientIdAndExtensionTypeAndStatus(
            Long pumpId, Long clientId, CreditExtensionType type, CreditExtensionStatus status);

    /** All ACTIVE extensions for a client at a pump — used to determine which blocks to suppress. */
    List<CreditExtension> findByPumpIdAndClientIdAndStatus(Long pumpId, Long clientId, CreditExtensionStatus status);

    /** Expire all ACTIVE extensions whose expiry_date < today — called by the scheduler or on-demand. */
    @Modifying
    @Query("""
            UPDATE CreditExtension e SET e.status = 'EXPIRED'
            WHERE e.status = 'ACTIVE' AND e.expiryDate < :today
            """)
    int expireOverdueExtensions(LocalDate today);
}
