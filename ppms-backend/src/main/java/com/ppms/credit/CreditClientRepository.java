package com.ppms.credit;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CreditClientRepository extends JpaRepository<CreditClient, Long> {

    List<CreditClient> findByPumpIdOrderByNameAsc(Long pumpId);

    boolean existsByPumpIdAndName(Long pumpId, String name);

    // Root-client uniqueness check: name must be unique per pump among root accounts only
    boolean existsByPumpIdAndNameIgnoreCaseAndParentClientIdIsNull(Long pumpId, String name);

    // Sub-account uniqueness check: name must be unique per parent
    boolean existsByParentClientIdAndNameIgnoreCase(Long parentClientId, String name);

    // Used by ShiftService to resolve client_id by name at shift close
    Optional<CreditClient> findByPumpIdAndName(Long pumpId, String name);

    /**
     * Fetches a client with a PESSIMISTIC WRITE lock (SELECT FOR UPDATE).
     *
     * Used exclusively in the credit limit enforcement path (validateCreditSaleAllowed).
     * Two operators at the same pump can simultaneously add credit entries for the same
     * fleet client. Without a row-level lock, both could read the same outstanding balance,
     * both pass the limit check, and together exceed the limit with no error.
     *
     * The lock serialises concurrent credit sales for the same limit-holder so only one
     * transaction can read-and-check at a time. The calling method (validateCreditSaleAllowed)
     * runs within a @Transactional boundary — the lock is held until that transaction commits.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM CreditClient c WHERE c.id = :id")
    Optional<CreditClient> findByIdForUpdate(@Param("id") Long id);

    // Used by InterestStagingJob to fetch only clients matching a given interest billing period
    List<CreditClient> findByInterestPeriod(InterestPeriod interestPeriod);

    // Sub-account queries — used to enforce hierarchy and compute parent-level outstanding
    List<CreditClient> findByParentClientId(Long parentClientId);

    // Returns only root (parent/standalone) accounts for a pump — excludes sub-accounts
    List<CreditClient> findByPumpIdAndParentClientIdIsNullOrderByNameAsc(Long pumpId);

    // Used by the public credit balance portal — lookup by phone number
    Optional<CreditClient> findByPumpIdAndPhone(Long pumpId, String phone);

    // Pump-wide phone lookup — used for root client creation (no group yet, any match is a conflict)
    boolean existsByPumpIdAndPhone(Long pumpId, String phone);

    // Group-aware phone conflict check for sub-account create/update.
    // A conflict exists if any client in the pump has this phone AND is NOT in the same group
    // (group = the parent itself + all its direct sub-accounts).
    @Query("SELECT COUNT(c) > 0 FROM CreditClient c WHERE c.pumpId = :pumpId AND c.phone = :phone AND c.id <> :parentId AND (c.parentClientId IS NULL OR c.parentClientId <> :parentId)")
    boolean existsPhoneConflictForSubAccount(@Param("pumpId") Long pumpId, @Param("phone") String phone, @Param("parentId") Long parentId);

    // Group-aware phone conflict check for root client update.
    // A conflict exists if any client in the pump has this phone AND is NOT in the root client's own group
    // (group = the root client itself + all its direct sub-accounts).
    @Query("SELECT COUNT(c) > 0 FROM CreditClient c WHERE c.pumpId = :pumpId AND c.phone = :phone AND c.id <> :clientId AND (c.parentClientId IS NULL OR c.parentClientId <> :clientId)")
    boolean existsPhoneConflictForRootClientUpdate(@Param("pumpId") Long pumpId, @Param("phone") String phone, @Param("clientId") Long clientId);
}
