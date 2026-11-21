package com.ppms.settlement;

import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MoneyFlowsIntegrationTest extends ApiIntegrationTest {

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("5000");
    }

    @Test
    void settlementLowersPendingUpiAndVoidingItRestoresThePending() throws Exception {
        closeShiftWithUpi("600.00");
        assertThat(wallet().get("upiPending").decimalValue()).isEqualByComparingTo("600.00");

        JsonNode settlement = json(perform(post("/api/pumps/{pumpId}/settlements", setup.pumpId()), setup.manager(),
                settlementBody("250.00")).andExpect(status().is2xxSuccessful()));
        assertThat(wallet().get("upiPending").decimalValue()).isEqualByComparingTo("350.00");

        long settlementId = settlement.get("id").asLong();
        perform(post("/api/pumps/{pumpId}/settlements/{id}/void", setup.pumpId(), settlementId), setup.manager(),
                Map.of("reason", "Typo")).andExpect(status().isForbidden());
        perform(post("/api/pumps/{pumpId}/settlements/{id}/void", setup.pumpId(), settlementId), setup.owner(),
                Map.of("reason", "")).andExpect(status().isBadRequest());
        perform(post("/api/pumps/{pumpId}/settlements/{id}/void", setup.pumpId(), settlementId), setup.owner(),
                Map.of("reason", "Typo")).andExpect(status().isOk());

        assertThat(wallet().get("upiPending").decimalValue()).isEqualByComparingTo("600.00");
    }

    @Test
    void identicalSettlementSubmittedTwiceInARowIsRefused() throws Exception {
        closeShiftWithUpi("600.00");
        perform(post("/api/pumps/{pumpId}/settlements", setup.pumpId()), setup.manager(), settlementBody("100.00"))
                .andExpect(status().is2xxSuccessful());

        perform(post("/api/pumps/{pumpId}/settlements", setup.pumpId()), setup.manager(), settlementBody("100.00"))
                .andExpect(status().isBadRequest());

        assertThat(wallet().get("upiPending").decimalValue()).isEqualByComparingTo("500.00");
    }

    @Test
    void dailySummaryAllocatesSettlementsAgainstTheDayTheyWereCollected() throws Exception {
        closeShiftWithUpi("600.00");
        perform(post("/api/pumps/{pumpId}/settlements", setup.pumpId()), setup.manager(), settlementBody("250.00"))
                .andExpect(status().is2xxSuccessful());

        JsonNode summary = json(perform(get("/api/pumps/{pumpId}/settlements/daily-summary", setup.pumpId())
                        .param("from", TestDates.today().minusDays(1).toString())
                        .param("to", TestDates.today().toString()), setup.manager())
                .andExpect(status().isOk()));

        JsonNode today = findByDate(summary.get("content"), TestDates.today().toString());
        assertThat(today.get("upiCollected").decimalValue()).isEqualByComparingTo("600.00");
        assertThat(today.get("upiSettled").decimalValue()).isEqualByComparingTo("250.00");
    }

    @Test
    void settlementWithAnUnknownTypeAFutureDateOrNoVoidReasonIsRejected() throws Exception {
        perform(post("/api/pumps/{pumpId}/settlements", setup.pumpId()), setup.manager(),
                Map.of("paymentType", "CHEQUE", "settlementDate", TestDates.today().toString(), "amountReceived", 10))
                .andExpect(status().isBadRequest());
        perform(post("/api/pumps/{pumpId}/settlements", setup.pumpId()), setup.manager(),
                Map.of("paymentType", "UPI", "settlementDate", TestDates.today().plusDays(2).toString(), "amountReceived", 10))
                .andExpect(status().isBadRequest());

        long settlementId = json(perform(post("/api/pumps/{pumpId}/settlements", setup.pumpId()), setup.manager(),
                settlementBody("40.00")).andExpect(status().is2xxSuccessful())).get("id").asLong();
        perform(post("/api/pumps/{pumpId}/settlements/{id}/void", setup.pumpId(), settlementId), setup.owner(),
                Map.of("reason", " "))
                .andExpect(status().isBadRequest());
    }

    @Test
    void settlementAlertConfigurationIsOwnerOrAdminOnly() throws Exception {
        Map<String, Object> config = Map.of("alertTime", "18:30", "enabled", true);

        perform(put("/api/pumps/{pumpId}/settlement-configs/UPI", setup.pumpId()), setup.manager(), config)
                .andExpect(status().isForbidden());
        perform(put("/api/pumps/{pumpId}/settlement-configs/UPI", setup.pumpId()), setup.owner(), config)
                .andExpect(status().isOk());

        JsonNode configs = json(perform(get("/api/pumps/{pumpId}/settlement-configs", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(configs.toString()).contains("18:30");
    }

    @Test
    void managerExpenseNeedsApprovalWhenNoThresholdIsSetAndOwnerExpenseDoesNot() throws Exception {
        JsonNode managerExpense = json(createExpense(setup.manager(), "1500.00", false).andExpect(status().is2xxSuccessful()));
        JsonNode ownerExpense = json(createExpense(setup.owner(), "1500.00", false).andExpect(status().is2xxSuccessful()));

        assertThat(managerExpense.get("approvalStatus").asText()).isEqualTo("PENDING_APPROVAL");
        assertThat(ownerExpense.get("approvalStatus").asText()).isEqualTo("APPROVED");
    }

    @Test
    void expenseWithinThePumpThresholdIsApprovedStraightAway() throws Exception {
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(),
                Map.of("expenseApprovalThreshold", new BigDecimal("2000.00"))).andExpect(status().isOk());

        JsonNode small = json(createExpense(setup.manager(), "1500.00", false).andExpect(status().is2xxSuccessful()));
        JsonNode large = json(createExpense(setup.manager(), "2500.00", false).andExpect(status().is2xxSuccessful()));

        assertThat(small.get("approvalStatus").asText()).isEqualTo("APPROVED");
        assertThat(large.get("approvalStatus").asText()).isEqualTo("PENDING_APPROVAL");
    }

    @Test
    void operatorCanSubmitAnExpenseOnlyOwnerOrAdminCanApproveAndApprovedExpensesStay() throws Exception {
        long draftId = json(createExpense(setup.operator(), "300.00", true).andExpect(status().is2xxSuccessful()))
                .get("id").asLong();
        JsonNode submitted = json(perform(patch("/api/pumps/{pumpId}/expenses/{id}/submit", setup.pumpId(), draftId),
                setup.operator()).andExpect(status().isOk()));
        assertThat(submitted.get("approvalStatus").asText()).isEqualTo("PENDING_APPROVAL");

        perform(patch("/api/pumps/{pumpId}/expenses/{id}/approve", setup.pumpId(), draftId), setup.manager(),
                Map.of("action", "APPROVED")).andExpect(status().isForbidden());
        JsonNode approved = json(perform(patch("/api/pumps/{pumpId}/expenses/{id}/approve", setup.pumpId(), draftId),
                setup.admin(), Map.of("action", "APPROVED")).andExpect(status().isOk()));
        assertThat(approved.get("approvalStatus").asText()).isEqualTo("APPROVED");

        perform(delete("/api/pumps/{pumpId}/expenses/{id}", setup.pumpId(), draftId), setup.owner())
                .andExpect(status().isBadRequest());
    }

    @Test
    void onlyTheOwnerCanDeleteADraftExpense() throws Exception {
        long draftId = json(createExpense(setup.manager(), "120.00", true).andExpect(status().is2xxSuccessful()))
                .get("id").asLong();

        perform(delete("/api/pumps/{pumpId}/expenses/{id}", setup.pumpId(), draftId), setup.admin())
                .andExpect(status().isForbidden());
        perform(delete("/api/pumps/{pumpId}/expenses/{id}", setup.pumpId(), draftId), setup.owner())
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    void expenseSummaryTotalsEachStatusSeparately() throws Exception {
        createExpense(setup.owner(), "1000.00", false).andExpect(status().is2xxSuccessful());
        createExpense(setup.manager(), "400.00", false).andExpect(status().is2xxSuccessful());

        JsonNode summary = json(perform(get("/api/pumps/{pumpId}/expenses/summary", setup.pumpId())
                        .param("from", TestDates.today().toString()).param("to", TestDates.today().toString()),
                setup.accountant()).andExpect(status().isOk()));

        assertThat(summary.toString()).contains("1000").contains("400");
    }

    @Test
    void cashOutLargerThanTheDrawerBalanceIsRefused() throws Exception {
        perform(post("/api/pumps/{pumpId}/cash-events", setup.pumpId()), setup.manager(),
                cashEvent("OPENING_BALANCE", "500.00")).andExpect(status().is2xxSuccessful());

        perform(post("/api/pumps/{pumpId}/cash-events", setup.pumpId()), setup.manager(),
                cashEvent("CASH_OUT", "600.00")).andExpect(status().isBadRequest());
        perform(post("/api/pumps/{pumpId}/cash-events", setup.pumpId()), setup.manager(),
                cashEvent("CASH_OUT", "200.00")).andExpect(status().is2xxSuccessful());

        JsonNode events = json(perform(get("/api/pumps/{pumpId}/cash-events", setup.pumpId())
                        .param("from", TestDates.today().toString()).param("to", TestDates.today().toString()),
                setup.manager()).andExpect(status().isOk()));
        assertThat(events.toString()).contains("CASH_OUT").contains("OPENING_BALANCE");
        perform(get("/api/pumps/{pumpId}/cash-events", setup.pumpId()), setup.operator())
                .andExpect(status().isForbidden());
    }

    @Test
    void dailyRatePayrollIsGeneratedApprovedAndPaidByTheOwnerOnly() throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("userId", setup.manager().getId());
        request.put("periodFrom", TestDates.today().minusDays(2).toString());
        request.put("periodTo", TestDates.today().toString());
        request.put("deductFromSalaryShiftIds", List.of());

        perform(post("/api/pumps/{pumpId}/payroll/generate", setup.pumpId()), setup.admin(), request)
                .andExpect(status().isForbidden());
        JsonNode draft = json(perform(post("/api/pumps/{pumpId}/payroll/generate", setup.pumpId()), setup.owner(), request)
                .andExpect(status().is2xxSuccessful()));
        assertThat(draft.get("status").asText()).isEqualTo("DRAFT");
        assertThat(draft.get("grossAmount").decimalValue()).isEqualByComparingTo("2400.00");

        long recordId = draft.get("id").asLong();
        perform(patch("/api/pumps/{pumpId}/payroll/{id}/status", setup.pumpId(), recordId), setup.owner(),
                Map.of("status", "APPROVED")).andExpect(status().isOk());
        perform(delete("/api/pumps/{pumpId}/payroll/{id}", setup.pumpId(), recordId), setup.owner())
                .andExpect(status().isBadRequest());
        perform(patch("/api/pumps/{pumpId}/payroll/{id}/status", setup.pumpId(), recordId), setup.owner(),
                Map.of("status", "PAID")).andExpect(status().isOk());

        JsonNode list = json(perform(get("/api/pumps/{pumpId}/payroll", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        assertThat(list.toString()).contains("PAID");
    }

    private void closeShiftWithUpi(String upi) throws Exception {
        long shiftId = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        BigDecimal upiAmount = new BigDecimal(upi);
        Map<String, Object> close = new HashMap<>();
        close.put("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal("1010.000"))));
        close.put("cashCollected", new BigDecimal("1000.00").subtract(upiAmount));
        close.put("upiCollected", upiAmount);
        close.put("cardCollected", BigDecimal.ZERO);
        close.put("fleetCardCollected", BigDecimal.ZERO);
        close.put("creditTotal", BigDecimal.ZERO);
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(), close)
                .andExpect(status().is2xxSuccessful());
    }

    private JsonNode wallet() throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/settlements/wallet", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
    }

    private Map<String, Object> settlementBody(String amount) {
        return Map.of("paymentType", "UPI", "settlementDate", TestDates.today().toString(),
                "amountReceived", new BigDecimal(amount));
    }

    private ResultActions createExpense(User user, String amount, boolean saveDraft) throws Exception {
        return perform(post("/api/pumps/{pumpId}/expenses", setup.pumpId()), user,
                Map.of("category", "MAINTENANCE", "amount", new BigDecimal(amount), "description", "Pump repair",
                        "expenseDate", TestDates.today().toString(), "saveDraft", saveDraft));
    }

    private Map<String, Object> cashEvent(String type, String amount) {
        return Map.of("eventType", type, "amount", new BigDecimal(amount), "description", "Drawer",
                "eventDate", TestDates.today().toString());
    }

    private static JsonNode findByDate(JsonNode days, String date) {
        for (JsonNode day : days) {
            if (date.equals(day.get("date").asText())) {
                return day;
            }
        }
        throw new AssertionError("No summary entry for " + date + " in " + days);
    }
}
