package com.ppms.attention;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.pump.NozzleCalibrationLog;
import com.ppms.pump.NozzleCalibrationLogRepository;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AttentionIntegrationTest extends ApiIntegrationTest {

    private static final LocalDate TODAY = TestDates.today();

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private NozzleCalibrationLogRepository calibrationLogRepository;

    private PumpSetup setup;

    @BeforeEach
    void createFullySetUpPump() throws Exception {
        setup = createPumpWithStock("5000");
        addGstDetails(setup);
    }

    @Test
    void fullySetUpPumpWithNothingPendingIsAllClear() throws Exception {
        assertThat(attention(setup.owner())).isEmpty();
    }

    @Test
    void pumpWithoutGstDetailsShowsSetupIncomplete() throws Exception {
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(), Map.of("gstin", ""))
                .andExpect(status().isOk());

        JsonNode item = itemOf(attention(setup.owner()), "SETUP_INCOMPLETE");

        assertThat(item.get("reason").asText()).contains("GST details");
        assertThat(item.get("reasonCode").asText()).isEqualTo("ATTENTION_SETUP_INCOMPLETE");
        assertThat(item.get("reasonParams").get("missingCodes").get(0).asText()).isEqualTo("GST_DETAILS");
        assertThat(item.get("targetPath").asText()).isEqualTo("/dashboard/setup");
    }

    @Test
    void pendingExpensesAndCreditPaymentsAreOneApprovalItem() throws Exception {
        recordExpense("500.00");
        recordExpense("250.50");

        JsonNode item = itemOf(attention(setup.admin()), "PENDING_APPROVALS");

        assertThat(item.get("count").asLong()).isEqualTo(2);
        assertThat(item.get("amount").decimalValue()).isEqualByComparingTo("750.50");
        assertThat(item.get("reason").asText()).isEqualTo("2 expenses waiting for your approval");
        assertThat(item.get("reasonCode").asText()).isEqualTo("ATTENTION_PENDING_EXPENSES");
        assertThat(item.get("reasonParams").get("count").asLong()).isEqualTo(2);
        assertThat(item.get("targetPath").asText()).isEqualTo("/dashboard/approvals");
        assertThat(item.get("pumpId").asLong()).isEqualTo(setup.pumpId());
    }

    @Test
    void shortagesShiftsSettlementsAndBalanceSheetsNeedingActionAreListedMostUrgentFirst() throws Exception {
        insertClosedShift("CLOSED_DISCREPANCY_PENDING_APPROVAL", TODAY.minusDays(5), "1000.00", "250.00", null);
        insertClosedShift("CLOSED_DISCREPANCY_PENDING", TODAY.minusDays(12), "0.00", "80.00",
                TestDates.now().minusDays(10));
        insertClosedShift("AUTO_CLOSED_OVERDUE", TODAY.minusDays(1), null, null, null);

        JsonNode items = attention(setup.owner());

        JsonNode escalated = itemOf(items, "ESCALATED_SHORTAGES");
        assertThat(escalated.get("amount").decimalValue()).isEqualByComparingTo("250.00");
        assertThat(escalated.get("severity").asText()).isEqualTo("HIGH");
        assertThat(escalated.get("targetPath").asText()).isEqualTo("/dashboard/shifts?history=discrepancies");
        assertThat(itemOf(items, "LONG_INVESTIGATIONS").get("amount").decimalValue()).isEqualByComparingTo("80.00");
        assertThat(itemOf(items, "AUTO_CLOSED_SHIFTS").get("count").asLong()).isEqualTo(1);
        assertThat(itemOf(items, "UNSETTLED_PAYMENTS").get("amount").decimalValue()).isEqualByComparingTo("1000.00");
        assertThat(itemOf(items, "BALANCE_SHEETS").get("count").asLong()).isEqualTo(1);
        List<String> severities = new ArrayList<>();
        items.forEach(item -> severities.add(item.get("severity").asText()));
        assertThat(severities).isSortedAccordingTo((first, second) ->
                AttentionSeverity.valueOf(first).compareTo(AttentionSeverity.valueOf(second)));
    }

    @Test
    void recentCollectionsAreNotYetLateForSettlement() throws Exception {
        insertClosedShift("CLOSED_BALANCED", TODAY.minusDays(2), "1000.00", null, null);

        assertThat(typesOf(attention(setup.owner()))).doesNotContain("UNSETTLED_PAYMENTS");
    }

    @Test
    void overdueAndOverLimitCreditClientsAreListedWithTheirBalances() throws Exception {
        long shiftId = openShift();
        long overdueClient = createClient();
        long overLimitClient = createClient();
        long entryId = sellOnCredit(shiftId, overdueClient, "400.00");
        sellOnCredit(shiftId, overLimitClient, "300.00");
        jdbcTemplate.update("UPDATE shift_credit_entries SET sale_date = ? WHERE id = ?", TODAY.minusDays(45), entryId);
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit", setup.pumpId(), overLimitClient),
                setup.manager(), Map.of("creditLimit", new BigDecimal("100.00")))
                .andExpect(status().isOk());

        JsonNode items = attention(setup.owner());

        JsonNode overdue = itemOf(items, "OVERDUE_CREDIT");
        assertThat(overdue.get("count").asLong()).isEqualTo(1);
        assertThat(overdue.get("amount").decimalValue()).isEqualByComparingTo("400.00");
        assertThat(overdue.get("targetPath").asText()).isEqualTo("/dashboard/credit?tab=ledger&filter=overdue");
        JsonNode overLimit = itemOf(items, "OVER_LIMIT_CREDIT");
        assertThat(overLimit.get("amount").decimalValue()).isEqualByComparingTo("300.00");
        assertThat(overLimit.get("targetPath").asText()).isEqualTo("/dashboard/credit?tab=ledger&filter=over-limit");
    }

    @Test
    void expiringDocumentsDueCalibrationsAndPricesFromAnEarlierDayAreListed() throws Exception {
        jdbcTemplate.update("INSERT INTO pump_documents (pump_id, name, doc_type, expiry_date, uploaded_by_user_id) "
                + "VALUES (?, 'Explosives licence', 'PESO', ?, ?)", setup.pumpId(), TODAY.minusDays(1), setup.owner().getId());
        jdbcTemplate.update("INSERT INTO pump_documents (pump_id, name, doc_type, expiry_date, uploaded_by_user_id) "
                + "VALUES (?, 'Trade licence', 'TRADE', ?, ?)", setup.pumpId(), TODAY.plusDays(20), setup.owner().getId());
        jdbcTemplate.update("INSERT INTO pump_documents (pump_id, name, doc_type, expiry_date, uploaded_by_user_id) "
                + "VALUES (?, 'Fire NOC', 'FIRE', ?, ?)", setup.pumpId(), TODAY.plusDays(200), setup.owner().getId());
        calibrationLogRepository.save(NozzleCalibrationLog.builder()
                .pumpId(setup.pumpId())
                .nozzleId(setup.nozzle().getId())
                .calibrationDate(TODAY.minusMonths(6))
                .nextCalibrationDue(TODAY.plusDays(3))
                .loggedByUserId(setup.owner().getId())
                .build());
        jdbcTemplate.update("UPDATE global_fuel_prices SET effective_from = ? WHERE pump_id = ?",
                TestDates.now().minusDays(2), setup.pumpId());

        JsonNode items = attention(setup.owner());

        JsonNode documents = itemOf(items, "EXPIRING_DOCUMENTS");
        assertThat(documents.get("count").asLong()).isEqualTo(2);
        assertThat(documents.get("severity").asText()).isEqualTo("HIGH");
        assertThat(documents.get("reason").asText()).isEqualTo("1 document expired and 1 document expiring within 30 days");
        assertThat(documents.get("reasonCode").asText()).isEqualTo("ATTENTION_EXPIRED_AND_EXPIRING_DOCUMENTS");
        assertThat(documents.get("reasonParams").get("expiredCount").asLong()).isEqualTo(1);
        assertThat(documents.get("reasonParams").get("expiringCount").asLong()).isEqualTo(1);
        assertThat(documents.get("reasonParams").get("days").asLong()).isEqualTo(30);
        assertThat(itemOf(items, "CALIBRATIONS_DUE").get("severity").asText()).isEqualTo("MEDIUM");
        assertThat(itemOf(items, "STALE_FUEL_PRICES").get("severity").asText()).isEqualTo("LOW");
    }

    @Test
    void accountantSeesOnlyCreditItems() throws Exception {
        recordExpense("500.00");
        long shiftId = openShift();
        long clientId = createClient();
        long entryId = sellOnCredit(shiftId, clientId, "400.00");
        jdbcTemplate.update("UPDATE shift_credit_entries SET sale_date = ? WHERE id = ?", TODAY.minusDays(45), entryId);
        insertClosedShift("AUTO_CLOSED_OVERDUE", TODAY.minusDays(1), null, null, null);

        assertThat(typesOf(attention(setup.accountant()))).containsExactly("OVERDUE_CREDIT");
        assertThat(typesOf(attention(setup.owner()))).contains("OVERDUE_CREDIT", "PENDING_APPROVALS", "AUTO_CLOSED_SHIFTS");
    }

    @Test
    void managerOperatorAndOtherPumpsOwnerCannotReadTheList() throws Exception {
        PumpSetup otherPump = createPumpWithStock("0");

        perform(get("/api/pumps/{pumpId}/attention", setup.pumpId()), setup.manager()).andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/attention", setup.pumpId()), setup.operator()).andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/attention", setup.pumpId()), otherPump.owner()).andExpect(status().isForbidden());
        perform(get("/api/pumps/attention"), setup.manager()).andExpect(status().isForbidden());
    }

    @Test
    void allPumpsListCoversEveryPumpOfTheOwnerAndNoOtherOwnersPumps() throws Exception {
        PumpSetup secondPump = createPumpWithStock("0");
        var pump = secondPump.pump();
        pump.setOwnerId(setup.owner().getId());
        pumpLocationRepository.save(pump);
        PumpSetup strangersPump = createPumpWithStock("0");
        recordExpense("500.00");

        JsonNode items = json(perform(get("/api/pumps/attention"), setup.owner()).andExpect(status().isOk()));

        List<Long> pumpIds = new ArrayList<>();
        items.forEach(item -> pumpIds.add(item.get("pumpId").asLong()));
        assertThat(pumpIds).contains(setup.pumpId(), secondPump.pumpId()).doesNotContain(strangersPump.pumpId());
        assertThat(items).anySatisfy(item -> {
            assertThat(item.get("pumpId").asLong()).isEqualTo(secondPump.pumpId());
            assertThat(item.get("type").asText()).isEqualTo("SETUP_INCOMPLETE");
            assertThat(item.get("pumpName").asText()).isEqualTo(secondPump.pump().getName());
        });
    }

    private JsonNode attention(User user) throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/attention", setup.pumpId()), user).andExpect(status().isOk()));
    }

    private static JsonNode itemOf(JsonNode items, String type) {
        for (JsonNode item : items) {
            if (item.get("type").asText().equals(type)) {
                return item;
            }
        }
        throw new AssertionError(type + " missing from " + items);
    }

    private static List<String> typesOf(JsonNode items) {
        List<String> types = new ArrayList<>();
        items.forEach(item -> types.add(item.get("type").asText()));
        return types;
    }

    private void addGstDetails(PumpSetup pumpSetup) throws Exception {
        perform(patch("/api/pumps/{pumpId}/settings", pumpSetup.pumpId()), pumpSetup.owner(),
                Map.of("gstin", "27AAAPL1234C1ZV", "legalName", "Lakshmi Fuels Pvt Ltd",
                        "stateName", "Maharashtra", "invoicePrefix", "PMP"))
                .andExpect(status().isOk());
    }

    private void recordExpense(String amount) throws Exception {
        perform(post("/api/pumps/{pumpId}/expenses", setup.pumpId()), setup.manager(),
                Map.of("category", "MAINTENANCE", "amount", new BigDecimal(amount),
                        "description", "Compressor repair", "expenseDate", TODAY.toString()))
                .andExpect(status().isCreated());
    }

    private void insertClosedShift(String status, LocalDate shiftDate, String upiCollected, String shortage,
                                   OffsetDateTime investigationStartedAt) {
        OffsetDateTime start = TestDates.now().minusDays(TODAY.toEpochDay() - shiftDate.toEpochDay()).minusHours(8);
        jdbcTemplate.update("""
                        INSERT INTO shifts (pump_id, du_id, operator_id, opened_by_user_id, shift_definition_id, shift_name,
                                            shift_date, actual_start_time, actual_end_time, upi_collected,
                                            discrepancy_amount, discrepancy_type, status,
                                            investigation_started_at, investigation_started_by_id, investigation_note)
                        VALUES (?, ?, ?, ?, ?, 'All day', ?, ?, ?, ?, ?, CAST(? AS discrepancy_type), CAST(? AS shift_status), ?, ?, ?)
                        """,
                setup.pumpId(), setup.du().getId(), setup.operator().getId(), setup.manager().getId(),
                setup.allDayShift().getId(), shiftDate, start, start.plusHours(8),
                upiCollected != null ? new BigDecimal(upiCollected) : null,
                shortage != null ? new BigDecimal(shortage) : null, shortage != null ? "SHORT" : null, status,
                investigationStartedAt,
                investigationStartedAt != null ? setup.manager().getId() : null,
                investigationStartedAt != null ? "Checking the CCTV" : null);
    }

    private long openShift() throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private long createClient() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "Client " + shortId());
        body.put("phone", "9" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L));
        return json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(), body)
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private long sellOnCredit(long shiftId, long clientId, String amount) throws Exception {
        JsonNode shift = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId),
                setup.operator(), Map.of("clientName", "Client", "clientId", clientId,
                        "amount", new BigDecimal(amount), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful()));
        JsonNode entries = shift.get("creditEntries");
        return entries.get(entries.size() - 1).get("id").asLong();
    }
}
