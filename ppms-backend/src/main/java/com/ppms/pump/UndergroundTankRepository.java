package com.ppms.pump;

import com.ppms.fuel.FuelType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface UndergroundTankRepository extends JpaRepository<UndergroundTank, Long> {

    List<UndergroundTank> findByPumpIdAndStatus(Long pumpId, TankStatus status);

    /** Returns all tanks for a pump regardless of status. Used for deletions and setup listing. */
    List<UndergroundTank> findByPumpId(Long pumpId);

    List<UndergroundTank> findByPumpIdIn(Collection<Long> pumpIds);

    Optional<UndergroundTank> findByIdAndPumpId(Long id, Long pumpId);

    boolean existsByPumpIdAndTankIdentifier(Long pumpId, String tankIdentifier);

    // Every path that changes currentStock must hold this lock, taken before any inventory lot lock.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM UndergroundTank t WHERE t.id = :id")
    Optional<UndergroundTank> findByIdForUpdate(@Param("id") Long id);

    @Query("SELECT t.id FROM UndergroundTank t WHERE t.pumpId = :pumpId AND t.fuelType IN :fuelTypes")
    List<Long> findIdsByPumpIdAndFuelTypeIn(@Param("pumpId") Long pumpId,
                                            @Param("fuelTypes") Collection<FuelType> fuelTypes);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM UndergroundTank t WHERE t.id IN :ids ORDER BY t.id")
    List<UndergroundTank> findAllByIdForUpdate(@Param("ids") Collection<Long> ids);
}
