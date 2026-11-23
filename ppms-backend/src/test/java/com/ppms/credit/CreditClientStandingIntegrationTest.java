package com.ppms.credit;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CreditClientStandingIntegrationTest extends ApiIntegrationTest {

    @Autowired private CreditExtensionRepository extensionRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private PumpSetup setup;
    private long shiftId;

    @BeforeEach
    void createPumpWithOpenShift() throws Exception {
        setup = createPumpWithStock("5000");
        JsonNode opened = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful()));
        shiftId = opened.get("id").asLong();
    }

    @Test
    void clientWithoutALimitIsOkWithNoAvailableAmount() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "900.00");

        JsonNode standing = standingOf(clientId, setup.manager());

        assertThat(standing.get("creditStatus").asText()).isEqualTo("OK");
        assertThat(standing.get("availableCredit").isNull()).isTrue();
    }

    @Test
    void clientUnderItsLimitIsOkWithTheRemainingAmount() throws Exception {
        long clientId = createClient(null);
        setCreditLimit(clientId, "1000.00");
        sellOnCredit(clientId, "400.00");

        JsonNode standing = standingOf(clientId, setup.manager());

        assertThat(standing.get("creditStatus").asText()).isEqualTo("OK");
        assertThat(standing.get("availableCredit").decimalValue()).isEqualByComparingTo("600.00");
    }

    @Test
    void clientThatReachedItsLimitIsOverLimitWithNothingAvailable() throws Exception {
        long clientId = createClient(null);
        setCreditLimit(clientId, "500.00");
        sellOnCredit(clientId, "500.00");

        JsonNode standing = standingOf(clientId, setup.manager());

        assertThat(standing.get("creditStatus").asText()).isEqualTo("OVER_LIMIT");
        assertThat(standing.get("availableCredit").decimalValue()).isEqualByComparingTo("0");
    }

    @Test
    void amountExtensionAddsToWhatIsAvailable() throws Exception {
        long clientId = createClient(null);
        setCreditLimit(clientId, "500.00");
        sellOnCredit(clientId, "500.00");
        grantExtension(clientId, CreditExtensionType.AMOUNT_EXTENSION, new BigDecimal("1000.00"));

        JsonNode standing = standingOf(clientId, setup.manager());

        assertThat(standing.get("creditStatus").asText()).isEqualTo("OK");
        assertThat(standing.get("availableCredit").decimalValue()).isEqualByComparingTo("1000.00");
    }

    @Test
    void subAccountSharesItsParentsLimitAndItsSalesCountAgainstIt() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        setCreditLimit(parentId, "1000.00");
        sellOnCredit(childId, "700.00");
        sellOnCredit(parentId, "100.00");

        assertThat(standingOf(parentId, setup.manager()).get("availableCredit").decimalValue()).isEqualByComparingTo("200.00");
        assertThat(standingOf(childId, setup.manager()).get("availableCredit").decimalValue()).isEqualByComparingTo("200.00");

        sellOnCredit(childId, "200.00");

        assertThat(standingOf(parentId, setup.manager()).get("creditStatus").asText()).isEqualTo("OVER_LIMIT");
        assertThat(standingOf(childId, setup.manager()).get("creditStatus").asText()).isEqualTo("OVER_LIMIT");
    }

    @Test
    void disabledClientAndSubAccountOfADisabledParentAreInactive() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        long otherId = createClient(null);
        setActive(parentId, false);
        setActive(otherId, false);

        assertThat(standingOf(parentId, setup.manager()).get("creditStatus").asText()).isEqualTo("INACTIVE");
        assertThat(standingOf(childId, setup.manager()).get("creditStatus").asText()).isEqualTo("INACTIVE");
        assertThat(standingOf(otherId, setup.manager()).get("creditStatus").asText()).isEqualTo("INACTIVE");
    }

    @Test
    void groupWithAnOldUnpaidSaleOnASubAccountIsOverdue() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        backdateCreditEntry(sellOnCredit(childId, "300.00"), 40);

        assertThat(standingOf(parentId, setup.manager()).get("creditStatus").asText()).isEqualTo("OVERDUE");
        assertThat(standingOf(childId, setup.manager()).get("creditStatus").asText()).isEqualTo("OVERDUE");
    }

    @Test
    void recentPaymentOnAnyAccountOfTheGroupKeepsItCurrent() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        long oldEntryId = sellOnCredit(parentId, "500.00");
        sellOnCredit(childId, "200.00");
        backdateCreditEntry(oldEntryId, 40);
        recordPayment(childId, "50.00");

        assertThat(standingOf(parentId, setup.manager()).get("creditStatus").asText()).isEqualTo("OK");
    }

    @Test
    void billingCycleExtensionLiftsTheOverdueBlock() throws Exception {
        long clientId = createClient(null);
        backdateCreditEntry(sellOnCredit(clientId, "300.00"), 40);
        assertThat(standingOf(clientId, setup.manager()).get("creditStatus").asText()).isEqualTo("OVERDUE");

        grantExtension(clientId, CreditExtensionType.BILLING_CYCLE_EXTENSION, null);

        assertThat(standingOf(clientId, setup.manager()).get("creditStatus").asText()).isEqualTo("OK");
    }

    @Test
    void operatorReadsOnlyTheStatusAndAvailableAmount() throws Exception {
        long clientId = createClient(null);
        setCreditLimit(clientId, "1000.00");

        JsonNode standing = standingOf(clientId, setup.operator());

        assertThat(standing.get("availableCredit").decimalValue()).isEqualByComparingTo("1000.00");
        assertThat(standing.fieldNames()).toIterable().containsExactlyInAnyOrder("clientId", "creditStatus", "availableCredit");
    }

    @Test
    void operatorReadsOnlyWhatTheClientPickerNeedsFromTheClientList() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        setCreditLimit(parentId, "1000.00");
        sellOnCredit(childId, "250.00");

        JsonNode operatorView = clientOf(childId, setup.operator());
        JsonNode managerView = clientOf(childId, setup.manager());

        assertThat(operatorView.fieldNames()).toIterable().containsExactlyInAnyOrder(
                "id", "pumpId", "name", "phone", "parentClientId", "parentClientName", "isParent", "isActive");
        assertThat(operatorView.get("parentClientId").asLong()).isEqualTo(parentId);
        assertThat(operatorView.get("isActive").asBoolean()).isTrue();
        assertThat(clientOf(parentId, setup.operator()).get("isParent").asBoolean()).isTrue();
        assertThat(managerView.get("outstandingBalance").decimalValue()).isEqualByComparingTo("250.00");
        assertThat(managerView.has("creditLimit")).isTrue();
        assertThat(managerView.has("gstin")).isTrue();
        assertThat(clientOf(childId, setup.accountant()).has("outstandingBalance")).isTrue();
    }

    @Test
    void ownerOfAnotherPumpCannotReadTheStanding() throws Exception {
        PumpSetup otherPump = createPumpWithStock("0");

        perform(get("/api/pumps/{pumpId}/credit-clients/credit-standing", setup.pumpId()), otherPump.owner())
                .andExpect(status().isForbidden());
    }

    private JsonNode standingOf(long clientId, User reader) throws Exception {
        JsonNode standings = json(perform(get("/api/pumps/{pumpId}/credit-clients/credit-standing", setup.pumpId()), reader)
                .andExpect(status().isOk()));
        for (JsonNode standing : standings) {
            if (standing.get("clientId").asLong() == clientId) {
                return standing;
            }
        }
        throw new AssertionError("Client " + clientId + " missing from the credit standing");
    }

    private JsonNode clientOf(long clientId, User reader) throws Exception {
        JsonNode clients = json(perform(get("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), reader)
                .andExpect(status().isOk()));
        for (JsonNode client : clients) {
            if (client.get("id").asLong() == clientId) {
                return client;
            }
        }
        throw new AssertionError("Client " + clientId + " missing from the client list");
    }

    private long createClient(Long parentClientId) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "Client " + shortId());
        body.put("phone", "9" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L));
        body.put("parentClientId", parentClientId);
        return json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(), body)
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private void setCreditLimit(long clientId, String limit) throws Exception {
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit", setup.pumpId(), clientId),
                setup.manager(), Map.of("creditLimit", new BigDecimal(limit)))
                .andExpect(status().isOk());
    }

    private void setActive(long clientId, boolean active) throws Exception {
        perform(patch("/api/pumps/{pumpId}/credit-clients/{clientId}/status", setup.pumpId(), clientId),
                setup.manager(), Map.of("isActive", active))
                .andExpect(status().isOk());
    }

    private long sellOnCredit(long clientId, String amount) throws Exception {
        JsonNode shift = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId),
                setup.operator(), Map.of("clientName", "Client", "clientId", clientId,
                        "amount", new BigDecimal(amount), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful()));
        JsonNode entries = shift.get("creditEntries");
        return entries.get(entries.size() - 1).get("id").asLong();
    }

    private void backdateCreditEntry(long entryId, int daysAgo) {
        jdbcTemplate.update("UPDATE shift_credit_entries SET created_at = ?, sale_date = ? WHERE id = ?",
                TestDates.now().minusDays(daysAgo), TestDates.today().minusDays(daysAgo), entryId);
    }

    private void recordPayment(long clientId, String amount) throws Exception {
        perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId), setup.manager(),
                Map.of("amount", new BigDecimal(amount), "paymentMode", "CASH", "paidAt", TestDates.today().toString()))
                .andExpect(status().is2xxSuccessful());
    }

    private void grantExtension(long clientId, CreditExtensionType type, BigDecimal amount) {
        extensionRepository.save(CreditExtension.builder()
                .pumpId(setup.pumpId())
                .clientId(clientId)
                .extensionType(type)
                .extensionAmount(amount)
                .expiryDate(TestDates.today().plusDays(7))
                .grantedByUserId(setup.owner().getId())
                .reason("Festival season")
                .build());
    }
}
