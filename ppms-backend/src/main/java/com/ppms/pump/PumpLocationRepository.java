package com.ppms.pump;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

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
}
