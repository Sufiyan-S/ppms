package com.ppms.shift;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
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
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A handover closes the outgoing operator's shift with their figures and opens the incoming operator's shift. */
class ShiftHandoverIntegrationTest extends ApiIntegrationTest {

    @Autowired private ShiftRepository shiftRepository;
    @Autowired private ShiftCreditEntryRepository creditEntryRepository;
    @Autowired private ShiftHandoverRepository handoverRepository;
    @Autowired private CashEventRepository cashEventRepository;

    private PumpSetup setup;
    private User incoming;

    @BeforeEach
    void createPumpAndIncomingOperator() throws Exception {
        setup = createPumpWithStock("5000");
        incoming = saveUser(UserRole.OPERATOR, setup.pumpId());
    }

    @Test
    void handoverClosesTheOutgoingShiftWithItsOwnShortageAndCreditAndOpensTheIncomingShiftFromItsReadings() throws Exception {
        long outgoingShiftId = openShift();
        long clientId = createCreditClient();

        JsonNode handover = json(perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                handoverRequest(outgoingShiftId, closing("1010.000", "700.00", "200.00", List.of(creditEntry(clientId, "200.00")),
                        "Short at handover")))
                .andExpect(status().isCreated()));

        Shift outgoing = shiftRepository.findById(outgoingShiftId).orElseThrow();
        assertThat(outgoing.getOperatorId()).isEqualTo(setup.operator().getId());
        assertThat(outgoing.getStatus()).isEqualTo(ShiftStatus.CLOSED_DISCREPANCY_PENDING);
        assertThat(outgoing.getTotalAmountDue()).isEqualByComparingTo("1000.00");
        assertThat(outgoing.getDiscrepancyType()).isEqualTo(DiscrepancyType.SHORT);
        assertThat(outgoing.getDiscrepancyAmount()).isEqualByComparingTo("100.00");
        assertThat(creditEntryRepository.findByShiftId(outgoingShiftId))
                .extracting(ShiftCreditEntry::getAmount).singleElement()
                .satisfies(amount -> assertThat(amount).isEqualByComparingTo("200.00"));
        assertThat(cashInEvents()).extracting(CashEvent::getDescription).singleElement()
                .satisfies(description -> assertThat(description).contains("Shift #" + outgoingShiftId));

        long incomingShiftId = handover.get("incomingShiftId").asLong();
        assertThat(handover.get("outgoingShiftStatus").asText()).isEqualTo("CLOSED_DISCREPANCY_PENDING");
        JsonNode incomingShift = json(perform(get("/api/pumps/{pumpId}/shifts/{id}", setup.pumpId(), incomingShiftId),
                setup.manager()).andExpect(status().isOk()));
        assertThat(incomingShift.get("operatorId").asLong()).isEqualTo(incoming.getId());
        assertThat(incomingShift.get("status").asText()).isEqualTo("OPEN");
        assertThat(incomingShift.get("fuelReadings").get(0).get("startReading").decimalValue()).isEqualByComparingTo("1010.000");
        Shift opened = shiftRepository.findById(incomingShiftId).orElseThrow();
        assertThat(opened.getShiftDefinitionId()).isEqualTo(outgoing.getShiftDefinitionId());
        assertThat(opened.getShiftDate()).isEqualTo(outgoing.getShiftDate());
        assertThat(opened.getActualStartTime()).isEqualTo(outgoing.getActualEndTime());
        assertThat(handoverRepository.findByOutgoingShiftId(outgoingShiftId).orElseThrow().getIncomingShiftId())
                .isEqualTo(incomingShiftId);
    }

    @Test
    void incomingOperatorsLaterCloseCountsOnlyTheirOwnSales() throws Exception {
        long outgoingShiftId = openShift();
        long incomingShiftId = json(perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                handoverRequest(outgoingShiftId, closing("1010.000", "1000.00", "0", List.of(), null)))
                .andExpect(status().isCreated())).get("incomingShiftId").asLong();

        JsonNode closed = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), incomingShiftId),
                setup.manager(), closing("1025.000", "1500.00", "0", List.of(), null))
                .andExpect(status().is2xxSuccessful()));

        assertThat(closed.get("operatorId").asLong()).isEqualTo(incoming.getId());
        assertThat(closed.get("status").asText()).isEqualTo("CLOSED_BALANCED");
        assertThat(closed.get("totalAmountDue").decimalValue()).isEqualByComparingTo("1500.00");
        assertThat(shiftRepository.findById(outgoingShiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.CLOSED_BALANCED);
        assertThat(shiftRepository.findById(outgoingShiftId).orElseThrow().getTotalAmountDue()).isEqualByComparingTo("1000.00");
        assertThat(nozzleRepository.findById(setup.nozzle().getId()).orElseThrow().getLastReading())
                .isEqualByComparingTo("1025.000");
    }

    @Test
    void refusedCloseLeavesTheOutgoingShiftOpenAndGivesTheIncomingOperatorNoShift() throws Exception {
        long outgoingShiftId = openShift();

        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                handoverRequest(outgoingShiftId, closing("990.000", "0", "0", List.of(), null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CLOSING_READING_BELOW_OPENING"))
                .andExpect(jsonPath("$.params.closingReading").value("990.000"));

        assertThat(shiftRepository.findById(outgoingShiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN);
        assertThat(shiftRepository.findOpenShiftByOperator(incoming.getId())).isEmpty();
        assertThat(handoverRepository.findByOutgoingShiftId(outgoingShiftId)).isEmpty();
    }

    @Test
    void overdueShiftCannotBeHandedOverAndMustBeClosedInstead() throws Exception {
        long outgoingShiftId = openShift();
        Shift shift = shiftRepository.findById(outgoingShiftId).orElseThrow();
        shift.setStatus(ShiftStatus.OPEN_OVERDUE);
        shiftRepository.save(shift);

        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                handoverRequest(outgoingShiftId, closing("1010.000", "1000.00", "0", List.of(), null)))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("Close this shift and open a new shift")))
                .andExpect(jsonPath("$.code").value("HANDOVER_SHIFT_OVERDUE"))
                .andExpect(jsonPath("$.params.statusCode").value("OPEN_OVERDUE"));

        assertThat(shiftRepository.findById(outgoingShiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN_OVERDUE);
    }

    @Test
    void handoverWithoutTheOutgoingOperatorsClosingFiguresIsRefused() throws Exception {
        long outgoingShiftId = openShift();

        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                Map.of("outgoingShiftId", outgoingShiftId, "incomingOperatorId", incoming.getId()))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("closing meter readings and payments")))
                .andExpect(jsonPath("$.code").value("HANDOVER_CLOSING_REQUIRED"));

        assertThat(shiftRepository.findById(outgoingShiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN);
    }

    private long openShift() throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private Map<String, Object> handoverRequest(long outgoingShiftId, Map<String, Object> closing) {
        return Map.of("outgoingShiftId", outgoingShiftId, "incomingOperatorId", incoming.getId(),
                "physicalCashVerified", true, "meterReadingsVerified", true, "closing", closing);
    }

    private Map<String, Object> closing(String endReading, String cash, String creditTotal,
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

    private Map<String, Object> creditEntry(long clientId, String amount) {
        return Map.of("clientName", "Fleet Co", "clientId", clientId, "amount", new BigDecimal(amount), "fuelType", "PETROL");
    }

    private long createCreditClient() throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Fleet Co " + shortId(), "phone", "9" + shortId().replaceAll("[^0-9]", "1").substring(0, 4) + "12345"))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private List<CashEvent> cashInEvents() {
        return cashEventRepository.findByPumpIdOrderByEventDateDescCreatedAtDesc(setup.pumpId(), PageRequest.of(0, 20))
                .getContent().stream()
                .filter(event -> event.getEventType() == CashEventType.CASH_IN)
                .toList();
    }
}
