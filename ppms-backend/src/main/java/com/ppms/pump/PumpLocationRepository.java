package com.ppms.pump;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PumpLocationRepository extends JpaRepository<PumpLocation, Long> {

    List<PumpLocation> findByOwnerId(Long ownerId);

    /** Batch-load pumps for multiple owners — used by SuperAdmin list to avoid N+1. */
    List<PumpLocation> findByOwnerIdIn(List<Long> ownerIds);

    /** Returns only enabled pumps for an owner — used by the owner dashboard view. */
    List<PumpLocation> findByOwnerIdAndEnabledTrue(Long ownerId);

    boolean existsByOwnerIdAndName(Long ownerId, String name);

    /** Used by PumpAccessInterceptor to verify a pump belongs to a given OWNER. */
    boolean existsByIdAndOwnerId(Long id, Long ownerId);

    /** Acquires a row-level write lock on the pump row.
     *  Use this before any operation that requires serializing concurrent writes scoped to one pump
     *  (e.g. cash-drawer balance check + insert). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM PumpLocation p WHERE p.id = :id")
    Optional<PumpLocation> findByIdForUpdate(@Param("id") Long id);
}
