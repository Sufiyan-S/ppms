package com.ppms.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditLog;
import com.ppms.audit.AuditLogRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.TankerDelivery;
import com.ppms.inventory.TankerDeliveryRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Sheets are not generated over open shifts, and a saved sheet is flagged when what it summarises changes. */
class BalanceSheetFreshnessIntegrationTest extends ApiIntegrationTest {

    @Autowired private ShiftRepository shiftRepository;
    @Autowired private TankerDeliveryRepository tankerDeliveryRepository;
    @Autowired private LotConsumptionRepository lotConsumptionRepository;
    @Autowired private AuditLogRepository auditLogRepository;

    private PumpSetup setup;
    private long closedShiftId;
    private final String today = TestDates.today().toString();

    @BeforeEach
    void createPumpWithOneClosedShiftSellingTwentyLitresBoughtAtNinety() throws Exception {
        setup = createPumpWithStock("5000");
        closedShiftId = openShift();
        closeShift(closedShiftId, "1020.000", "2000.00");
    }

    @Test
    void pastDayWithAShiftStillOpenCannotBeGeneratedAndTheRefusalNamesTheShift() throws Exception {
        String yesterday = TestDates.today().minusDays(1).toString();
        perform(post("/api/pumps/{pumpId}/shifts/backfill", setup.pumpId()), setup.owner(), backfillRequest(yesterday))
                .andExpect(status().is2xxSuccessful());
        long stillOpenId = openShift();
        Shift stillOpen = shiftRepository.findById(stillOpenId).orElseThrow();
        stillOpen.setShiftDate(TestDates.today().minusDays(1));
        stillOpen.setStatus(ShiftStatus.AUTO_CLOSED_OVERDUE);
        shiftRepository.save(stillOpen);

        for (Map<String, Object> request : List.of(generateRequest("DAY", null, yesterday),
                generateRequest("SHIFT", setup.allDayShift().getId(), yesterday))) {
            perform(post("/api/pumps/{pumpId}/balance-sheets/generate", setup.pumpId()), setup.manager(), request)
                    .andExpect(status().isBadRequest())
                    .andExpect(content().string(allOf(containsString("Shift #" + stillOpenId),
                            containsString("AUTO_CLOSED_OVERDUE"), containsString("still open"))));
        }
        assertThat(sheetList().get("totalElements").asLong()).isZero();
    }

    @Test
    void todaysLiveSheetCountsOpenShiftsAndClosingOneMarksItStaleUntilRegenerated() throws Exception {
        long openShiftId = openShift();

        JsonNode live = generate("DAY", null);
        assertThat(live.get("openShiftCount").asInt()).isEqualTo(1);
        assertThat(live.get("stale").asBoolean()).isFalse();
        assertThat(live.get("totalLitresSold").decimalValue()).isEqualByComparingTo("20");

        closeShift(openShiftId, "1030.000", "1000.00");

        JsonNode afterClose = sheet(live.get("id").asLong());
        assertThat(afterClose.get("stale").asBoolean()).isTrue();
        assertThat(afterClose.get("staleReason").asText()).contains("Shift #" + openShiftId);
        assertThat(afterClose.get("staleReasonCode").asText()).isEqualTo("STALE_SHIFT_CLOSED");
        assertThat(afterClose.get("staleReasonParams").get("shiftId").asLong()).isEqualTo(openShiftId);
        assertThat(sheetList().get("content").get(0).get("staleReasonCode").asText()).isEqualTo("STALE_SHIFT_CLOSED");
        assertThat(sheetList().get("content").get(0).get("stale").asBoolean()).isTrue();

        perform(post("/api/pumps/{pumpId}/balance-sheets/{id}/regenerate", setup.pumpId(), live.get("id").asLong()),
                setup.manager()).andExpect(status().isForbidden());
        JsonNode regenerated = json(perform(post("/api/pumps/{pumpId}/balance-sheets/{id}/regenerate", setup.pumpId(),
                live.get("id").asLong()), setup.owner()).andExpect(status().isCreated()));
        assertThat(regenerated.get("id").asLong()).isNotEqualTo(live.get("id").asLong());
        assertThat(regenerated.get("stale").asBoolean()).isFalse();
        assertThat(regenerated.get("openShiftCount").asInt()).isZero();
        assertThat(regenerated.get("totalLitresSold").decimalValue()).isEqualByComparingTo("30");
        perform(get("/api/pumps/{pumpId}/balance-sheets/{id}", setup.pumpId(), live.get("id").asLong()), setup.owner())
                .andExpect(status().isNotFound());
        assertThat(sheetList().get("totalElements").asLong()).isEqualTo(1);
    }

    @Test
    void dipCheckShortfallIsValuedAtTheCostOfTheLotsItUsedAndMarksTheDaysSheetStale() throws Exception {
        long sheetId = generate("DAY", null).get("id").asLong();

        recordDipCheck("4970.000");

        assertThat(sheet(sheetId).get("stale").asBoolean()).isTrue();
        JsonNode regenerated = regenerate(sheetId);
        JsonNode dipLine = dipCheckLine(regenerated);
        assertThat(dipLine.get("litres").decimalValue()).isEqualByComparingTo("-10.000");
        assertThat(dipLine.get("monetaryAmount").decimalValue()).isEqualByComparingTo("-900.00");
        assertThat(regenerated.get("totalDipNetAmount").decimalValue()).isEqualByComparingTo("-900.00");
    }

    @Test
    void dipCheckGainIsValuedAtTheCostOfTheLotCreatedForIt() throws Exception {
        recordDipCheck("4990.000");

        JsonNode dipLine = dipCheckLine(generate("DAY", null));

        assertThat(dipLine.get("litres").decimalValue()).isEqualByComparingTo("10.000");
        assertThat(dipLine.get("monetaryAmount").decimalValue()).isEqualByComparingTo("900.00");
    }

    @Test
    void correctingADeliveryCostRecostsLitresAlreadySoldAndMarksTheirSheetStale() throws Exception {
        long sheetId = generate("DAY", null).get("id").asLong();
        assertThat(sheet(sheetId).get("totalCostOfGoods").decimalValue()).isEqualByComparingTo("1800.00");
        TankerDelivery delivery = tankerDeliveryRepository.findTopByPumpIdOrderByCreatedAtDesc(setup.pumpId()).orElseThrow();

        perform(patch("/api/inventory/{pumpId}/deliveries/{deliveryId}", setup.pumpId(), delivery.getId()), setup.owner(),
                Map.of("quantityDelivered", delivery.getQuantityDelivered(), "costPricePerUnit", new BigDecimal("80.00"),
                        "deliveryDate", TestDates.today().minusDays(1).toString(),
                        "invoiceReference", delivery.getInvoiceReference()))
                .andExpect(status().is2xxSuccessful());

        assertThat(lotConsumptionRepository.findByShiftId(closedShiftId)).extracting(LotConsumption::getCostPricePerUnit)
                .singleElement().satisfies(cost -> assertThat(cost).isEqualByComparingTo("80.00"));
        JsonNode staleSheet = sheet(sheetId);
        assertThat(staleSheet.get("stale").asBoolean()).isTrue();
        assertThat(staleSheet.get("staleReason").asText()).contains("₹90.000 → ₹80.000/L");
        assertThat(regenerate(sheetId).get("totalCostOfGoods").decimalValue()).isEqualByComparingTo("1600.00");
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.LOT_COST_CORRECTED)
                .extracting(AuditLog::getDescription).singleElement()
                .satisfies(description -> assertThat(description).contains("₹90.000 → ₹80.000/L", "20.000 L"));
    }

    private long openShift() throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", saveUser(UserRole.OPERATOR, setup.pumpId()).getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private void closeShift(long shiftId, String endReading, String cash) throws Exception {
        Map<String, Object> close = new HashMap<>();
        close.put("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal(endReading))));
        close.put("cashCollected", new BigDecimal(cash));
        close.put("upiCollected", BigDecimal.ZERO);
        close.put("cardCollected", BigDecimal.ZERO);
        close.put("fleetCardCollected", BigDecimal.ZERO);
        close.put("creditTotal", BigDecimal.ZERO);
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(), close)
                .andExpect(status().is2xxSuccessful());
    }

    private void recordDipCheck(String measuredLitres) throws Exception {
        perform(post("/api/inventory/{pumpId}/dip-checks", setup.pumpId()), setup.manager(),
                Map.of("tankId", setup.tank().getId(), "measuredQuantity", new BigDecimal(measuredLitres), "checkedAt", today))
                .andExpect(status().is2xxSuccessful());
    }

    private static JsonNode dipCheckLine(JsonNode sheet) {
        for (JsonNode line : sheet.get("dipPlEntries")) {
            if ("DIP_CHECK".equals(line.get("type").asText())) {
                return line;
            }
        }
        throw new AssertionError("Sheet has no dip check line: " + sheet.get("dipPlEntries"));
    }

    private JsonNode generate(String type, Long shiftDefinitionId) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/balance-sheets/generate", setup.pumpId()), setup.manager(),
                generateRequest(type, shiftDefinitionId, today))
                .andExpect(status().is2xxSuccessful()));
    }

    private JsonNode regenerate(long sheetId) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/balance-sheets/{id}/regenerate", setup.pumpId(), sheetId), setup.owner())
                .andExpect(status().isCreated()));
    }

    private static Map<String, Object> generateRequest(String type, Long shiftDefinitionId, String reportDate) {
        Map<String, Object> request = new HashMap<>();
        request.put("reportType", type);
        request.put("reportDate", reportDate);
        request.put("shiftDefinitionId", shiftDefinitionId);
        return request;
    }

    private JsonNode sheet(long sheetId) throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/balance-sheets/{id}", setup.pumpId(), sheetId), setup.manager())
                .andExpect(status().isOk()));
    }

    private JsonNode sheetList() throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/balance-sheets", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
    }

    private Map<String, Object> backfillRequest(String shiftDate) {
        Map<String, Object> request = new HashMap<>();
        request.put("shiftDefinitionId", setup.allDayShift().getId());
        request.put("shiftDate", shiftDate);
        request.put("duId", setup.du().getId());
        request.put("operatorId", setup.operator().getId());
        request.put("nozzleReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(),
                "openingReading", new BigDecimal("1000.000"), "closingReading", new BigDecimal("1010.000"))));
        request.put("cashCollected", new BigDecimal("1000.00"));
        request.put("upiCollected", BigDecimal.ZERO);
        request.put("cardCollected", BigDecimal.ZERO);
        request.put("fleetCardCollected", BigDecimal.ZERO);
        request.put("creditTotal", BigDecimal.ZERO);
        request.put("fuelRateOverrides", Map.of("PETROL", new BigDecimal("100.00")));
        return request;
    }
}
