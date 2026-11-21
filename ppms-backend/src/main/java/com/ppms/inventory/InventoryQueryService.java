package com.ppms.inventory;

import com.ppms.common.dto.PageRequests;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InventoryQueryService {

    private final UndergroundTankRepository tankRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final DipCheckRepository dipCheckRepository;
    private final UserRepository userRepository;
    private final InventoryResponseAssembler responseAssembler;

    public List<TankStockResponse> getTankStocks(Long pumpId) {
        return tankRepository.findByPumpId(pumpId).stream()
                .filter(tank -> tank.getStatus() != TankStatus.DECOMMISSIONED)
                .map(responseAssembler::toTankStockResponse)
                .toList();
    }

    public PagedResponse<TankerDeliveryResponse> getDeliveries(Long pumpId, int page, int size) {
        Page<TankerDelivery> deliveries = tankerDeliveryRepository
                .findByPumpIdOrderByDeliveryDateDesc(pumpId, PageRequests.of(page, size));

        Map<Long, UndergroundTank> tankById = findTanksById(
                deliveries.getContent().stream().map(TankerDelivery::getTankId).collect(Collectors.toSet()));
        Map<Long, String> userNameById = findUserNamesById(
                deliveries.getContent().stream().map(TankerDelivery::getLoggedByUserId).collect(Collectors.toSet()));

        return PagedResponse.of(deliveries.map(delivery -> responseAssembler.toDeliveryResponse(
                delivery, tankById.get(delivery.getTankId()),
                userNameById.getOrDefault(delivery.getLoggedByUserId(), "Unknown"))));
    }

    public PagedResponse<DipCheckResponse> getDipChecks(Long pumpId, int page, int size) {
        Page<DipCheck> checks = dipCheckRepository.findByPumpIdOrderByCheckedAtDesc(pumpId, PageRequests.of(page, size));

        Set<Long> userIds = new HashSet<>();
        checks.getContent().forEach(check -> {
            userIds.add(check.getLoggedByUserId());
            userIds.add(check.getCheckedByUserId());
            userIds.add(check.getReviewedByUserId());
        });
        userIds.remove(null);
        Map<Long, UndergroundTank> tankById = findTanksById(
                checks.getContent().stream().map(DipCheck::getTankId).collect(Collectors.toSet()));
        Map<Long, String> userNameById = findUserNamesById(userIds);

        return PagedResponse.of(checks.map(check -> responseAssembler.toDipCheckResponse(
                check,
                tankById.get(check.getTankId()),
                userNameById.getOrDefault(check.getLoggedByUserId(), "Unknown"),
                nameOrUnknown(userNameById, check.getCheckedByUserId()),
                nameOrUnknown(userNameById, check.getReviewedByUserId()))));
    }

    /** Active FIFO lots of one tank, oldest first, with each delivery's invoice reference. */
    public List<InventoryLotDetailResponse> getActiveTankLots(Long pumpId, Long tankId) {
        UndergroundTank tank = tankRepository.findById(tankId)
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found: " + tankId));
        if (!tank.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Tank not found");
        }

        List<InventoryLot> lots = inventoryLotRepository.findActiveLotsByTankForDisplay(tankId);
        if (lots.isEmpty()) {
            return List.of();
        }

        // Dip-adjustment lots have no delivery, so they show no invoice reference.
        Set<Long> deliveryIds = lots.stream()
                .map(InventoryLot::getTankerDeliveryId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, TankerDelivery> deliveryById = tankerDeliveryRepository.findAllById(deliveryIds).stream()
                .collect(Collectors.toMap(TankerDelivery::getId, Function.identity()));

        return lots.stream()
                .map(lot -> {
                    TankerDelivery delivery = lot.getTankerDeliveryId() != null
                            ? deliveryById.get(lot.getTankerDeliveryId())
                            : null;
                    return InventoryLotDetailResponse.builder()
                            .id(lot.getId())
                            .tankerDeliveryId(lot.getTankerDeliveryId())
                            .deliveryDate(lot.getDeliveryDate())
                            .invoiceReference(delivery != null ? delivery.getInvoiceReference() : null)
                            .costPricePerUnit(lot.getCostPricePerUnit())
                            .remainingQuantity(lot.getRemainingQuantity())
                            .originalQuantity(lot.getOriginalQuantity())
                            .isDipAdjustment(lot.getIsDipAdjustment())
                            .status(lot.getStatus().name())
                            .createdAt(lot.getCreatedAt())
                            .build();
                })
                .toList();
    }

    private Map<Long, UndergroundTank> findTanksById(Set<Long> tankIds) {
        return tankRepository.findAllById(tankIds).stream()
                .collect(Collectors.toMap(UndergroundTank::getId, Function.identity()));
    }

    private Map<Long, String> findUserNamesById(Set<Long> userIds) {
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
    }

    private static String nameOrUnknown(Map<Long, String> userNameById, Long userId) {
        return userId != null ? userNameById.getOrDefault(userId, "Unknown") : null;
    }
}
