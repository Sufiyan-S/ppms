package com.ppms.shift;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ShiftLifecycleIntegrationTest extends ApiIntegrationTest {

    @Autowired private LotConsumptionRepository lotConsumptionRepository;
    @Autowired private CashEventRepository cashEventRepository;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("5000");
    }

    @Test
    void closingWithFullPaymentBalancesTheShiftAndDeductsStockAtTheDeliveryCost() throws Exception {
        long shiftId = openShift();

        JsonNode closed = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId),
                setup.manager(), closeRequest("1010.000", "1000.00", "0", List.of(), null))
                .andExpect(status().is2xxSuccessful()));

        assertThat(closed.get("status").asText()).isEqualTo("CLOSED_BALANCED");
        assertThat(closed.get("totalAmountDue").decimalValue()).isEqualByComparingTo("1000.00");
        assertThat(tankRepository.findById(setup.tank().getId()).orElseThrow().getCurrentStock())
                .isEqualByComparingTo("4990");
        assertThat(nozzleRepository.findById(setup.nozzle().getId()).orElseThrow().getLastReading())
                .isEqualByComparingTo("1010.000");

        List<LotConsumption> consumptions = lotConsumptionRepository.findByShiftId(shiftId);
        assertThat(consumptions).hasSize(1);
        assertThat(consumptions.get(0).getQuantityConsumed()).isEqualByComparingTo("10");
        assertThat(consumptions.get(0).getCostPricePerUnit()).isEqualByComparingTo("90.00");

        List<CashEvent> cashEvents = cashEventRepository
                .findByPumpIdOrderByEventDateDescCreatedAtDesc(setup.pumpId(), PageRequest.of(0, 10)).getContent();
        assertThat(cashEvents).extracting(CashEvent::getEventType).contains(CashEventType.CASH_IN);
        assertThat(cashEvents).filteredOn(event -> event.getEventType() == CashEventType.CASH_IN)
                .extracting(CashEvent::getAmount).first().satisfies(amount -> assertThat(amount).isEqualByComparingTo("1000.00"));
    }

    @Test
    void shortPaymentLeavesADiscrepancyThatOnlyCloseWithANoteCanWaive() throws Exception {
        long shiftId = openShift();

        JsonNode closed = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId),
                setup.manager(), closeRequest("1010.000", "800.00", "0", List.of(), "Customer left without paying"))
                .andExpect(status().is2xxSuccessful()));

        assertThat(closed.get("status").asText()).isEqualTo("CLOSED_DISCREPANCY_PENDING");
        assertThat(closed.get("discrepancyAmount").decimalValue()).isEqualByComparingTo("200.00");
        assertThat(closed.get("discrepancyType").asText()).isEqualTo("SHORT");

        perform(patch("/api/pumps/{pumpId}/shifts/{id}/discrepancy-resolution", setup.pumpId(), shiftId),
                setup.manager(), Map.of("resolutionAction", "WAIVED"))
                .andExpect(status().isBadRequest());

        JsonNode resolved = json(perform(patch("/api/pumps/{pumpId}/shifts/{id}/discrepancy-resolution", setup.pumpId(), shiftId),
                setup.manager(), Map.of("resolutionAction", "WAIVED", "resolutionNote", "Owner agreed"))
                .andExpect(status().is2xxSuccessful()));
        assertThat(resolved.get("status").asText()).isEqualTo("CLOSED_DISCREPANCY_RESOLVED");
        assertThat(resolved.get("discrepancyResolution").asText()).isEqualTo("WAIVED");
    }

    @Test
    void discrepancyAboveThePumpThresholdNeedsOwnerApproval() throws Exception {
        PumpLocation pump = setup.pump();
        pump.setDiscrepancyEscalationThreshold(new BigDecimal("100.00"));
        pumpLocationRepository.save(pump);
        long shiftId = openShift();

        JsonNode closed = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId),
                setup.manager(), closeRequest("1010.000", "500.00", "0", List.of(), "Large shortage"))
                .andExpect(status().is2xxSuccessful()));

        assertThat(closed.get("status").asText()).isEqualTo("CLOSED_DISCREPANCY_PENDING_APPROVAL");
    }

    @Test
    void creditSalesAtCloseCountTowardsPaymentAndRaiseTheClientsBalance() throws Exception {
        long clientId = createCreditClient();
        long shiftId = openShift();
        Map<String, Object> creditEntry = new HashMap<>();
        creditEntry.put("clientName", "Fleet Co");
        creditEntry.put("clientId", clientId);
        creditEntry.put("amount", new BigDecimal("300.00"));
        creditEntry.put("fuelType", "PETROL");

        JsonNode closed = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId),
                setup.manager(), closeRequest("1010.000", "700.00", "300.00", List.of(creditEntry), null))
                .andExpect(status().is2xxSuccessful()));

        assertThat(closed.get("status").asText()).isEqualTo("CLOSED_BALANCED");
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("300.00");
    }

    @Test
    void creditEntryAddedMidShiftCanBeVoidedOnlyWhileTheShiftIsOpen() throws Exception {
        long clientId = createCreditClient();
        long shiftId = openShift();

        JsonNode withEntry = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId),
                setup.operator(), Map.of("clientName", "Fleet Co", "clientId", clientId,
                        "amount", new BigDecimal("250.00"), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful()));
        long entryId = withEntry.get("creditEntries").get(0).get("id").asLong();
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("250.00");

        perform(patch("/api/pumps/{pumpId}/shifts/{shiftId}/credit-entries/{entryId}/void", setup.pumpId(), shiftId, entryId),
                setup.manager(), Map.of("voidReason", "Wrong client"))
                .andExpect(status().is2xxSuccessful());
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("0");

        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId),
                setup.manager(), closeRequest("1010.000", "1000.00", "0", List.of(), null))
                .andExpect(status().is2xxSuccessful());
        perform(patch("/api/pumps/{pumpId}/shifts/{shiftId}/credit-entries/{entryId}/void", setup.pumpId(), shiftId, entryId),
                setup.manager(), Map.of("voidReason", "Too late"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void correctedCreditEntryReplacesTheOriginalOnlyWhenTheShiftCloses() throws Exception {
        long clientId = createCreditClient();
        long shiftId = openShift();
        JsonNode withEntry = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId),
                setup.operator(), Map.of("clientName", "Fleet Co", "clientId", clientId,
                        "amount", new BigDecimal("250.00"), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful()));
        long originalEntryId = withEntry.get("creditEntries").get(0).get("id").asLong();
        Map<String, Object> corrected = new HashMap<>();
        corrected.put("clientName", "Fleet Co");
        corrected.put("clientId", clientId);
        corrected.put("amount", new BigDecimal("300.00"));
        corrected.put("fuelType", "PETROL");

        Map<String, Object> failingClose = closeRequest("1010.000", "700.00", "550.00", List.of(corrected), null);
        failingClose.put("replacedCreditEntryIds", List.of(originalEntryId));
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(), failingClose)
                .andExpect(status().isBadRequest());
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("250.00");

        Map<String, Object> close = closeRequest("1010.000", "700.00", "300.00", List.of(corrected), null);
        close.put("replacedCreditEntryIds", List.of(originalEntryId));
        JsonNode closed = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId),
                setup.manager(), close)
                .andExpect(status().is2xxSuccessful()));

        assertThat(closed.get("status").asText()).isEqualTo("CLOSED_BALANCED");
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("300.00");
    }

    @Test
    void closingAShiftTwiceIsRefused() throws Exception {
        long shiftId = openShift();
        Map<String, Object> request = closeRequest("1010.000", "1000.00", "0", List.of(), null);
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(), request)
                .andExpect(status().is2xxSuccessful());

        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(), request)
                .andExpect(status().isBadRequest());

        assertThat(tankRepository.findById(setup.tank().getId()).orElseThrow().getCurrentStock())
                .isEqualByComparingTo("4990");
        assertThat(lotConsumptionRepository.findByShiftId(shiftId)).hasSize(1);
    }

    @Test
    void closingReadingBelowTheOpeningReadingIsRefusedAndTheShiftStaysOpen() throws Exception {
        long shiftId = openShift();

        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId),
                setup.manager(), closeRequest("999.000", "0", "0", List.of(), null))
                .andExpect(status().isBadRequest());

        JsonNode active = json(perform(get("/api/pumps/{pumpId}/shifts/active", setup.pumpId()), setup.manager())
                .andExpect(status().is2xxSuccessful()));
        assertThat(active).extracting(node -> node.get("id").asLong()).contains(shiftId);
    }

    @Test
    void theSameNozzleCannotBeOpenedOnTwoShifts() throws Exception {
        openShift();
        User secondOperator = saveUser(UserRole.OPERATOR, setup.pumpId());

        perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", secondOperator.getId()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void operatorCannotOpenOrCloseShifts() throws Exception {
        perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.operator(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().isForbidden());
    }

    @Test
    void historyListsClosedShiftsAndDiscrepancyFilterNarrowsThem() throws Exception {
        long balanced = openShift();
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), balanced),
                setup.manager(), closeRequest("1010.000", "1000.00", "0", List.of(), null)).andExpect(status().is2xxSuccessful());
        long shortShift = openShift();
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shortShift),
                setup.manager(), closeRequest("1020.000", "900.00", "0", List.of(), "Short")).andExpect(status().is2xxSuccessful());

        JsonNode all = json(perform(get("/api/pumps/{pumpId}/shifts/history", setup.pumpId()), setup.manager())
                .andExpect(status().is2xxSuccessful()));
        JsonNode discrepancies = json(perform(get("/api/pumps/{pumpId}/shifts/history", setup.pumpId())
                .param("discrepanciesOnly", "true"), setup.manager()).andExpect(status().is2xxSuccessful()));

        assertThat(all.get("content")).extracting(node -> node.get("id").asLong()).contains(balanced, shortShift);
        assertThat(discrepancies.get("content")).extracting(node -> node.get("id").asLong())
                .contains(shortShift).doesNotContain(balanced);

        JsonNode single = json(perform(get("/api/pumps/{pumpId}/shifts/{id}", setup.pumpId(), shortShift), setup.manager())
                .andExpect(status().is2xxSuccessful()));
        assertThat(single.get("discrepancyAmount").decimalValue()).isEqualByComparingTo("100.00");
    }

    private long openShift() throws Exception {
        JsonNode opened = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful()));
        assertThat(opened.get("status").asText()).isEqualTo("OPEN");
        return opened.get("id").asLong();
    }

    private Map<String, Object> closeRequest(String endReading, String cash, String creditTotal,
                                             List<Map<String, Object>> creditEntries, String reason) {
        Map<String, Object> request = new HashMap<>();
        request.put("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal(endReading))));
        request.put("cashCollected", new BigDecimal(cash));
        request.put("upiCollected", BigDecimal.ZERO);
        request.put("cardCollected", BigDecimal.ZERO);
        request.put("fleetCardCollected", BigDecimal.ZERO);
        request.put("creditTotal", new BigDecimal(creditTotal));
        request.put("creditEntries", creditEntries);
        request.put("discrepancyReason", reason);
        return request;
    }

    private long createCreditClient() throws Exception {
        JsonNode client = json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Fleet Co " + shortId(), "phone", "9" + shortId().replaceAll("[^0-9]", "1").substring(0, 4) + "12345"))
                .andExpect(status().is2xxSuccessful()));
        return client.get("id").asLong();
    }

    private BigDecimal outstandingOf(long clientId) throws Exception {
        JsonNode summary = json(perform(get("/api/pumps/{pumpId}/credit-ledger", setup.pumpId()), setup.owner())
                .andExpect(status().is2xxSuccessful()));
        for (JsonNode client : summary) {
            if (client.get("id").asLong() == clientId) {
                return client.get("outstandingBalance").decimalValue();
            }
        }
        throw new AssertionError("Client " + clientId + " missing from ledger summary");
    }
}
