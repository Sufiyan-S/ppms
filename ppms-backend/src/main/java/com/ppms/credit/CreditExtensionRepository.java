package com.ppms.credit;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CreditExtensionRepository extends JpaRepository<CreditExtension, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM CreditExtension e WHERE e.id = :id")
    Optional<CreditExtension> findByIdForUpdate(Long id);

    List<CreditExtension> findByPumpIdAndClientIdOrderByCreatedAtDesc(Long pumpId, Long clientId);

    /** ACTIVE extensions still in effect on the given day; rows past expiry stay ACTIVE until the daily expiry job runs. */
    @Query("""
            SELECT e FROM CreditExtension e
            WHERE e.pumpId = :pumpId AND e.clientId = :clientId
              AND e.status = 'ACTIVE' AND e.expiryDate >= :today
            """)
    List<CreditExtension> findInEffect(Long pumpId, Long clientId, LocalDate today);

    @Query("""
            SELECT e FROM CreditExtension e
            WHERE e.pumpId = :pumpId AND e.status = 'ACTIVE' AND e.expiryDate >= :today
            """)
    List<CreditExtension> findInEffectAtPump(Long pumpId, LocalDate today);

    @Query("""
            SELECT e FROM CreditExtension e
            WHERE e.pumpId = :pumpId AND e.clientId = :clientId AND e.extensionType = :type
              AND e.status = 'ACTIVE' AND e.expiryDate >= :today
            """)
    Optional<CreditExtension> findInEffectOfType(Long pumpId, Long clientId, CreditExtensionType type, LocalDate today);

    @Modifying
    @Query("""
            UPDATE CreditExtension e SET e.status = 'EXPIRED'
            WHERE e.status = 'ACTIVE' AND e.expiryDate < :today
            """)
    int expireOverdueExtensions(LocalDate today);

    boolean existsByClientId(Long clientId);
}
