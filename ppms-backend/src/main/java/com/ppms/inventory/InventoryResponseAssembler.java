package com.ppms.inventory;

import com.ppms.pump.UndergroundTank;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Service
public class InventoryResponseAssembler {

    private static final BigDecimal LOW_STOCK_PERCENT = new BigDecimal("20");

    public TankStockResponse toTankStockResponse(UndergroundTank tank) {
        BigDecimal stock    = tank.getCurrentStock() != null ? tank.getCurrentStock() : BigDecimal.ZERO;
        BigDecimal capacity = tank.getCapacity();

        BigDecimal pct = capacity.compareTo(BigDecimal.ZERO) > 0
                ? stock.multiply(new BigDecimal("100")).divide(capacity, 1, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        return TankStockResponse.builder()
                .tankId(tank.getId())
                .tankIdentifier(tank.getTankIdentifier())
                .fuelType(tank.getFuelType().name())
                .capacity(capacity.setScale(3, RoundingMode.HALF_UP))
                .currentStock(stock.setScale(3, RoundingMode.HALF_UP))
                .stockPercentage(pct)
                .lowStock(pct.compareTo(LOW_STOCK_PERCENT) < 0)
                .dipTolerance(tank.getDipTolerance())
                .pumpId(tank.getPumpId())
                .status(tank.getStatus().name())
                .build();
    }

    public TankerDeliveryResponse toDeliveryResponse(TankerDelivery delivery, UndergroundTank tank, String loggedByName) {
        BigDecimal totalCost = delivery.getQuantityDelivered()
                .multiply(delivery.getCostPricePerUnit())
                .setScale(4, RoundingMode.HALF_UP);

        return TankerDeliveryResponse.builder()
                .id(delivery.getId())
                .pumpId(delivery.getPumpId())
                .tankId(delivery.getTankId())
                .tankIdentifier(tank != null ? tank.getTankIdentifier() : null)
                .fuelType(delivery.getFuelType().name())
                .quantityDelivered(delivery.getQuantityDelivered())
                .costPricePerUnit(delivery.getCostPricePerUnit())
                .totalCost(totalCost)
                .billTotal(delivery.getBillTotal())
                .tankerName(delivery.getTankerName())
                .deliveryDate(delivery.getDeliveryDate())
                .invoiceReference(delivery.getInvoiceReference())
                .loggedByUserName(loggedByName)
                .createdAt(delivery.getCreatedAt())
                .build();
    }

    public DipCheckResponse toDipCheckResponse(DipCheck check, UndergroundTank tank,
                                               String loggedByName, String checkedByName,
                                               String reviewedByName) {
        BigDecimal variance = check.getMeasuredQuantity().subtract(check.getSystemStock());
        return DipCheckResponse.builder()
                .id(check.getId())
                .tankId(check.getTankId())
                .tankIdentifier(tank != null ? tank.getTankIdentifier() : null)
                .fuelType(tank != null ? tank.getFuelType().name() : null)
                .measuredQuantity(check.getMeasuredQuantity())
                .systemStock(check.getSystemStock())
                .variance(variance.setScale(3, RoundingMode.HALF_UP))
                .notes(check.getNotes())
                .checkedAt(check.getCheckedAt())
                .loggedByUserName(loggedByName)
                .checkedByUserName(checkedByName)
                .createdAt(check.getCreatedAt())
                .status(check.getStatus() != null ? check.getStatus().name() : DipCheckStatus.WITHIN_TOLERANCE.name())
                .reviewedAt(check.getReviewedAt())
                .reviewedByUserName(reviewedByName)
                .build();
    }
}
