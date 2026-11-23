package com.ppms.inventory;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.pump.UndergroundTank;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Draws litres from one tank's oldest active lots for stock that leaves outside a shift close.
 * The caller must already hold the tank row lock and moves the tank's currentStock itself.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
@RequiredArgsConstructor
public class TankLotConsumptionService {

    private final InventoryLotRepository inventoryLotRepository;

    /**
     * Saves the reduced lots and returns one unsaved consumption per lot drawn, so the caller can link
     * each one to the record that caused it. Refuses when the tank's lots hold less than requested.
     */
    public List<LotConsumption> consumeOldestFirst(UndergroundTank tank, BigDecimal litres, LotConsumptionSource source) {
        BigDecimal remaining = litres.setScale(3, RoundingMode.HALF_UP);
        List<InventoryLot> touchedLots = new ArrayList<>();
        List<LotConsumption> consumptions = new ArrayList<>();
        for (InventoryLot lot : inventoryLotRepository.findActiveLotsByTankFifo(tank.getId())) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            BigDecimal consume = remaining.min(lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity().subtract(consume).setScale(3, RoundingMode.HALF_UP));
            if (lot.getRemainingQuantity().compareTo(BigDecimal.ZERO) == 0) {
                lot.setStatus(LotStatus.EXHAUSTED);
            }
            touchedLots.add(lot);
            consumptions.add(LotConsumption.builder()
                    .lotId(lot.getId())
                    .sourceType(source)
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());
            remaining = remaining.subtract(consume);
        }
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            throw new BusinessException(ErrorCodes.STOCK_LOTS_SHORT_OF_TANK_STOCK,
                    Map.of("tankIdentifier", tank.getTankIdentifier(),
                           "shortfall", remaining.setScale(3, RoundingMode.HALF_UP).toPlainString()),
                    "The stock lots for tank '" + tank.getTankIdentifier() + "' hold " +
                    remaining.setScale(3, RoundingMode.HALF_UP) + " L less than the recorded tank stock, so this " +
                    "change cannot be applied. Ask an admin to reconcile the tank's deliveries first.");
        }
        inventoryLotRepository.saveAll(touchedLots);
        return consumptions;
    }
}
