package com.ppms.pump;

import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.text.CodedText;
import com.ppms.common.text.ServerTextCodes;
import com.ppms.common.time.BusinessClock;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.SetupChecklistResponse.Item;
import com.ppms.pump.SetupChecklistResponse.Step;
import com.ppms.user.UserStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Works out which setup steps a new pump still needs: dispensers and nozzles, tanks with every nozzle linked,
 * a price for every fuel sold, shift definitions, staff and GST details; credit clients are optional.
 * Prices count once set: keeping them current each day is the stale-price alert's job, not setup's.
 * The state of any number of pumps is read with a fixed number of queries.
 */
@Service
@RequiredArgsConstructor
public class SetupChecklistService {

    private final SetupChecklistRepository checklistRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final BusinessClock businessClock;

    @Transactional(readOnly = true)
    public SetupChecklistResponse getChecklist(Long pumpId) {
        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found: " + pumpId));
        return checklistsFor(List.of(pump)).get(pumpId);
    }

    /** The checklist of each given pump, keyed by pump id. */
    @Transactional(readOnly = true)
    public Map<Long, SetupChecklistResponse> checklistsFor(Collection<PumpLocation> pumps) {
        if (pumps.isEmpty()) {
            return Map.of();
        }
        Set<Long> pumpIds = pumps.stream().map(PumpLocation::getId).collect(Collectors.toSet());
        Map<Long, List<ActiveNozzle>> nozzlesByPump = checklistRepository.findActiveNozzles(pumpIds, NozzleStatus.ACTIVE)
                .stream()
                .map(row -> new ActiveNozzle((Long) row[0], (FuelType) row[1], (Long) row[2]))
                .collect(Collectors.groupingBy(ActiveNozzle::pumpId));
        Map<Long, Long> tanks = countsByPump(checklistRepository.countTanksInUse(pumpIds, TankStatus.DECOMMISSIONED));
        Map<Long, Long> shiftDefinitions =
                countsByPump(checklistRepository.countShiftDefinitionsInEffect(pumpIds, businessClock.today()));
        Map<Long, Long> staff = countsByPump(checklistRepository.countStaff(pumpIds, UserStatus.ACTIVE));
        Map<Long, Long> creditClients = countsByPump(checklistRepository.countActiveCreditClients(pumpIds));
        Map<Long, List<GlobalFuelPrice>> pricesByPump = fuelPriceRepository.findCurrentPricesForPumps(pumpIds).stream()
                .collect(Collectors.groupingBy(GlobalFuelPrice::getPumpId));

        Map<Long, SetupChecklistResponse> checklists = new HashMap<>();
        for (PumpLocation pump : pumps) {
            Long id = pump.getId();
            List<ActiveNozzle> nozzles = nozzlesByPump.getOrDefault(id, List.of());
            checklists.put(id, SetupChecklistResponse.of(id, List.of(
                    dispensersItem(nozzles),
                    tanksItem(nozzles, tanks.getOrDefault(id, 0L)),
                    fuelPricesItem(nozzles, pricesByPump.getOrDefault(id, List.of())),
                    shiftDefinitionsItem(shiftDefinitions.getOrDefault(id, 0L)),
                    staffItem(staff.getOrDefault(id, 0L)),
                    gstItem(pump),
                    creditClientsItem(creditClients.getOrDefault(id, 0L)))));
        }
        return checklists;
    }

    private record ActiveNozzle(Long pumpId, FuelType fuelType, Long tankId) {
    }

    private static Map<Long, Long> countsByPump(List<Object[]> rows) {
        return rows.stream().collect(Collectors.toMap(row -> (Long) row[0], row -> (Long) row[1]));
    }

    private static Item dispensersItem(List<ActiveNozzle> nozzles) {
        return nozzles.isEmpty()
                ? Item.of(Step.DISPENSERS, false, false,
                        CodedText.of(ServerTextCodes.SETUP_DISPENSERS_MISSING, "Add a dispensing unit and its nozzles"))
                : Item.of(Step.DISPENSERS, true, false,
                        counted(ServerTextCodes.SETUP_ACTIVE_NOZZLES, nozzles.size(), "active nozzle"));
    }

    private static Item tanksItem(List<ActiveNozzle> nozzles, long tankCount) {
        if (tankCount == 0) {
            return Item.of(Step.TANKS, false, false, CodedText.of(ServerTextCodes.SETUP_TANKS_MISSING, "Add an underground tank"));
        }
        if (nozzles.isEmpty()) {
            return Item.of(Step.TANKS, false, false,
                    CodedText.of(ServerTextCodes.SETUP_TANKS_NEED_NOZZLES, "Add nozzles, then link each one to a tank"));
        }
        long unlinked = nozzles.stream().filter(nozzle -> nozzle.tankId() == null).count();
        return unlinked == 0
                ? Item.of(Step.TANKS, true, false, CodedText.of(ServerTextCodes.SETUP_TANKS_ALL_LINKED, "count", tankCount,
                        plural(tankCount, "tank") + ", every nozzle linked"))
                : Item.of(Step.TANKS, false, false, CodedText.of(ServerTextCodes.SETUP_NOZZLES_NOT_LINKED, "count", unlinked,
                        plural(unlinked, "nozzle") + " not linked to a tank"));
    }

    private static Item fuelPricesItem(List<ActiveNozzle> nozzles, List<GlobalFuelPrice> currentPrices) {
        Map<FuelType, GlobalFuelPrice> priceByFuel = currentPrices.stream()
                .collect(Collectors.toMap(GlobalFuelPrice::getFuelType, price -> price, (first, second) -> first));
        Set<FuelType> fuelsSold = EnumSet.noneOf(FuelType.class);
        nozzles.forEach(nozzle -> fuelsSold.add(nozzle.fuelType()));
        Set<FuelType> fuelsToPrice = fuelsSold.isEmpty() ? priceByFuel.keySet() : fuelsSold;
        if (fuelsToPrice.isEmpty()) {
            return Item.of(Step.FUEL_PRICES, false, false,
                    CodedText.of(ServerTextCodes.SETUP_FUEL_PRICES_MISSING, "Set the fuel prices"));
        }
        long unpriced = fuelsToPrice.stream().filter(fuel -> !priceByFuel.containsKey(fuel)).count();
        return unpriced == 0
                ? Item.of(Step.FUEL_PRICES, true, false,
                        CodedText.of(ServerTextCodes.SETUP_FUEL_PRICES_SET, "Prices set for every fuel sold"))
                : Item.of(Step.FUEL_PRICES, false, false, CodedText.of(ServerTextCodes.SETUP_FUEL_PRICES_UNPRICED, "count",
                        unpriced, plural(unpriced, "fuel") + " without a price"));
    }

    private static Item shiftDefinitionsItem(long count) {
        return count == 0
                ? Item.of(Step.SHIFT_DEFINITIONS, false, false,
                        CodedText.of(ServerTextCodes.SETUP_SHIFT_DEFINITIONS_MISSING, "Define the shifts the pump runs"))
                : Item.of(Step.SHIFT_DEFINITIONS, true, false, CodedText.of(ServerTextCodes.SETUP_SHIFT_DEFINITIONS_DEFINED,
                        "count", count, plural(count, "shift") + " defined"));
    }

    private static Item staffItem(long count) {
        return count == 0
                ? Item.of(Step.STAFF, false, false,
                        CodedText.of(ServerTextCodes.SETUP_STAFF_MISSING, "Add your manager and operators"))
                : Item.of(Step.STAFF, true, false, counted(ServerTextCodes.SETUP_STAFF_ACTIVE, count, "active staff member"));
    }

    private static Item gstItem(PumpLocation pump) {
        boolean complete = isFilled(pump.getGstin()) && isFilled(pump.getLegalName()) && isFilled(pump.getStateName());
        return complete
                ? Item.of(Step.GST_DETAILS, true, false,
                        CodedText.of(ServerTextCodes.SETUP_GST_DETAILS_SET, "gstin", pump.getGstin(), "GSTIN " + pump.getGstin()))
                : Item.of(Step.GST_DETAILS, false, false, CodedText.of(ServerTextCodes.SETUP_GST_DETAILS_MISSING,
                        "Add GSTIN, legal name and state for tax invoices"));
    }

    private static Item creditClientsItem(long count) {
        return count == 0
                ? Item.of(Step.CREDIT_CLIENTS, false, true,
                        CodedText.of(ServerTextCodes.SETUP_CREDIT_CLIENTS_NONE, "Add customers who buy on credit, if any"))
                : Item.of(Step.CREDIT_CLIENTS, true, true,
                        counted(ServerTextCodes.SETUP_CREDIT_CLIENTS_ACTIVE, count, "credit client"));
    }

    private static boolean isFilled(String value) {
        return value != null && !value.isBlank();
    }

    private static CodedText counted(String code, long count, String noun) {
        return CodedText.of(code, "count", count, plural(count, noun));
    }

    private static String plural(long count, String noun) {
        return count + " " + noun + (count == 1 ? "" : "s");
    }
}
