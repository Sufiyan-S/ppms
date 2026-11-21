package com.ppms.inventory;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Tanker deliveries and dip checks. Every method that changes a tank's currentStock locks the tank row first.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryWorkflowService {

    private static final BigDecimal TANKER_CAPACITY_TOLERANCE = new BigDecimal("0.5");

    private final UndergroundTankRepository tankRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final DipCheckRepository dipCheckRepository;
    private final UserRepository userRepository;
    private final GlobalFuelPriceRepository globalFuelPriceRepository;
    private final TankerRepository tankerRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;
    private final InventoryResponseAssembler responseAssembler;

    /**
     * Records one tanker delivery: a TankerDelivery row, a FIFO InventoryLot, and the added tank stock.
     */
    @Transactional
    public TankerDeliveryResponse recordDelivery(Long pumpId, RecordDeliveryRequest request, User currentUser) {
        UndergroundTank tank = tankRepository.findByIdForUpdate(request.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));
        assertTankUsable(tank, pumpId, "recording a delivery");
        assertCapacity(tank, request.getQuantityDelivered());

        String invoiceRef = request.getInvoiceReference() != null ? request.getInvoiceReference().trim() : null;
        if (invoiceRef != null && !invoiceRef.isBlank()) {
            assertInvoiceNotRecorded(pumpId, invoiceRef, tank);
        }
        validateCostPriceAgainstSellingPrice(pumpId, tank, request.getCostPricePerUnit());

        TankerDelivery delivery = createDeliveryWithLot(pumpId, tank, request.getQuantityDelivered(),
                request.getCostPricePerUnit(), startOfBusinessDay(request.getDeliveryDate()), invoiceRef,
                request.getBillTotal(), null, currentUser);

        log.info("Tanker delivery recorded: pump={}, tank={}, fuel={}, qty={}L, invoice={}, by={}",
                pumpId, tank.getId(), tank.getFuelType(),
                request.getQuantityDelivered(), request.getInvoiceReference(), currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_RECORDED,
                "TankerDelivery", delivery.getId().toString(),
                "Delivery: " + tank.getFuelType() + " " + request.getQuantityDelivered() + "L to tank " +
                tank.getTankIdentifier() + " at ₹" + request.getCostPricePerUnit() + "/L, invoice=" +
                request.getInvoiceReference(),
                currentUser);

        return responseAssembler.toDeliveryResponse(delivery, tank, currentUser.getFullName());
    }

    /**
     * Records every line of one tanker trip atomically, so a failing line leaves no tank partly updated.
     * Without a cost price, a line reuses the tank's last delivery cost.
     */
    @Transactional
    public List<TankerDeliveryResponse> recordBatchDelivery(Long pumpId, RecordBatchDeliveryRequest request, User currentUser) {
        OffsetDateTime deliveryDateTime = startOfBusinessDay(request.getDeliveryDate());
        String invoiceRef = request.getInvoiceReference().trim();

        Set<Long> tankIds = new HashSet<>();
        for (RecordBatchDeliveryRequest.LineItem item : request.getItems()) {
            if (!tankIds.add(item.getTankId())) {
                throw new BusinessException(
                        "Tank ID " + item.getTankId() + " appears more than once in this batch. " +
                        "Each tank can only receive one delivery per batch.");
            }
        }

        Tanker tanker = request.getTankerId() != null ? findTankerMatchingQuantity(pumpId, request) : null;

        tankRepository.findAllByIdForUpdate(tankIds);

        List<TankerDeliveryResponse> responses = new ArrayList<>();
        for (RecordBatchDeliveryRequest.LineItem item : request.getItems()) {
            UndergroundTank tank = tankRepository.findById(item.getTankId())
                    .orElseThrow(() -> new ResourceNotFoundException("Tank not found: " + item.getTankId()));
            if (!tank.getPumpId().equals(pumpId)) {
                throw new ResourceNotFoundException("Tank " + item.getTankId() + " not found");
            }
            assertTankUsable(tank, pumpId, "recording a delivery");
            assertCapacity(tank, item.getQuantityDelivered());
            assertInvoiceNotRecorded(pumpId, invoiceRef, tank);

            BigDecimal costPrice = item.getCostPricePerUnit() != null
                    ? item.getCostPricePerUnit()
                    : tankerDeliveryRepository.findTopByTankIdOrderByDeliveryDateDescCreatedAtDesc(tank.getId())
                            .map(TankerDelivery::getCostPricePerUnit)
                            .orElseThrow(() -> new BusinessException(
                                    "No previous delivery found for tank '" + tank.getTankIdentifier() +
                                    "' — cost price is required for the first entry. Please ask an Owner or Admin to record it."));
            validateCostPriceAgainstSellingPrice(pumpId, tank, costPrice);

            TankerDelivery delivery = createDeliveryWithLot(pumpId, tank, item.getQuantityDelivered(), costPrice,
                    deliveryDateTime, invoiceRef, request.getBillTotal(), tanker, currentUser);

            log.info("Batch delivery item recorded: pump={}, tank={}, fuel={}, qty={}L, invoice={}, by={}",
                    pumpId, tank.getId(), tank.getFuelType(), delivery.getQuantityDelivered(), invoiceRef, currentUser.getId());

            responses.add(responseAssembler.toDeliveryResponse(delivery, tank, currentUser.getFullName()));
        }
        return responses;
    }

    /**
     * Corrects a delivery and its lot, moving tank stock by the quantity change.
     * The new quantity can never go below what shifts have already consumed from the lot.
     */
    @Transactional
    public TankerDeliveryResponse updateDelivery(Long pumpId, Long deliveryId, UpdateDeliveryRequest request, User currentUser) {
        TankerDelivery delivery = tankerDeliveryRepository.findById(deliveryId)
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Delivery not found"));

        UndergroundTank tank = tankRepository.findByIdForUpdate(delivery.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));
        InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(deliveryId)
                .orElseThrow(() -> new ResourceNotFoundException("Inventory lot not found for this delivery"));

        BigDecimal consumed = lot.getOriginalQuantity().subtract(lot.getRemainingQuantity());
        BigDecimal newQty = request.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP);
        if (newQty.compareTo(consumed) < 0) {
            throw new BusinessException(
                    "Cannot reduce quantity to " + newQty + "L — " + consumed.setScale(3, RoundingMode.HALF_UP) +
                    "L of this lot has already been consumed. New quantity must be at least " +
                    consumed.setScale(3, RoundingMode.HALF_UP) + "L.");
        }

        String invoiceRef = request.getInvoiceReference().trim();
        List<TankerDelivery> otherInvoiceLines = otherLinesOfInvoice(pumpId, delivery);
        assertInvoiceFreeForLines(pumpId, invoiceRef, delivery, otherInvoiceLines);

        BigDecimal oldQty = lot.getOriginalQuantity();
        BigDecimal deltaQty = newQty.subtract(oldQty);
        BigDecimal newStock = tank.getCurrentStock().add(deltaQty).setScale(3, RoundingMode.HALF_UP);
        if (newStock.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("Reducing this delivery would bring tank stock below zero.");
        }
        tank.setCurrentStock(newStock);
        tankRepository.save(tank);

        OffsetDateTime newDeliveryDateTime = startOfBusinessDay(request.getDeliveryDate());
        assertDeliveryNotAfterFirstUse(lot, newDeliveryDateTime);
        // A manager edit sends no cost price, so the recorded one is kept.
        BigDecimal costPrice = request.getCostPricePerUnit() != null
                ? request.getCostPricePerUnit()
                : delivery.getCostPricePerUnit();

        BigDecimal newRemaining = lot.getRemainingQuantity().add(deltaQty).setScale(3, RoundingMode.HALF_UP);
        lot.setOriginalQuantity(newQty);
        lot.setRemainingQuantity(newRemaining);
        lot.setStatus(newRemaining.compareTo(BigDecimal.ZERO) > 0 ? LotStatus.ACTIVE : LotStatus.EXHAUSTED);
        lot.setCostPricePerUnit(costPrice);
        lot.setDeliveryDate(newDeliveryDateTime);
        inventoryLotRepository.save(lot);

        delivery.setQuantityDelivered(newQty);
        delivery.setCostPricePerUnit(costPrice);
        delivery.setDeliveryDate(newDeliveryDateTime);
        delivery.setInvoiceReference(invoiceRef);
        delivery = tankerDeliveryRepository.save(delivery);
        moveOtherInvoiceLines(otherInvoiceLines, invoiceRef, newDeliveryDateTime);

        log.info("Delivery updated: pump={}, delivery={}, fuel={}, oldQty={}L, newQty={}L, invoice={}, by={}",
                pumpId, deliveryId, delivery.getFuelType(), oldQty, newQty, invoiceRef, currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_UPDATED,
                "TankerDelivery", delivery.getId().toString(),
                "Delivery updated: " + delivery.getFuelType() + " qty " + oldQty + "→" + newQty + "L, " +
                "cost ₹" + costPrice + "/L, invoice=" + invoiceRef,
                currentUser);

        return responseAssembler.toDeliveryResponse(delivery, tank, currentUser.getFullName());
    }

    /**
     * Deletes the most recently entered invoice (all its tank lines) and reverses the tank stock.
     * Refused once any fuel from the invoice has been consumed by a shift.
     */
    @Transactional
    public void deleteLatestDelivery(Long pumpId, User currentUser) {
        TankerDelivery latest = tankerDeliveryRepository.findTopByPumpIdOrderByCreatedAtDesc(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("No deliveries found for this pump"));

        String invoiceRef = latest.getInvoiceReference();
        List<TankerDelivery> toDelete = tankerDeliveryRepository.findByPumpIdAndInvoiceReference(pumpId, invoiceRef);
        tankRepository.findAllByIdForUpdate(toDelete.stream().map(TankerDelivery::getTankId).toList());

        List<InventoryLot> lots = new ArrayList<>();
        for (TankerDelivery delivery : toDelete) {
            InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(delivery.getId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Inventory lot not found for delivery " + delivery.getId()));
            if (lot.getRemainingQuantity().compareTo(lot.getOriginalQuantity()) < 0) {
                throw new BusinessException(
                        "This invoice cannot be deleted — fuel from it has already been consumed in a shift. " +
                        "Use Edit to correct quantities instead.");
            }
            lots.add(lot);
        }

        BigDecimal totalQty = BigDecimal.ZERO;
        StringBuilder detail = new StringBuilder("Deleted invoice '").append(invoiceRef).append("': ");
        for (int i = 0; i < toDelete.size(); i++) {
            TankerDelivery delivery = toDelete.get(i);
            UndergroundTank tank = tankRepository.findById(delivery.getTankId())
                    .orElseThrow(() -> new ResourceNotFoundException("Tank not found: " + delivery.getTankId()));

            tank.setCurrentStock(tank.getCurrentStock()
                    .subtract(delivery.getQuantityDelivered())
                    .setScale(3, RoundingMode.HALF_UP));
            tankRepository.save(tank);

            inventoryLotRepository.delete(lots.get(i));
            tankerDeliveryRepository.delete(delivery);

            totalQty = totalQty.add(delivery.getQuantityDelivered());
            detail.append(tank.getTankIdentifier()).append(" -")
                  .append(delivery.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP)).append("L ")
                  .append(delivery.getFuelType()).append(", ");
        }
        detail.append("Total: -").append(totalQty.setScale(3, RoundingMode.HALF_UP)).append("L");

        log.info("Invoice deleted: pump={}, invoice='{}', deliveries=[{}], by={}",
                pumpId, invoiceRef,
                toDelete.stream().map(d -> d.getId().toString()).collect(Collectors.joining(",")),
                currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_DELETED, "TankerDelivery", invoiceRef, detail.toString(), currentUser);
    }

    /**
     * Records a physical dip measurement. The measurement is ground truth: tank stock is set to it at once,
     * and the lot ledger is adjusted by the variance. Above-tolerance variances are flagged for review.
     */
    @Transactional
    public DipCheckResponse recordDipCheck(Long pumpId, RecordDipCheckRequest request, User currentUser) {
        UndergroundTank tank = tankRepository.findByIdForUpdate(request.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));
        assertTankUsable(tank, pumpId, "recording a DIP check");

        if (tank.getCurrentStock().compareTo(BigDecimal.ZERO) == 0) {
            throw new BusinessException(
                    "Tank '" + tank.getTankIdentifier() + "' has no recorded stock. " +
                    "Record a tanker delivery first before performing a DIP check.");
        }

        BigDecimal systemStockNow = tank.getCurrentStock().setScale(3, RoundingMode.HALF_UP);
        BigDecimal measured = request.getMeasuredQuantity().setScale(3, RoundingMode.HALF_UP);
        BigDecimal variance = measured.subtract(systemStockNow);
        OffsetDateTime checkedAt = dipCheckTime(request.getCheckedAt());

        String checkedByName = null;
        if (request.getCheckedByUserId() != null) {
            checkedByName = userRepository.findById(request.getCheckedByUserId())
                    .filter(user -> pumpId.equals(user.getAssignedPumpId()))
                    .map(User::getFullName)
                    .orElseThrow(() -> new ResourceNotFoundException("Checked-by user not found"));
        }

        boolean aboveTolerance = variance.abs().compareTo(tank.getDipTolerance()) > 0;
        DipCheckStatus status = aboveTolerance ? DipCheckStatus.PENDING_REVIEW : DipCheckStatus.WITHIN_TOLERANCE;

        DipCheck check = dipCheckRepository.save(DipCheck.builder()
                .pumpId(pumpId)
                .tankId(tank.getId())
                .measuredQuantity(measured)
                .systemStock(systemStockNow)
                .notes(request.getNotes())
                .checkedAt(checkedAt)
                .loggedByUserId(currentUser.getId())
                .checkedByUserId(request.getCheckedByUserId())
                .status(status)
                .build());

        tank.setCurrentStock(measured);
        tankRepository.save(tank);

        applyDipAdjustment(pumpId, tank, check, variance, checkedAt);

        log.info("DIP check recorded: pump={}, tank={}, measured={}L, system={}L, variance={}L, status={}, by={}, checkedBy={}",
                pumpId, tank.getId(), measured, systemStockNow, variance, status, currentUser.getId(), request.getCheckedByUserId());

        return responseAssembler.toDipCheckResponse(check, tank, currentUser.getFullName(), checkedByName, null);
    }

    /** Acknowledges an above-tolerance dip check (PENDING_REVIEW → REVIEWED). No stock or money changes. */
    @Transactional
    public DipCheckResponse reviewDipCheck(Long pumpId, Long dipCheckId, User currentUser) {
        DipCheck check = dipCheckRepository.findById(dipCheckId)
                .orElseThrow(() -> new ResourceNotFoundException("DIP check not found"));
        if (!check.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("DIP check not found");
        }
        if (check.getStatus() != DipCheckStatus.PENDING_REVIEW) {
            throw new BusinessException("DIP check is not pending review (current status: " + check.getStatus() + ")");
        }

        check.setStatus(DipCheckStatus.REVIEWED);
        check.setReviewedByUserId(currentUser.getId());
        check.setReviewedAt(businessClock.now());
        check = dipCheckRepository.save(check);

        UndergroundTank tank = tankRepository.findById(check.getTankId()).orElse(null);
        String loggedBy = userRepository.findById(check.getLoggedByUserId()).map(User::getFullName).orElse("Unknown");
        String checkedBy = check.getCheckedByUserId() != null
                ? userRepository.findById(check.getCheckedByUserId()).map(User::getFullName).orElse(null)
                : null;

        log.info("DIP check reviewed: pump={}, dipCheck={}, variance={}L, reviewedBy={}",
                pumpId, dipCheckId, check.getMeasuredQuantity().subtract(check.getSystemStock()), currentUser.getId());

        return responseAssembler.toDipCheckResponse(check, tank, loggedBy, checkedBy, currentUser.getFullName());
    }

    /**
     * Keeps the lot ledger equal to the corrected stock: a gain becomes a dip-adjustment lot, a loss is
     * consumed from the oldest lots. Without this, shift-close FIFO would disagree with the tank.
     */
    private void applyDipAdjustment(Long pumpId, UndergroundTank tank, DipCheck check,
                                    BigDecimal variance, OffsetDateTime checkedAt) {
        if (variance.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal gain = variance.setScale(3, RoundingMode.HALF_UP);
            BigDecimal adjustmentCost = costForDipGain(pumpId, tank);
            inventoryLotRepository.save(InventoryLot.builder()
                    .tankerDeliveryId(null)
                    .tankId(tank.getId())
                    .fuelType(tank.getFuelType())
                    .pumpId(pumpId)
                    .originalQuantity(gain)
                    .remainingQuantity(gain)
                    .costPricePerUnit(adjustmentCost)
                    .deliveryDate(checkedAt)
                    .isDipAdjustment(true)
                    .status(LotStatus.ACTIVE)
                    .build());
            log.info("DIP adjustment lot created: pump={}, tank={}, +{}L at cost {}",
                    pumpId, tank.getId(), gain, adjustmentCost);
            return;
        }
        if (variance.compareTo(BigDecimal.ZERO) == 0) {
            return;
        }

        BigDecimal toDeduct = variance.abs();
        List<InventoryLot> touchedLots = new ArrayList<>();
        List<LotConsumption> consumptions = new ArrayList<>();
        for (InventoryLot lot : inventoryLotRepository.findActiveLotsByTankFifo(tank.getId())) {
            if (toDeduct.compareTo(BigDecimal.ZERO) <= 0) break;
            BigDecimal consume = toDeduct.min(lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity().subtract(consume).setScale(3, RoundingMode.HALF_UP));
            if (lot.getRemainingQuantity().compareTo(BigDecimal.ZERO) == 0) {
                lot.setStatus(LotStatus.EXHAUSTED);
            }
            touchedLots.add(lot);
            consumptions.add(LotConsumption.builder()
                    .lotId(lot.getId())
                    .sourceType(LotConsumptionSource.DIP_CORRECTION)
                    .dipCorrectionId(check.getId())
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());
            toDeduct = toDeduct.subtract(consume);
        }
        if (toDeduct.compareTo(BigDecimal.ZERO) > 0) {
            throw new BusinessException(
                    "The stock lots for tank '" + tank.getTankIdentifier() + "' hold " +
                    toDeduct.setScale(3, RoundingMode.HALF_UP) + " L less than the recorded tank stock, so this " +
                    "dip check cannot be applied. Ask an admin to reconcile the tank's deliveries first.");
        }
        inventoryLotRepository.saveAll(touchedLots);
        lotConsumptionRepository.saveAll(consumptions);
        log.info("DIP adjustment: FIFO-consumed {}L from lots, tank={}, pump={}",
                variance.abs().setScale(3, RoundingMode.HALF_UP), tank.getId(), pumpId);
    }

    /**
     * Extra fuel found by a dip check is valued at the latest real purchase cost, never at zero. Dip-adjustment
     * and synthetic lots are skipped because they carry a copied or zero cost.
     */
    private BigDecimal costForDipGain(Long pumpId, UndergroundTank tank) {
        return inventoryLotRepository.findActiveLotsByTankForDisplay(tank.getId())
                .stream()
                .filter(InventoryWorkflowService::hasRealPurchaseCost)
                .reduce((first, second) -> second)
                .or(() -> inventoryLotRepository
                        .findFirstByPumpIdAndFuelTypeAndIsDipAdjustmentFalseOrderByDeliveryDateDesc(pumpId, tank.getFuelType())
                        .filter(InventoryWorkflowService::hasRealPurchaseCost))
                .map(InventoryLot::getCostPricePerUnit)
                .orElseThrow(() -> new BusinessException(
                        "No " + tank.getFuelType() + " delivery has been recorded for this pump, so the extra fuel " +
                        "found by this dip check has no purchase cost. Record a tanker delivery first."));
    }

    private TankerDelivery createDeliveryWithLot(Long pumpId, UndergroundTank tank, BigDecimal quantity,
                                                 BigDecimal costPrice, OffsetDateTime deliveryDateTime,
                                                 String invoiceRef, BigDecimal billTotal, Tanker tanker,
                                                 User currentUser) {
        BigDecimal qty = quantity.setScale(3, RoundingMode.HALF_UP);
        TankerDelivery delivery = tankerDeliveryRepository.save(TankerDelivery.builder()
                .pumpId(pumpId)
                .tankId(tank.getId())
                .fuelType(tank.getFuelType())
                .quantityDelivered(qty)
                .costPricePerUnit(costPrice)
                .deliveryDate(deliveryDateTime)
                .invoiceReference(invoiceRef)
                .billTotal(billTotal != null ? billTotal.setScale(2, RoundingMode.HALF_UP) : null)
                .tankerId(tanker != null ? tanker.getId() : null)
                .tankerName(tanker != null ? tanker.getName() : null)
                .loggedByUserId(currentUser.getId())
                .build());

        inventoryLotRepository.save(InventoryLot.builder()
                .tankerDeliveryId(delivery.getId())
                .tankId(tank.getId())
                .fuelType(tank.getFuelType())
                .pumpId(pumpId)
                .originalQuantity(qty)
                .remainingQuantity(qty)
                .costPricePerUnit(costPrice)
                .deliveryDate(deliveryDateTime)
                .isDipAdjustment(false)
                .status(LotStatus.ACTIVE)
                .build());

        tank.setCurrentStock(currentStockOf(tank).add(qty).setScale(3, RoundingMode.HALF_UP));
        tankRepository.save(tank);
        return delivery;
    }

    private Tanker findTankerMatchingQuantity(Long pumpId, RecordBatchDeliveryRequest request) {
        Tanker tanker = tankerRepository.findById(request.getTankerId())
                .orElseThrow(() -> new BusinessException("Tanker not found: " + request.getTankerId()));
        if (!tanker.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Tanker not found");
        }
        BigDecimal totalQty = request.getItems().stream()
                .map(RecordBatchDeliveryRequest.LineItem::getQuantityDelivered)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalQty.subtract(tanker.getCapacityLitres()).abs().compareTo(TANKER_CAPACITY_TOLERANCE) > 0) {
            throw new BusinessException(
                    "Total quantity " + totalQty.setScale(2, RoundingMode.HALF_UP) + "L does not match tanker '" +
                    tanker.getName() + "' capacity of " +
                    tanker.getCapacityLitres().setScale(2, RoundingMode.HALF_UP) + "L. " +
                    "Adjust the quantities so they add up to the tanker's capacity.");
        }
        return tanker;
    }

    private void assertTankUsable(UndergroundTank tank, Long pumpId, String activity) {
        if (!tank.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Tank not found");
        }
        if (tank.getStatus() == TankStatus.INACTIVE) {
            throw new BusinessException(
                    "Tank '" + tank.getTankIdentifier() + "' is currently disabled. " +
                    "Re-enable it in Setup before " + activity + ".");
        }
    }

    /** Rejects a delivery that would overflow the tank's physical capacity, a common data-entry mistake. */
    private void assertCapacity(UndergroundTank tank, BigDecimal quantity) {
        BigDecimal currentStock = currentStockOf(tank);
        BigDecimal availableCapacity = tank.getCapacity().subtract(currentStock).setScale(3, RoundingMode.HALF_UP);
        if (quantity.compareTo(availableCapacity) > 0) {
            throw new BusinessException(
                    "Tank '" + tank.getTankIdentifier() + "' has only " + availableCapacity + "L of available capacity " +
                    "(capacity: " + tank.getCapacity().setScale(3, RoundingMode.HALF_UP) + "L, current stock: " +
                    currentStock.setScale(3, RoundingMode.HALF_UP) + "L). " +
                    "Delivery of " + quantity.setScale(3, RoundingMode.HALF_UP) + "L would overflow the tank.");
        }
    }

    /** Lines of a batch invoice share its reference and date, so an edit to either moves the whole invoice. */
    private List<TankerDelivery> otherLinesOfInvoice(Long pumpId, TankerDelivery delivery) {
        if (delivery.getInvoiceReference() == null) {
            return List.of();
        }
        return tankerDeliveryRepository.findByPumpIdAndInvoiceReference(pumpId, delivery.getInvoiceReference()).stream()
                .filter(line -> !line.getId().equals(delivery.getId()))
                .toList();
    }

    private void assertInvoiceFreeForLines(Long pumpId, String invoiceRef, TankerDelivery delivery,
                                           List<TankerDelivery> otherInvoiceLines) {
        List<TankerDelivery> movingLines = new ArrayList<>(otherInvoiceLines);
        movingLines.add(delivery);
        Set<Long> movingIds = new HashSet<>();
        movingLines.forEach(line -> movingIds.add(line.getId()));
        for (TankerDelivery line : movingLines) {
            boolean takenOutsideInvoice = tankerDeliveryRepository.findByPumpIdAndInvoiceReference(pumpId, invoiceRef).stream()
                    .anyMatch(existing -> existing.getTankId().equals(line.getTankId()) && !movingIds.contains(existing.getId()));
            if (takenOutsideInvoice) {
                throw new BusinessException(
                        "Invoice '" + invoiceRef + "' already has a delivery to the same tank recorded for this pump. " +
                        "Use a different invoice reference.");
            }
        }
    }

    private void moveOtherInvoiceLines(List<TankerDelivery> otherInvoiceLines, String invoiceRef, OffsetDateTime deliveryDateTime) {
        for (TankerDelivery line : otherInvoiceLines) {
            InventoryLot lineLot = inventoryLotRepository.findByTankerDeliveryId(line.getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Inventory lot not found for delivery " + line.getId()));
            assertDeliveryNotAfterFirstUse(lineLot, deliveryDateTime);
            lineLot.setDeliveryDate(deliveryDateTime);
            inventoryLotRepository.save(lineLot);
            line.setInvoiceReference(invoiceRef);
            line.setDeliveryDate(deliveryDateTime);
            tankerDeliveryRepository.save(line);
        }
    }

    /** Same invoice + tank is a double entry; the DB unique index is the final safety net. */
    private void assertInvoiceNotRecorded(Long pumpId, String invoiceRef, UndergroundTank tank) {
        if (tankerDeliveryRepository.existsByPumpIdAndInvoiceReferenceAndTankId(pumpId, invoiceRef, tank.getId())) {
            throw new BusinessException(
                    "Invoice '" + invoiceRef + "' already has a delivery to tank '" + tank.getTankIdentifier() +
                    "' recorded for this pump. Check the invoice number or use a different reference.");
        }
    }

    /**
     * Fuel is always bought below the pump selling price; a cost at or above it is a data-entry mistake.
     * Skipped while no selling price is configured, so initial stock can be entered before prices.
     */
    private void validateCostPriceAgainstSellingPrice(Long pumpId, UndergroundTank tank, BigDecimal costPrice) {
        globalFuelPriceRepository
                .findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(pumpId, tank.getFuelType())
                .map(GlobalFuelPrice::getPricePerUnit)
                .ifPresent(sellingPrice -> {
                    if (costPrice.compareTo(sellingPrice) >= 0) {
                        throw new BusinessException(
                                "Cost price ₹" + costPrice + "/L for " + tank.getFuelType().name() +
                                " must be less than the current selling price ₹" + sellingPrice + "/L. " +
                                "Tanker fuel is always purchased below the pump selling price.");
                    }
                });
    }

    private static boolean hasRealPurchaseCost(InventoryLot lot) {
        return !Boolean.TRUE.equals(lot.getIsDipAdjustment())
                && lot.getCostPricePerUnit() != null
                && lot.getCostPricePerUnit().compareTo(BigDecimal.ZERO) > 0;
    }

    /** Moving a delivery after the time its fuel was first used would make earlier days' stock negative. */
    private void assertDeliveryNotAfterFirstUse(InventoryLot lot, OffsetDateTime newDeliveryDateTime) {
        if (!newDeliveryDateTime.isAfter(lot.getDeliveryDate())) {
            return;
        }
        lotConsumptionRepository.findFirstConsumptionTime(lot.getId())
                .filter(firstUse -> newDeliveryDateTime.isAfter(firstUse))
                .ifPresent(firstUse -> {
                    throw new BusinessException(
                            "Cannot move this delivery to " + newDeliveryDateTime.atZoneSameInstant(businessClock.zone()).toLocalDate() +
                            " — its fuel was already used on " + firstUse.atZoneSameInstant(businessClock.zone()).toLocalDate() +
                            ". Choose a date on or before the first use.");
                });
    }

    /**
     * A dip check dated today is stamped with the current time; a back-dated one with the start of its day,
     * since the time it was taken is not known.
     */
    private OffsetDateTime dipCheckTime(LocalDate checkedOn) {
        return checkedOn.equals(businessClock.today())
                ? businessClock.now()
                : startOfBusinessDay(checkedOn);
    }

    private OffsetDateTime startOfBusinessDay(LocalDate date) {
        return date.atStartOfDay(businessClock.zone()).toOffsetDateTime();
    }

    private static BigDecimal currentStockOf(UndergroundTank tank) {
        return tank.getCurrentStock() != null ? tank.getCurrentStock() : BigDecimal.ZERO;
    }
}
