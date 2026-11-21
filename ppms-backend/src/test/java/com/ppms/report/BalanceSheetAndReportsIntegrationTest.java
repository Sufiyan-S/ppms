package com.ppms.report;

import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.fuel.FuelType;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotStatus;
import com.ppms.support.ApiIntegrationTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BalanceSheetAndReportsIntegrationTest extends ApiIntegrationTest {

    @Autowired private InventoryLotRepository inventoryLotRepository;

    private PumpSetup setup;
    private long shiftId;
    private final String today = TestDates.today().toString();

    @BeforeEach
    void createPumpWithOneClosedShift() throws Exception {
        setup = createPumpWithStock("5000");
        shiftId = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        Map<String, Object> close = new HashMap<>();
        close.put("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal("1020.000"))));
        close.put("cashCollected", new BigDecimal("1900.00"));
        close.put("upiCollected", BigDecimal.ZERO);
        close.put("cardCollected", BigDecimal.ZERO);
        close.put("fleetCardCollected", BigDecimal.ZERO);
        close.put("creditTotal", BigDecimal.ZERO);
        close.put("discrepancyReason", "Short by 100");
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(), close)
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    void dayBalanceSheetShowsRevenueCostAndProfitOfTheDaysShifts() throws Exception {
        JsonNode sheet = generate("DAY", null);

        assertThat(sheet.get("totalLitresSold").decimalValue()).isEqualByComparingTo("20");
        assertThat(sheet.get("totalExpectedRevenue").decimalValue()).isEqualByComparingTo("2000.00");
        assertThat(sheet.get("totalCashCollected").decimalValue()).isEqualByComparingTo("1900.00");
        assertThat(sheet.get("totalCostOfGoods").decimalValue()).isEqualByComparingTo("1800.00");
        assertThat(sheet.get("totalGrossProfit").decimalValue()).isEqualByComparingTo("200.00");
    }

    @Test
    void shiftBalanceSheetCoversOnlyTheChosenShiftDefinition() throws Exception {
        JsonNode sheet = generate("SHIFT", setup.allDayShift().getId());

        assertThat(sheet.get("shiftWindow").asText()).isEqualTo("All day");
        assertThat(sheet.get("totalLitresSold").decimalValue()).isEqualByComparingTo("20");
    }

    @Test
    void savedBalanceSheetCanBeReadListedAndDeletedOnlyByOwnerOrAdmin() throws Exception {
        long sheetId = generate("DAY", null).get("id").asLong();

        JsonNode read = json(perform(get("/api/pumps/{pumpId}/balance-sheets/{id}", setup.pumpId(), sheetId), setup.manager())
                .andExpect(status().isOk()));
        assertThat(read.get("totalExpectedRevenue").decimalValue()).isEqualByComparingTo("2000.00");
        JsonNode list = json(perform(get("/api/pumps/{pumpId}/balance-sheets", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(list.toString()).contains("\"id\":" + sheetId);

        perform(delete("/api/pumps/{pumpId}/balance-sheets/{id}", setup.pumpId(), sheetId), setup.manager())
                .andExpect(status().isForbidden());
        perform(delete("/api/pumps/{pumpId}/balance-sheets/{id}", setup.pumpId(), sheetId), setup.owner())
                .andExpect(status().is2xxSuccessful());
        perform(get("/api/pumps/{pumpId}/balance-sheets/{id}", setup.pumpId(), sheetId), setup.manager())
                .andExpect(status().isNotFound());
    }

    @Test
    void generatingTheSameDayTwiceIsRefusedUnlessForced() throws Exception {
        generate("DAY", null);

        perform(post("/api/pumps/{pumpId}/balance-sheets/generate", setup.pumpId()), setup.manager(),
                Map.of("reportType", "DAY", "reportDate", today))
                .andExpect(status().isBadRequest());
        assertThat(savedSheetCount()).isEqualTo(1);

        perform(post("/api/pumps/{pumpId}/balance-sheets/generate", setup.pumpId()), setup.manager(),
                Map.of("reportType", "DAY", "reportDate", today, "forceRegenerate", true))
                .andExpect(status().is2xxSuccessful());
        assertThat(savedSheetCount()).isEqualTo(2);
    }

    private long savedSheetCount() throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/balance-sheets", setup.pumpId()), setup.owner())
                .andExpect(status().isOk())).get("totalElements").asLong();
    }

    @Test
    void profitAndLossReportMatchesTheShiftSales() throws Exception {
        JsonNode report = json(perform(get("/api/pumps/{pumpId}/reports/profit-loss", setup.pumpId())
                .param("from", today).param("to", today), setup.manager()).andExpect(status().isOk()));

        assertThat(report.toString()).contains("2000");
    }

    @Test
    void discrepancyAndDutyReportsListTheShortShift() throws Exception {
        JsonNode discrepancy = json(perform(get("/api/pumps/{pumpId}/reports/operator-discrepancy", setup.pumpId())
                .param("from", today).param("to", today), setup.owner()).andExpect(status().isOk()));
        JsonNode duty = json(perform(get("/api/pumps/{pumpId}/reports/operator-duty", setup.pumpId())
                .param("operatorId", setup.operator().getId().toString())
                .param("from", today).param("to", today), setup.owner()).andExpect(status().isOk()));

        assertThat(discrepancy.toString()).contains("100");
        assertThat(duty.toString()).contains(setup.operator().getFullName());
    }

    @Test
    void otherReportsAnswerForTheirDateRange() throws Exception {
        for (String report : List.of("dip-pl", "expenses", "interest-accrual")) {
            perform(get("/api/pumps/{pumpId}/reports/" + report, setup.pumpId())
                    .param("from", today).param("to", today), setup.owner())
                    .andExpect(status().isOk());
        }
        JsonNode shifts = json(perform(get("/api/pumps/{pumpId}/reports/shifts", setup.pumpId())
                .param("from", today).param("to", today), setup.owner()).andExpect(status().isOk()));
        JsonNode tankLots = json(perform(get("/api/pumps/{pumpId}/reports/inventory-lots", setup.pumpId())
                .param("tankId", setup.tank().getId().toString()), setup.owner()).andExpect(status().isOk()));

        assertThat(shifts).hasSize(1);
        assertThat(shifts.get(0).get("id").asLong()).isEqualTo(shiftId);
        assertThat(shifts.get(0).get("totalAmountDue").decimalValue()).isEqualByComparingTo("2000.00");
        assertThat(shifts.get(0).get("cashCollected").decimalValue()).isEqualByComparingTo("1900.00");
        assertThat(shifts.get(0).get("discrepancyAmount").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(shifts.get(0).get("discrepancyType").asText()).isEqualTo("SHORT");
        assertThat(tankLots.get("totalRemaining").decimalValue()).isEqualByComparingTo("4980");
    }

    @Test
    void allTanksLotReportShowsActiveLotsAndOnlyOlderLotsDeliveredInTheChosenRange() throws Exception {
        InventoryLot oldExhaustedLot = inventoryLotRepository.save(InventoryLot.builder()
                .pumpId(setup.pumpId())
                .tankId(setup.tank().getId())
                .fuelType(FuelType.PETROL)
                .originalQuantity(new BigDecimal("1000.000"))
                .remainingQuantity(BigDecimal.ZERO)
                .costPricePerUnit(new BigDecimal("80.00"))
                .deliveryDate(TestDates.now().minusDays(200))
                .isDipAdjustment(true)
                .status(LotStatus.EXHAUSTED)
                .build());

        JsonNode defaultRange = json(perform(get("/api/pumps/{pumpId}/reports/inventory-lots/all", setup.pumpId()),
                setup.owner()).andExpect(status().isOk()));
        JsonNode wideRange = json(perform(get("/api/pumps/{pumpId}/reports/inventory-lots/all", setup.pumpId())
                .param("from", TestDates.today().minusDays(365).toString()).param("to", today), setup.owner())
                .andExpect(status().isOk()));

        assertThat(lotIdsIn(defaultRange)).doesNotContain(oldExhaustedLot.getId()).hasSize(1);
        assertThat(lotIdsIn(wideRange)).contains(oldExhaustedLot.getId()).hasSize(2);
        JsonNode activeLot = defaultRange.get("tanks").get(0).get("lots").get(0);
        assertThat(activeLot.get("consumptions").get(0).get("shiftName").asText()).isEqualTo("All day");
        assertThat(activeLot.get("totalConsumed").decimalValue()).isEqualByComparingTo("20");
    }

    private static List<Long> lotIdsIn(JsonNode report) {
        List<Long> ids = new ArrayList<>();
        report.get("tanks").forEach(tank -> tank.get("lots").forEach(lot -> ids.add(lot.get("lotId").asLong())));
        return ids;
    }

    @Test
    void operatorCannotReadReportsOrBalanceSheets() throws Exception {
        perform(get("/api/pumps/{pumpId}/reports/profit-loss", setup.pumpId())
                .param("from", today).param("to", today), setup.operator()).andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/balance-sheets", setup.pumpId()), setup.operator())
                .andExpect(status().isForbidden());
    }

    @Test
    void csvExportsAreOwnerOrAdminOnlyAndContainTheShift() throws Exception {
        String csv = perform(get("/api/pumps/{pumpId}/export/shifts", setup.pumpId())
                .param("from", today).param("to", today), setup.owner())
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(csv).contains("UPI Collected").contains("," + setup.operator().getId() + ",All day,CLOSED_DISCREPANCY_PENDING,2000.00,1900.00");

        perform(get("/api/pumps/{pumpId}/export/expenses", setup.pumpId())
                .param("from", today).param("to", today), setup.owner()).andExpect(status().isOk());
        perform(get("/api/pumps/{pumpId}/export/shifts", setup.pumpId())
                .param("from", today).param("to", today), setup.manager()).andExpect(status().isForbidden());
    }

    private JsonNode generate(String type, Long shiftDefinitionId) throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("reportType", type);
        request.put("reportDate", today);
        request.put("shiftDefinitionId", shiftDefinitionId);
        return json(perform(post("/api/pumps/{pumpId}/balance-sheets/generate", setup.pumpId()), setup.manager(), request)
                .andExpect(status().is2xxSuccessful()));
    }
}
