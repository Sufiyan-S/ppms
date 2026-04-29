package com.ppms.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByPhoneNumber(String phoneNumber);

    boolean existsByPhoneNumber(String phoneNumber);

    boolean existsByPhoneNumberAndIdNot(String phoneNumber, Long id);

    boolean existsByEmployeeId(String employeeId);

    List<User> findByAssignedPumpIdAndRoleAndStatus(Long pumpId, UserRole role, UserStatus status);

    List<User> findByAssignedPumpIdAndStatus(Long pumpId, UserStatus status);

    /** All staff at a pump regardless of status — used by Setup page to show active + inactive. */
    List<User> findByAssignedPumpId(Long pumpId);

    /** Count of users assigned to a pump — used to generate sequential employee IDs (EMP{pumpId}{seq}). */
    long countByAssignedPumpId(Long pumpId);

    /** All users with a given role — used by SUPER_ADMIN to list all pump owners. */
    List<User> findByRole(UserRole role);

    /** Count of users with a given role — used by SUPER_ADMIN analytics. */
    long countByRole(UserRole role);

    /** Batch staff count per pump — returns [pumpId, count] pairs. Avoids N+1 when building owner summary. */
    @Query("SELECT u.assignedPumpId, COUNT(u) FROM User u WHERE u.assignedPumpId IN :pumpIds GROUP BY u.assignedPumpId")
    List<Object[]> countStaffByPumpIds(@Param("pumpIds") List<Long> pumpIds);
}
