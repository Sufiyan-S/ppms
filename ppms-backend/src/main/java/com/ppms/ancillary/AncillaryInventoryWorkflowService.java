package com.ppms.ancillary;

import com.ppms.common.time.BusinessClock;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.credit.CreditClientRepository;
import com.ppms.transaction.TransactionPaymentMode;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AncillaryInventoryWorkflowService {

    private final AncillaryProductRepository productRepository;
    private final AncillaryProductPriceRepository priceRepository;
    private final AncillaryStockDeliveryRepository deliveryRepository;
    private final AncillaryStockLotRepository lotRepository;
    private final AncillaryLotConsumptionRepository consumptionRepository;
    private final AncillarySaleRepository saleRepository;
    private final CashEventRepository cashEventRepository;
    private final AncillaryProductAccessService accessService;
    private final CreditClientRepository creditClientRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    @Transactional
    public AncillaryProduct createProduct(Long pumpId, CreateProductRequest request) {
        BigDecimal gstRate = request.getGstRatePercent() != null
                ? request.getGstRatePercent().setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("18.00");

        AncillaryProduct product = AncillaryProduct.builder()
                .pumpId(pumpId)
                .name(request.getName().trim())
                .brand(request.getBrand() != null ? request.getBrand().trim() : null)
                .variant(request.getVariant() != null ? request.getVariant().trim() : null)
                .packageSize(request.getPackageSize().setScale(3, RoundingMode.HALF_UP))
                .unitOfMeasure(request.getUnitOfMeasure())
                .currentStockUnits(0)
                .lowStockThreshold(request.getLowStockThreshold())
                .gstRatePercent(gstRate)
                .status(AncillaryProductStatus.ACTIVE)
                .build();

        return productRepository.save(product);
    }

    @Transactional
    public AncillaryProduct updateProduct(Long pumpId, Long productId, UpdateProductRequest request) {
        AncillaryProduct product = accessService.requireProductForPumpForUpdate(productId, pumpId);
        if (request.getBrand() != null) {
            product.setBrand(request.getBrand().isBlank() ? null : request.getBrand().trim());
        }
        if (request.getVariant() != null) {
            product.setVariant(request.getVariant().isBlank() ? null : request.getVariant().trim());
        }
        if (request.isLowStockThresholdProvided()) {
            product.setLowStockThreshold(request.getLowStockThreshold());
        }
        if (request.getGstRatePercent() != null) {
            product.setGstRatePercent(request.getGstRatePercent().setScale(2, RoundingMode.HALF_UP));
        }
        return productRepository.save(product);
    }

    @Transactional
    public AncillaryProduct setProductStatus(Long pumpId, Long productId, AncillaryProductStatus status) {
        AncillaryProduct product = accessService.requireProductForPumpForUpdate(productId, pumpId);
        product.setStatus(status);
        return productRepository.save(product);
    }

    @Transactional
    public AncillaryProductPrice setPrice(Long pumpId, Long productId, SetProductPriceRequest request, User currentUser) {
        AncillaryProduct product = accessService.requireProductForPump(productId, pumpId);
        AncillaryProductPrice price = AncillaryProductPrice.builder()
                .productId(product.getId())
                .pumpId(pumpId)
                .pricePerUnit(request.getPricePerUnit().setScale(2, RoundingMode.HALF_UP))
                .effectiveFrom(businessClock.now())
                .setByUserId(currentUser.getId())
                .build();
        return priceRepository.save(price);
    }

    @Transactional
    public DeliveryResult recordDelivery(Long pumpId, Long productId, RecordStockDeliveryRequest request, User currentUser) {
        AncillaryProduct product = accessService.requireProductForPumpForUpdate(productId, pumpId);
        if (product.getStatus() == AncillaryProductStatus.INACTIVE) {
            throw new BusinessException("Product '" + product.getName() + "' is INACTIVE. Re-activate it before recording a delivery.");
        }

        // Mark as backfilled when the delivery date is before today — historical entry.
        boolean isBackfilled = request.getDeliveryDate().isBefore(businessClock.today());

        AncillaryStockDelivery delivery = deliveryRepository.save(AncillaryStockDelivery.builder()
                .productId(product.getId())
                .pumpId(pumpId)
                .quantityUnits(request.getQuantityUnits())
                .costPricePerUnit(request.getCostPricePerUnit().setScale(2, RoundingMode.HALF_UP))
                .deliveryDate(request.getDeliveryDate())
                .invoiceReference(request.getInvoiceReference() != null ? request.getInvoiceReference().trim() : null)
                .notes(request.getNotes())
                .loggedByUserId(currentUser.getId())
                .isBackfilled(isBackfilled)
                .build());

        AncillaryStockLot lot = lotRepository.save(AncillaryStockLot.builder()
                .deliveryId(delivery.getId())
                .productId(product.getId())
                .pumpId(pumpId)
                .originalQuantity(request.getQuantityUnits())
                .remainingQuantity(request.getQuantityUnits())
                .costPricePerUnit(delivery.getCostPricePerUnit())
                .deliveryDate(request.getDeliveryDate())
                .status(AncillaryLotStatus.ACTIVE)
                .build());

        product.setCurrentStockUnits(product.getCurrentStockUnits() + request.getQuantityUnits());
        productRepository.save(product);

        auditService.log(pumpId,
                delivery.isBackfilled() ? AuditAction.ANCILLARY_DELIVERY_BACKFILLED : AuditAction.ANCILLARY_DELIVERY_RECORDED,
                "AncillaryStockDelivery", delivery.getId().toString(),
                (delivery.isBackfilled() ? "Backfilled stock delivery: " : "Stock delivery: ")
                + product.getName() + " × " + request.getQuantityUnits() +
                " units at ₹" + delivery.getCostPricePerUnit() + "/unit",
                currentUser);

        return DeliveryResult.builder()
                .product(product)
                .delivery(delivery)
                .lot(lot)
                .build();
    }

    @Transactional
    public SaleResult recordSale(Long pumpId, RecordAncillarySaleRequest request, User currentUser) {
        AncillaryProduct product = accessService.requireProductForPumpForUpdate(request.getProductId(), pumpId);
        if (product.getStatus() == AncillaryProductStatus.INACTIVE) {
            throw new BusinessException("Product '" + product.getName() + "' is INACTIVE and cannot be sold.");
        }
        if (request.getClientId() != null && !creditClientRepository.existsByIdAndPumpId(request.getClientId(), pumpId)) {
            throw new ResourceNotFoundException("Credit client not found");
        }
        if (request.getPaymentMode() == TransactionPaymentMode.CREDIT
                && (request.getClientName() == null || request.getClientName().isBlank())) {
            throw new BusinessException("Client name is required for CREDIT payment mode.");
        }
        if (product.getCurrentStockUnits() < request.getQuantityUnits()) {
            throw new BusinessException(
                    "Insufficient stock for '" + product.getName() + "'. Available: "
                            + product.getCurrentStockUnits() + " units, requested: " + request.getQuantityUnits() + " units.");
        }

        BigDecimal sellingPrice = resolveSellingPrice(pumpId, product, request.getSellingPricePerUnit(), currentUser);
        LocalDate today = businessClock.today();

        AncillarySale sale = saleRepository.save(newSale(pumpId, product, request.getQuantityUnits(), sellingPrice,
                request.getPaymentMode(), request.getClientName(), request.getBillNo(), request.getNotes(), currentUser)
                .clientId(request.getClientId())
                .saleDate(today)
                .build());

        deductFromLots(product.getId(), sale.getId(), request.getQuantityUnits());
        CashEvent cashEvent = reduceStockAndRecordCash(product, sale, "Counter sale: ", today, currentUser);

        auditService.log(pumpId, AuditAction.ANCILLARY_SALE_RECORDED,
                "AncillarySale", sale.getId().toString(),
                "Sale: " + product.getName() + " × " + request.getQuantityUnits() + " units, total ₹" +
                sale.getTotalAmount() + " (" + request.getPaymentMode() + ")",
                currentUser);

        return SaleResult.builder()
                .product(product)
                .sale(sale)
                .cashEvent(cashEvent)
                .build();
    }

    /**
     * The sale uses the product's configured current price. Only OWNER/ADMIN may sell at a different
     * price, and such overrides are audit-logged.
     */
    private BigDecimal resolveSellingPrice(Long pumpId, AncillaryProduct product, BigDecimal requestedPrice, User currentUser) {
        BigDecimal configuredPrice = priceRepository
                .findFirstByProductIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(product.getId(), businessClock.now())
                .map(price -> price.getPricePerUnit().setScale(2, RoundingMode.HALF_UP))
                .orElseThrow(() -> new BusinessException(
                        "No selling price is set for '" + product.getName() + "'. Set a price before recording a sale."));
        BigDecimal requested = requestedPrice.setScale(2, RoundingMode.HALF_UP);
        if (requested.compareTo(configuredPrice) == 0) {
            return configuredPrice;
        }
        boolean canOverride = currentUser.getRole() == UserRole.OWNER
                || currentUser.getRole() == UserRole.ADMIN
                || currentUser.getRole() == UserRole.SUPER_ADMIN;
        if (!canOverride) {
            throw new BusinessException("The selling price for '" + product.getName() + "' is ₹" + configuredPrice
                    + ". Only an Owner or Admin can sell at a different price.");
        }
        auditService.log(pumpId, AuditAction.ANCILLARY_PRICE_OVERRIDDEN,
                "AncillaryProduct", product.getId().toString(),
                "Sold '" + product.getName() + "' at ₹" + requested + " instead of configured ₹" + configuredPrice,
                currentUser);
        return requested;
    }

    @Transactional
    public LotCorrectionResult updateLot(Long pumpId, Long lotId, UpdateLotRequest request) {
        AncillaryProduct product = accessService.requireProductForPumpForUpdate(
                accessService.requireProductIdOfLot(lotId, pumpId), pumpId);
        AncillaryStockLot lot = accessService.requireLotForPump(lotId, pumpId);

        if (request.getRemainingQuantity() != null) {
            int newQty = request.getRemainingQuantity();
            if (newQty < 0) {
                throw new BusinessException("Remaining quantity cannot be negative.");
            }
            if (newQty > lot.getOriginalQuantity()) {
                throw new BusinessException(
                        "Remaining quantity cannot exceed original quantity (" + lot.getOriginalQuantity() + ").");
            }
            int delta = newQty - lot.getRemainingQuantity();
            lot.setRemainingQuantity(newQty);
            lot.setStatus(newQty == 0 ? AncillaryLotStatus.EXHAUSTED : AncillaryLotStatus.ACTIVE);
            product.setCurrentStockUnits(product.getCurrentStockUnits() + delta);
            productRepository.save(product);
        }

        if (request.getCostPricePerUnit() != null) {
            if (request.getCostPricePerUnit().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Cost price must be greater than 0.");
            }
            lot.setCostPricePerUnit(request.getCostPricePerUnit().setScale(2, RoundingMode.HALF_UP));
        }

        AncillaryStockLot savedLot = lotRepository.save(lot);
        AncillaryStockDelivery delivery = deliveryRepository.findById(savedLot.getDeliveryId()).orElse(null);
        return LotCorrectionResult.builder()
                .lot(savedLot)
                .delivery(delivery)
                .build();
    }

    /**
     * Retroactively records a historical counter sale.
     *
     * Business rules enforced:
     * 1. saleDate must be strictly before today (IST).
     * 2. A selling price must have been set on or before saleDate — resolved from price history.
     * 3. At least one active stock lot must have a deliveryDate ≤ saleDate.
     * 4. The total remaining quantity across those historical lots must cover the request.
     * 5. Only ADMIN and OWNER roles are allowed (enforced at the controller layer).
     *
     * The FIFO deduction is restricted to lots whose deliveryDate ≤ saleDate so that
     * stock that arrived AFTER the sale date is never consumed retroactively.
     */
    @Transactional
    public SaleResult backfillSale(Long pumpId, BackfillSaleRequest request, User currentUser) {
        if (!request.getSaleDate().isBefore(businessClock.today())) {
            throw new BusinessException(
                    "Sale date must be strictly in the past. Use the regular Sell button for today's sales.");
        }

        if (request.getPaymentMode() == TransactionPaymentMode.CREDIT
                && (request.getClientName() == null || request.getClientName().isBlank())) {
            throw new BusinessException("Client name is required for CREDIT payment mode.");
        }

        AncillaryProduct product = accessService.requireProductForPumpForUpdate(request.getProductId(), pumpId);

        BigDecimal sellingPrice = priceOnDate(product, request.getSaleDate());
        List<AncillaryStockLot> historicalLots = lotsCoveringBackfill(product, request);

        AncillarySale sale = saleRepository.save(newSale(pumpId, product, request.getQuantityUnits(), sellingPrice,
                request.getPaymentMode(), request.getClientName(), request.getBillNo(), request.getNotes(), currentUser)
                .saleDate(request.getSaleDate())
                .isBackfilled(true)
                .build());

        deductFromSpecificLots(historicalLots, sale.getId(), request.getQuantityUnits());
        // Dated to the sale day so that day's cash reconciliation includes it.
        CashEvent cashEvent = reduceStockAndRecordCash(product, sale, "Backfilled sale: ", request.getSaleDate(), currentUser);

        log.info("Ancillary sale backfilled: pump={}, productId={}, saleId={}, saleDate={}, units={}, price={}, by={}",
                pumpId, product.getId(), sale.getId(), request.getSaleDate(),
                request.getQuantityUnits(), sellingPrice, currentUser.getId());

        auditService.log(pumpId, AuditAction.ANCILLARY_SALE_BACKFILLED,
                "AncillarySale", sale.getId().toString(),
                "Backfilled sale: " + product.getName() + " × " + request.getQuantityUnits() +
                " units on " + request.getSaleDate() + ", total ₹" +
                sale.getTotalAmount() + " (" + request.getPaymentMode() + ")",
                currentUser);

        return SaleResult.builder()
                .product(product)
                .sale(sale)
                .cashEvent(cashEvent)
                .build();
    }

    // A price set at any time on the sale date applies to that day's sales.
    private BigDecimal priceOnDate(AncillaryProduct product, LocalDate saleDate) {
        OffsetDateTime endOfSaleDay = saleDate.plusDays(1).atStartOfDay(businessClock.zone()).toOffsetDateTime();
        return priceRepository
                .findFirstByProductIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(product.getId(), endOfSaleDay)
                .map(AncillaryProductPrice::getPricePerUnit)
                .orElseThrow(() -> new BusinessException(
                        "No selling price was set for '" + product.getName() +
                        "' on or before " + saleDate +
                        ". Set a price first (even a historical one) before backfilling this sale."));
    }

    private List<AncillaryStockLot> lotsCoveringBackfill(AncillaryProduct product, BackfillSaleRequest request) {
        List<AncillaryStockLot> historicalLots = lotRepository
                .findActiveLotsByProductAvailableOnDate(product.getId(), request.getSaleDate());
        int availableOnDate = historicalLots.stream()
                .mapToInt(AncillaryStockLot::getRemainingQuantity)
                .sum();
        if (availableOnDate < request.getQuantityUnits()) {
            throw new BusinessException(
                    "Insufficient historical stock for '" + product.getName() +
                    "' on " + request.getSaleDate() +
                    ". Stock available from lots delivered on or before that date: " + availableOnDate +
                    " units. Requested: " + request.getQuantityUnits() +
                    " units. Record a historical stock delivery first.");
        }
        return historicalLots;
    }

    private AncillarySale.AncillarySaleBuilder newSale(Long pumpId, AncillaryProduct product, int quantityUnits,
                                                       BigDecimal sellingPrice, TransactionPaymentMode paymentMode,
                                                       String clientName, String billNo, String notes, User soldBy) {
        BigDecimal totalAmount = sellingPrice.multiply(new BigDecimal(quantityUnits)).setScale(2, RoundingMode.HALF_UP);
        return AncillarySale.builder()
                .pumpId(pumpId)
                .productId(product.getId())
                .quantityUnits(quantityUnits)
                .sellingPricePerUnit(sellingPrice)
                .totalAmount(totalAmount)
                .gstAmount(BigDecimal.ZERO.setScale(2))
                .totalWithGst(totalAmount)
                .paymentMode(paymentMode)
                .clientName(clientName != null ? clientName.trim() : null)
                .billNo(billNo != null ? billNo.trim() : null)
                .notes(notes)
                .soldByUserId(soldBy.getId());
    }

    private CashEvent reduceStockAndRecordCash(AncillaryProduct product, AncillarySale sale, String descriptionPrefix,
                                               LocalDate cashDate, User recordedBy) {
        product.setCurrentStockUnits(product.getCurrentStockUnits() - sale.getQuantityUnits());
        productRepository.save(product);

        if (sale.getPaymentMode() != TransactionPaymentMode.CASH) {
            return null;
        }
        return cashEventRepository.save(CashEvent.builder()
                .pumpId(sale.getPumpId())
                .eventType(CashEventType.CASH_IN)
                .amount(sale.getTotalAmount())
                .description(descriptionPrefix + product.getName() + " × " + sale.getQuantityUnits()
                        + " units (Sale #" + sale.getId() + ")")
                .eventDate(cashDate)
                .recordedByUserId(recordedBy.getId())
                .build());
    }

    private void deductFromLots(Long productId, Long saleId, int unitsToDeduct) {
        int uncovered = consumeOldestFirst(lotRepository.findActiveLotsByProductFifo(productId), saleId, unitsToDeduct);
        if (uncovered > 0) {
            log.error("Ancillary stock lot shortage: productId={}, saleId={}, {} units not covered by any lot",
                    productId, saleId, uncovered);
            throw new BusinessException("Stock lots for this product do not cover " + uncovered
                    + " of the requested units. Correct the stock lots before selling.");
        }
    }

    /**
     * Backfill variant: the caller passes the historically available lots, already locked.
     * A shortfall is only logged because backfilled sales are reconciled manually.
     */
    private void deductFromSpecificLots(List<AncillaryStockLot> lots, Long saleId, int unitsToDeduct) {
        int uncovered = consumeOldestFirst(lots, saleId, unitsToDeduct);
        if (uncovered > 0) {
            log.warn("Backfill sale lot shortage: saleId={}, {} units not covered by historical lots. Investigate lot state.",
                    saleId, uncovered);
        }
    }

    /** Consumes units from the given lots in order and returns how many units no lot could cover. */
    private int consumeOldestFirst(List<AncillaryStockLot> lots, Long saleId, int unitsToDeduct) {
        int remaining = unitsToDeduct;
        for (AncillaryStockLot lot : lots) {
            if (remaining <= 0) break;

            int consume = Math.min(remaining, lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity() - consume);
            if (lot.getRemainingQuantity() == 0) {
                lot.setStatus(AncillaryLotStatus.EXHAUSTED);
            }
            lotRepository.save(lot);

            consumptionRepository.save(AncillaryLotConsumption.builder()
                    .lotId(lot.getId())
                    .saleId(saleId)
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());

            remaining -= consume;
        }
        return remaining;
    }

    @Getter
    @Builder
    public static class DeliveryResult {
        private AncillaryProduct product;
        private AncillaryStockDelivery delivery;
        private AncillaryStockLot lot;
    }

    @Getter
    @Builder
    public static class SaleResult {
        private AncillaryProduct product;
        private AncillarySale sale;
        private CashEvent cashEvent;
    }

    @Getter
    @Builder
    public static class LotCorrectionResult {
        private AncillaryStockLot lot;
        private AncillaryStockDelivery delivery;
    }
}
