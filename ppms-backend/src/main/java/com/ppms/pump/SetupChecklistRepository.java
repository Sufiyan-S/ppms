package com.ppms.pump;

import com.ppms.user.UserStatus;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/** Per-pump counts behind the setup checklist, each one query for any number of pumps. */
public interface SetupChecklistRepository extends Repository<PumpLocation, Long> {

    /** [pumpId, fuelType, tankId] for every active nozzle on an active DU. */
    @Query("""
            SELECT d.pumpId, n.fuelType, n.tankId FROM Nozzle n, DispensaryUnit d
            WHERE d.id = n.duId
              AND d.pumpId IN :pumpIds
              AND n.status = :active
              AND d.status = :active
            """)
    List<Object[]> findActiveNozzles(@Param("pumpIds") Collection<Long> pumpIds,
                                     @Param("active") NozzleStatus active);

    /** [pumpId, count] of tanks that are not decommissioned. */
    @Query("""
            SELECT t.pumpId, COUNT(t) FROM UndergroundTank t
            WHERE t.pumpId IN :pumpIds AND t.status <> :decommissioned
            GROUP BY t.pumpId
            """)
    List<Object[]> countTanksInUse(@Param("pumpIds") Collection<Long> pumpIds,
                                   @Param("decommissioned") TankStatus decommissioned);

    /** [pumpId, count] of shift definitions in effect on the date. */
    @Query("""
            SELECT d.pumpId, COUNT(d) FROM PumpShiftDefinition d
            WHERE d.pumpId IN :pumpIds
              AND d.effectiveFrom <= :date
              AND (d.effectiveTo IS NULL OR d.effectiveTo >= :date)
            GROUP BY d.pumpId
            """)
    List<Object[]> countShiftDefinitionsInEffect(@Param("pumpIds") Collection<Long> pumpIds,
                                                 @Param("date") LocalDate date);

    /** [pumpId, count] of staff assigned to the pump with the given status. */
    @Query("""
            SELECT u.assignedPumpId, COUNT(u) FROM User u
            WHERE u.assignedPumpId IN :pumpIds AND u.status = :status
            GROUP BY u.assignedPumpId
            """)
    List<Object[]> countStaff(@Param("pumpIds") Collection<Long> pumpIds, @Param("status") UserStatus status);

    /** [pumpId, count] of active credit clients. */
    @Query("""
            SELECT c.pumpId, COUNT(c) FROM CreditClient c
            WHERE c.pumpId IN :pumpIds AND c.isActive = true
            GROUP BY c.pumpId
            """)
    List<Object[]> countActiveCreditClients(@Param("pumpIds") Collection<Long> pumpIds);
}
