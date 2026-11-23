package com.ppms.approval;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ApprovalQueueIntegrationTest extends ApiIntegrationTest {

    private static final LocalDate TODAY = TestDates.today();

    @Autowired private JdbcTemplate jdbcTemplate;

    private PumpSetup setup;
    private long clientId;

    @BeforeEach
    void createPumpWithThresholdAndAClientWhoOwes() throws Exception {
        setup = createPumpWithStock("5000");
        var pump = pumpLocationRepository.findById(setup.pumpId()).orElseThrow();
        pump.setExpenseApprovalThreshold(new BigDecimal("100.00"));
        pumpLocationRepository.save(pump);

        long shiftId = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        Map<String, Object> client = new HashMap<>();
        client.put("name", "Sharma Transport " + shortId());
        client.put("phone", "9" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L));
        clientId = json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(), client)
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                Map.of("clientName", "Client", "clientId", clientId, "amount", new BigDecimal("1000.00"), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    void queueListsPendingExpensesAndCreditPaymentsWithWhoSubmittedThem() throws Exception {
        long expenseId = recordExpense(setup.manager(), "MAINTENANCE", "500.00");
        long paymentId = recordPayment("300.00");

        JsonNode items = queue(setup.owner());

        assertThat(items).hasSize(2);
        JsonNode expense = itemOf(items, "EXPENSE", expenseId);
        assertThat(expense.get("amount").decimalValue()).isEqualByComparingTo("500.00");
        assertThat(expense.get("category").asText()).isEqualTo("MAINTENANCE");
        assertThat(expense.get("submittedByName").asText()).isEqualTo(setup.manager().getFullName());
        assertThat(expense.get("note").asText()).isEqualTo("Compressor repair");
        assertThat(expense.get("blockedReason").isNull()).isTrue();
        JsonNode payment = itemOf(items, "CREDIT_PAYMENT", paymentId);
        assertThat(payment.get("clientId").asLong()).isEqualTo(clientId);
        assertThat(payment.get("clientName").asText()).startsWith("Sharma Transport");
        assertThat(payment.get("submittedByName").asText()).isEqualTo(setup.manager().getFullName());
    }

    @Test
    void bulkApprovalDecidesEachItemOnItsOwnAndAuditsTheOnesThatSucceed() throws Exception {
        long pendingExpense = recordExpense(setup.manager(), "MAINTENANCE", "500.00");
        long approvedExpense = recordExpense(setup.owner(), "UTILITIES", "900.00");
        long paymentId = recordPayment("300.00");

        JsonNode result = json(decide(setup.owner(), Map.of(
                "action", "APPROVED",
                "items", List.of(
                        Map.of("kind", "EXPENSE", "id", pendingExpense),
                        Map.of("kind", "EXPENSE", "id", approvedExpense),
                        Map.of("kind", "CREDIT_PAYMENT", "id", paymentId),
                        Map.of("kind", "EXPENSE", "id", 999_999_999L))))
                .andExpect(status().isOk()));

        assertThat(result.get("succeeded").asInt()).isEqualTo(2);
        assertThat(result.get("failed").asInt()).isEqualTo(2);
        assertThat(resultOf(result, "EXPENSE", approvedExpense).get("message").asText()).contains("not pending approval");
        assertThat(resultOf(result, "EXPENSE", 999_999_999L).get("message").asText()).isEqualTo("Expense not found");
        assertThat(expenseStatus(pendingExpense)).isEqualTo("APPROVED");
        assertThat(paymentStatus(paymentId)).isEqualTo("APPROVED");
        assertThat(auditDescriptions("PumpExpense", pendingExpense, "EXPENSE_APPROVED")).hasSize(1);
        assertThat(auditDescriptions("CreditPayment", paymentId, "CREDIT_PAYMENT_RECEIVED"))
                .anySatisfy(description -> assertThat(description).startsWith("Payment APPROVED"));
        assertThat(queue(setup.owner())).isEmpty();
    }

    @Test
    void approvalStillAppliesThePaymentRules() throws Exception {
        long paymentId = recordPayment("300.00");
        jdbcTemplate.update("UPDATE shift_credit_entries SET void_status = 'VOIDED' WHERE client_id = ?", clientId);

        JsonNode result = json(decide(setup.owner(), Map.of("action", "APPROVED",
                "items", List.of(Map.of("kind", "CREDIT_PAYMENT", "id", paymentId))))
                .andExpect(status().isOk()));

        assertThat(result.get("failed").asInt()).isEqualTo(1);
        assertThat(resultOf(result, "CREDIT_PAYMENT", paymentId).get("message").asText()).contains("would exceed");
        assertThat(paymentStatus(paymentId)).isEqualTo("PENDING_APPROVAL");
    }

    @Test
    void rejectingNeedsAReasonWhichIsStoredAndAudited() throws Exception {
        long expenseId = recordExpense(setup.manager(), "MAINTENANCE", "500.00");
        long paymentId = recordPayment("300.00");
        List<Map<String, Object>> items = List.of(
                Map.of("kind", "EXPENSE", "id", expenseId),
                Map.of("kind", "CREDIT_PAYMENT", "id", paymentId));

        decide(setup.admin(), Map.of("action", "REJECTED", "items", items)).andExpect(status().isBadRequest());
        decide(setup.admin(), Map.of("action", "REJECTED", "reason", "  ", "items", items)).andExpect(status().isBadRequest());
        JsonNode result = json(decide(setup.admin(), Map.of("action", "REJECTED", "reason", "No bill attached", "items", items))
                .andExpect(status().isOk()));

        assertThat(result.get("succeeded").asInt()).isEqualTo(2);
        assertThat(expenseStatus(expenseId)).isEqualTo("REJECTED");
        assertThat(jdbcTemplate.queryForObject("SELECT approval_notes FROM pump_expenses WHERE id = ?", String.class, expenseId))
                .isEqualTo("No bill attached");
        assertThat(paymentStatus(paymentId)).isEqualTo("REJECTED");
        assertThat(auditDescriptions("PumpExpense", expenseId, "EXPENSE_REJECTED"))
                .singleElement().asString().contains("No bill attached");
        assertThat(auditDescriptions("CreditPayment", paymentId, "CREDIT_PAYMENT_RECEIVED"))
                .anySatisfy(description -> assertThat(description).contains("REJECTED").contains("No bill attached"));
    }

    @Test
    void singleExpenseApprovalIsAuditedToo() throws Exception {
        long expenseId = recordExpense(setup.manager(), "MAINTENANCE", "500.00");

        perform(patch("/api/pumps/{pumpId}/expenses/{expenseId}/approve", setup.pumpId(), expenseId), setup.owner(),
                Map.of("action", "APPROVED"))
                .andExpect(status().isOk());

        assertThat(auditDescriptions("PumpExpense", expenseId, "EXPENSE_APPROVED")).hasSize(1);
    }

    @Test
    void anotherPumpsItemsCannotBeDecided() throws Exception {
        PumpSetup otherPump = createPumpWithStock("0");
        long otherExpense = json(perform(post("/api/pumps/{pumpId}/expenses", otherPump.pumpId()), otherPump.manager(),
                Map.of("category", "MAINTENANCE", "amount", new BigDecimal("500.00"),
                        "description", "Compressor repair", "expenseDate", TODAY.toString()))
                .andExpect(status().isCreated())).get("id").asLong();

        JsonNode result = json(decide(setup.owner(), Map.of("action", "APPROVED",
                "items", List.of(Map.of("kind", "EXPENSE", "id", otherExpense))))
                .andExpect(status().isOk()));

        assertThat(result.get("failed").asInt()).isEqualTo(1);
        assertThat(expenseStatus(otherExpense)).isEqualTo("PENDING_APPROVAL");
    }

    @Test
    void onlyOwnerAndAdminOfThePumpCanUseTheQueue() throws Exception {
        PumpSetup otherPump = createPumpWithStock("0");
        Map<String, Object> body = Map.of("action", "APPROVED", "items", List.of(Map.of("kind", "EXPENSE", "id", 1L)));

        for (User user : List.of(setup.manager(), setup.accountant(), setup.operator(), otherPump.owner())) {
            perform(get("/api/pumps/{pumpId}/approvals", setup.pumpId()), user).andExpect(status().isForbidden());
            decide(user, body).andExpect(status().isForbidden());
        }
        perform(get("/api/pumps/{pumpId}/approvals", setup.pumpId()), setup.admin()).andExpect(status().isOk());
    }

    private JsonNode queue(User user) throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/approvals", setup.pumpId()), user).andExpect(status().isOk()));
    }

    private ResultActions decide(User user, Map<String, Object> body) throws Exception {
        return perform(post("/api/pumps/{pumpId}/approvals/decisions", setup.pumpId()), user, body);
    }

    private long recordExpense(User user, String category, String amount) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/expenses", setup.pumpId()), user,
                Map.of("category", category, "amount", new BigDecimal(amount),
                        "description", "Compressor repair", "expenseDate", TODAY.toString()))
                .andExpect(status().isCreated())).get("id").asLong();
    }

    private long recordPayment(String amount) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId),
                setup.manager(), Map.of("amount", new BigDecimal(amount), "paymentMode", "CASH", "paidAt", TODAY.toString()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private String expenseStatus(long expenseId) {
        return jdbcTemplate.queryForObject("SELECT approval_status::text FROM pump_expenses WHERE id = ?", String.class, expenseId);
    }

    private String paymentStatus(long paymentId) {
        return jdbcTemplate.queryForObject("SELECT payment_approval_status::text FROM credit_payments WHERE id = ?",
                String.class, paymentId);
    }

    private List<String> auditDescriptions(String entityType, long entityId, String action) {
        return jdbcTemplate.queryForList("SELECT description FROM audit_logs WHERE entity_type = ? AND entity_id = ? "
                + "AND action::text = ?", String.class, entityType, String.valueOf(entityId), action);
    }

    private static JsonNode itemOf(JsonNode items, String kind, long id) {
        for (JsonNode item : items) {
            if (item.get("kind").asText().equals(kind) && item.get("id").asLong() == id) {
                return item;
            }
        }
        throw new AssertionError(kind + " " + id + " missing from " + items);
    }

    private static JsonNode resultOf(JsonNode result, String kind, long id) {
        return itemOf(result.get("results"), kind, id);
    }
}
