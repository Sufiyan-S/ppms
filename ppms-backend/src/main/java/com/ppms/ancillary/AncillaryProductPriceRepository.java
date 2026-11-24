package com.ppms.ancillary;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface AncillaryProductPriceRepository extends JpaRepository<AncillaryProductPrice, Long> {

    /** Returns the currently active selling price for a product (latest effective_from). */
    Optional<AncillaryProductPrice> findFirstByProductIdOrderByEffectiveFromDesc(Long productId);

    /** Full price history for a product, newest first. */
    List<AncillaryProductPrice> findByProductIdOrderByEffectiveFromDesc(Long productId);

    /**
     * Returns the most recently set price for a product on or before a given point in time.
     * Used during backfill to resolve the historical price that was in effect on the sale date.
     * Pass end-of-day IST on the sale date as {@code asOf} to capture any price set that day.
     */
    Optional<AncillaryProductPrice> findFirstByProductIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
            Long productId, OffsetDateTime asOf);

    /**
     * Returns the price in effect at {@code asOf} for each listed product, in a single query.
     * Products with no price in effect are absent from the result.
     */
    @Query("""
            SELECT p FROM AncillaryProductPrice p
            WHERE p.productId IN :productIds
              AND p.effectiveFrom <= :asOf
              AND NOT EXISTS (
                  SELECT 1 FROM AncillaryProductPrice newer
                  WHERE newer.productId = p.productId
                    AND newer.effectiveFrom <= :asOf
                    AND (newer.effectiveFrom > p.effectiveFrom
                         OR (newer.effectiveFrom = p.effectiveFrom AND newer.id > p.id))
              )
            """)
    List<AncillaryProductPrice> findPricesInEffectForProducts(List<Long> productIds, OffsetDateTime asOf);
}
