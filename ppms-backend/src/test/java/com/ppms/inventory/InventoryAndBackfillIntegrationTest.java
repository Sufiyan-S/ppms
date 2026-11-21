package com.ppms.inventory;

import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.fuel.FuelType;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InventoryAndBackfillIntegrationTest extends ApiIntegrationTest {

    @Autowired private TankerDeliveryRepository tankerDeliveryRepository;

    @Autowired private InventoryLotRepository lotRepository;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("1000");
    }

    @Test
    void deliveryAddsToTankStockAndCreatesAnActiveLotAtItsCost() throws Exception {
        recordDelivery(setup, "500", "92.50", TestDates.today());

        assertThat(currentStock()).isEqualByComparingTo("1500");
        List<InventoryLot> lots = lotRepository.findActiveLotsByTankForDisplay(setup.tank().getId());
        assertThat(lots).extracting(InventoryLot::getCostPricePerUnit)
                .anySatisfy(cost -> assertThat(cost).isEqualByComparingTo("92.50"));
        JsonNode tanks = json(perform(get("/api/inventory/{pumpId}/tanks", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(tanks.get(0).get("currentStock").decimalValue()).isEqualByComparingTo("1500");
    }

    @Test
    void deliveryAboveTankCapacityIsRefused() throws Exception {
        perform(post("/api/inventory/{pumpId}/deliveries", setup.pumpId()), setup.owner(),
                Map.of("tankId", setup.tank().getId(), "quantityDelivered", new BigDecimal("19500"),
                        "costPricePerUnit", new BigDecimal("90"), "deliveryDate", TestDates.today().toString(),
                        "invoiceReference", "INV-" + shortId()))
                .andExpect(status().isBadRequest());
        assertThat(currentStock()).isEqualByComparingTo("1000");
    }

    @Test
    void correctingADeliveryQuantityMovesTankStockByTheDifference() throws Exception {
        long deliveryId = recordDelivery(setup, "400", "90.00", TestDates.today()).get("id").asLong();

        perform(patch("/api/inventory/{pumpId}/deliveries/{deliveryId}", setup.pumpId(), deliveryId), setup.owner(),
                Map.of("quantityDelivered", new BigDecimal("450"), "costPricePerUnit", new BigDecimal("90.00"),
                        "deliveryDate", TestDates.today().toString(), "invoiceReference", "INV-FIXED"))
                .andExpect(status().isOk());

        assertThat(currentStock()).isEqualByComparingTo("1450");
    }

    @Test
    void deletingTheLatestDeliveryRemovesItsStock() throws Exception {
        recordDelivery(setup, "300", "90.00", TestDates.today());

        perform(delete("/api/inventory/{pumpId}/deliveries/latest", setup.pumpId()), setup.owner())
                .andExpect(status().is2xxSuccessful());

        assertThat(currentStock()).isEqualByComparingTo("1000");
    }

    @Test
    void batchDeliveryRecordsEveryTankInOneInvoice() throws Exception {
        UndergroundTank dieselTank = saveDieselTank();
        Map<String, Object> request = batchRequest(List.of(
                Map.of("tankId", setup.tank().getId(), "quantityDelivered", new BigDecimal("100"), "costPricePerUnit", new BigDecimal("91")),
                Map.of("tankId", dieselTank.getId(), "quantityDelivered", new BigDecimal("200"), "costPricePerUnit", new BigDecimal("85"))));

        perform(post("/api/inventory/{pumpId}/deliveries/batch", setup.pumpId()), setup.owner(), request)
                .andExpect(status().is2xxSuccessful());

        assertThat(currentStock()).isEqualByComparingTo("1100");
        assertThat(tankRepository.findById(dieselTank.getId()).orElseThrow().getCurrentStock()).isEqualByComparingTo("200");
        JsonNode deliveries = json(perform(get("/api/inventory/{pumpId}/deliveries", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(deliveries.get("content").size()).isEqualTo(3);
    }

    @Test
    void oneInvoiceCanFillTwoTanksOfTheSameFuelAndAnEditMovesTheWholeInvoice() throws Exception {
        UndergroundTank secondPetrolTank = tankRepository.save(UndergroundTank.builder()
                .pumpId(setup.pumpId())
                .tankIdentifier("P2-" + shortId())
                .fuelType(setup.tank().getFuelType())
                .capacity(new BigDecimal("10000"))
                .currentStock(BigDecimal.ZERO)
                .dipTolerance(new BigDecimal("50"))
                .status(TankStatus.ACTIVE)
                .build());
        Map<String, Object> request = batchRequest(List.of(
                Map.of("tankId", setup.tank().getId(), "quantityDelivered", new BigDecimal("100"), "costPricePerUnit", new BigDecimal("91")),
                Map.of("tankId", secondPetrolTank.getId(), "quantityDelivered", new BigDecimal("200"), "costPricePerUnit", new BigDecimal("91"))));

        JsonNode lines = json(perform(post("/api/inventory/{pumpId}/deliveries/batch", setup.pumpId()), setup.owner(), request)
                .andExpect(status().is2xxSuccessful()));
        assertThat(tankRepository.findById(secondPetrolTank.getId()).orElseThrow().getCurrentStock()).isEqualByComparingTo("200");

        String newInvoice = "INV-MOVED-" + shortId();
        perform(patch("/api/inventory/{pumpId}/deliveries/{deliveryId}", setup.pumpId(), lines.get(0).get("id").asLong()),
                setup.owner(), Map.of("quantityDelivered", new BigDecimal("100"), "costPricePerUnit", new BigDecimal("91"),
                        "deliveryDate", TestDates.today().toString(), "invoiceReference", newInvoice))
                .andExpect(status().isOk());

        assertThat(tankerDeliveryRepository.findByPumpIdAndInvoiceReference(setup.pumpId(), newInvoice)).hasSize(2);
    }

    @Test
    void batchDeliveryListingTheSameTankTwiceIsRefused() throws Exception {
        Map<String, Object> request = batchRequest(List.of(
                Map.of("tankId", setup.tank().getId(), "quantityDelivered", new BigDecimal("100"), "costPricePerUnit", new BigDecimal("91")),
                Map.of("tankId", setup.tank().getId(), "quantityDelivered", new BigDecimal("200"), "costPricePerUnit", new BigDecimal("92"))));

        perform(post("/api/inventory/{pumpId}/deliveries/batch", setup.pumpId()), setup.owner(), request)
                .andExpect(status().isBadRequest());
        assertThat(currentStock()).isEqualByComparingTo("1000");
    }

    private Map<String, Object> batchRequest(List<Map<String, Object>> items) {
        Map<String, Object> request = new HashMap<>();
        request.put("deliveryDate", TestDates.today().toString());
        request.put("invoiceReference", "INV-" + shortId());
        request.put("items", items);
        return request;
    }

    private UndergroundTank saveDieselTank() {
        return tankRepository.save(UndergroundTank.builder()
                .pumpId(setup.pumpId())
                .tankIdentifier("D-" + shortId())
                .fuelType(FuelType.DIESEL)
                .capacity(new BigDecimal("10000"))
                .currentStock(BigDecimal.ZERO)
                .dipTolerance(new BigDecimal("50"))
                .status(TankStatus.ACTIVE)
                .build());
    }

    @Test
    void dipCheckShortageSetsStockToTheMeasuredQuantityAndNeedsReview() throws Exception {
        JsonNode dip = json(perform(post("/api/inventory/{pumpId}/dip-checks", setup.pumpId()), setup.manager(),
                Map.of("tankId", setup.tank().getId(), "measuredQuantity", new BigDecimal("900"),
                        "checkedAt", TestDates.today().toString(), "checkedByUserId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful()));

        assertThat(dip.get("variance").decimalValue()).isEqualByComparingTo("-100");
        assertThat(currentStock()).isEqualByComparingTo("900");
        assertThat(dip.get("status").asText()).isEqualTo("PENDING_REVIEW");

        JsonNode reviewed = json(perform(patch("/api/inventory/{pumpId}/dip-checks/{id}/review", setup.pumpId(), dip.get("id").asLong()),
                setup.owner()).andExpect(status().isOk()));
        assertThat(reviewed.get("status").asText()).isEqualTo("REVIEWED");
    }

    @Test
    void dipCheckGainWithinToleranceAddsStockWithoutReview() throws Exception {
        JsonNode dip = json(perform(post("/api/inventory/{pumpId}/dip-checks", setup.pumpId()), setup.manager(),
                Map.of("tankId", setup.tank().getId(), "measuredQuantity", new BigDecimal("1020"),
                        "checkedAt", TestDates.today().toString()))
                .andExpect(status().is2xxSuccessful()));

        assertThat(dip.get("variance").decimalValue()).isEqualByComparingTo("20");
        assertThat(currentStock()).isEqualByComparingTo("1020");
        assertThat(dip.get("status").asText()).isNotEqualTo("PENDING_REVIEW");
    }

    @Test
    void dipCheckNamingStaffOfAnotherPumpIsRefused() throws Exception {
        var outsider = saveUser(UserRole.OPERATOR, null);

        perform(post("/api/inventory/{pumpId}/dip-checks", setup.pumpId()), setup.manager(),
                Map.of("tankId", setup.tank().getId(), "measuredQuantity", new BigDecimal("990"),
                        "checkedAt", TestDates.today().toString(), "checkedByUserId", outsider.getId()))
                .andExpect(status().is4xxClientError());
        assertThat(currentStock()).isEqualByComparingTo("1000");
    }

    @Test
    void tankLotsListShowsRemainingQuantityPerDelivery() throws Exception {
        JsonNode lots = json(perform(get("/api/inventory/{pumpId}/tanks/{tankId}/lots", setup.pumpId(), setup.tank().getId()),
                setup.manager()).andExpect(status().isOk()));

        assertThat(lots.toString()).contains("1000");
    }

    @Test
    void backfilledShiftForYesterdayIsClosedAndDeductsStock() throws Exception {
        Map<String, Object> request = backfillRequest(TestDates.today().minusDays(1), "1000.000", "1010.000", "950.00");

        JsonNode backfilled = json(perform(post("/api/pumps/{pumpId}/shifts/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().is2xxSuccessful()));

        assertThat(backfilled.get("isBackfilled").asBoolean()).isTrue();
        assertThat(backfilled.get("status").asText()).isEqualTo("CLOSED_BALANCED");
        assertThat(currentStock()).isEqualByComparingTo("990");
    }

    @Test
    void backfillSellingMoreThanTheStockDeliveredByThatDateIsRefused() throws Exception {
        Map<String, Object> request = backfillRequest(TestDates.today().minusDays(1), "1000.000", "3000.000", "190000.00");

        perform(post("/api/pumps/{pumpId}/shifts/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().isBadRequest());
        assertThat(currentStock()).isEqualByComparingTo("1000");
    }

    @Test
    void managerCannotBackfillShifts() throws Exception {
        perform(post("/api/pumps/{pumpId}/shifts/backfill", setup.pumpId()), setup.manager(),
                backfillRequest(TestDates.today().minusDays(1), "1000.000", "1010.000", "950.00"))
                .andExpect(status().isForbidden());
    }

    private Map<String, Object> backfillRequest(LocalDate date, String opening, String closing, String cash) {
        Map<String, Object> request = new HashMap<>();
        request.put("shiftDefinitionId", setup.allDayShift().getId());
        request.put("shiftDate", date.toString());
        request.put("duId", setup.du().getId());
        request.put("operatorId", setup.operator().getId());
        request.put("nozzleReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(),
                "openingReading", new BigDecimal(opening), "closingReading", new BigDecimal(closing))));
        request.put("cashCollected", new BigDecimal(cash));
        request.put("upiCollected", BigDecimal.ZERO);
        request.put("cardCollected", BigDecimal.ZERO);
        request.put("fleetCardCollected", BigDecimal.ZERO);
        request.put("creditTotal", BigDecimal.ZERO);
        request.put("fuelRateOverrides", Map.of("PETROL", new BigDecimal("95.00")));
        return request;
    }

    private BigDecimal currentStock() {
        return tankRepository.findById(setup.tank().getId()).orElseThrow().getCurrentStock();
    }
}
