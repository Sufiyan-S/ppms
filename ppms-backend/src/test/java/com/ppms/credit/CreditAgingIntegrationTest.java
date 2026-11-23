package com.ppms.credit;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

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

class CreditAgingIntegrationTest extends ApiIntegrationTest {

    private static final LocalDate TODAY = TestDates.today();

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
    void paymentsCoverTheOldestSalesFirstSoTheBalanceIsSplitByTheAgeOfTheNewestSales() throws Exception {
        long clientId = createClient(null);
        long newest = sellOnCredit(clientId, "400.00");
        long fortyFiveDays = sellOnCredit(clientId, "300.00");
        long seventyFiveDays = sellOnCredit(clientId, "200.00");
        long hundredDays = sellOnCredit(clientId, "100.00");
        backdate(newest, 10);
        backdate(fortyFiveDays, 45);
        backdate(seventyFiveDays, 75);
        backdate(hundredDays, 100);
        recordPayment(clientId, "150.00", TODAY.minusDays(40));

        JsonNode row = rowOf(clientId);

        assertThat(row.get("outstanding").decimalValue()).isEqualByComparingTo("850.00");
        assertThat(row.get("upTo30Days").decimalValue()).isEqualByComparingTo("400.00");
        assertThat(row.get("days31To60").decimalValue()).isEqualByComparingTo("300.00");
        assertThat(row.get("days61To90").decimalValue()).isEqualByComparingTo("150.00");
        assertThat(row.get("over90Days").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(row.get("oldestUnpaidSaleDate").asText()).isEqualTo(TODAY.minusDays(75).toString());
        assertThat(row.get("lastPaymentDate").asText()).isEqualTo(TODAY.minusDays(40).toString());
        assertThat(row.get("daysOverdue").asLong()).isEqualTo(10);
    }

    @Test
    void parentRowCoversItsSubAccountsAndCountsOverdueFromTheOldestSaleWhenNothingWasPaid() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        long childSale = sellOnCredit(childId, "500.00");
        long parentSale = sellOnCredit(parentId, "200.00");
        backdate(childSale, 70);
        backdate(parentSale, 5);

        JsonNode aging = aging();
        JsonNode row = rowOf(aging, parentId);

        assertThat(aging.get("clients")).noneSatisfy(client -> assertThat(client.get("clientId").asLong()).isEqualTo(childId));
        assertThat(row.get("subAccountCount").asInt()).isEqualTo(1);
        assertThat(row.get("outstanding").decimalValue()).isEqualByComparingTo("700.00");
        assertThat(row.get("upTo30Days").decimalValue()).isEqualByComparingTo("200.00");
        assertThat(row.get("days61To90").decimalValue()).isEqualByComparingTo("500.00");
        assertThat(row.get("daysOverdue").asLong()).isEqualTo(40);
        assertThat(row.get("creditStatus").asText()).isEqualTo("OVERDUE");
        assertThat(aging.get("summary").get("overdueAmount").decimalValue()).isEqualByComparingTo("700.00");
        assertThat(aging.get("summary").get("overSixtyAmount").decimalValue()).isEqualByComparingTo("500.00");
        assertThat(aging.get("summary").get("overdueCount").asInt()).isEqualTo(1);
    }

    @Test
    void recentPaymentKeepsTheAccountCurrentAndPendingPaymentsAndLimitsAreShown() throws Exception {
        long clientId = createClient(null);
        backdate(sellOnCredit(clientId, "300.00"), 50);
        recordPayment(clientId, "20.00", TODAY.minusDays(3));
        setCreditLimit(clientId, "100.00");
        var pump = pumpLocationRepository.findById(setup.pumpId()).orElseThrow();
        pump.setExpenseApprovalThreshold(new BigDecimal("50.00"));
        pumpLocationRepository.save(pump);
        recordPayment(clientId, "60.00", TODAY);

        JsonNode aging = aging();
        JsonNode row = rowOf(aging, clientId);

        assertThat(row.get("daysOverdue").asLong()).isZero();
        assertThat(row.get("creditStatus").asText()).isEqualTo("OVER_LIMIT");
        assertThat(row.get("pendingPaymentCount").asInt()).isEqualTo(1);
        assertThat(row.get("pendingPaymentAmount").decimalValue()).isEqualByComparingTo("60.00");
        assertThat(aging.get("summary").get("overLimitCount").asInt()).isEqualTo(1);
        assertThat(aging.get("summary").get("pendingApprovalCount").asInt()).isEqualTo(1);
        assertThat(aging.get("summary").get("totalOutstanding").decimalValue()).isEqualByComparingTo("280.00");
    }

    @Test
    void agingRunsTheSameNumberOfQueriesWhateverTheNumberOfClients() throws Exception {
        sellOnCredit(createClient(null), "100.00");
        long fewClients = statementsRunBy(get("/api/pumps/{pumpId}/credit-ledger/aging", setup.pumpId()), setup.owner());
        for (int i = 0; i < 4; i++) {
            long parentId = createClient(null);
            sellOnCredit(parentId, "100.00");
            sellOnCredit(createClient(parentId), "50.00");
        }
        long manyClients = statementsRunBy(get("/api/pumps/{pumpId}/credit-ledger/aging", setup.pumpId()), setup.owner());

        assertThat(manyClients).isEqualTo(fewClients);
    }

    @Test
    void operatorAndOtherPumpsOwnerCannotReadTheAging() throws Exception {
        PumpSetup otherPump = createPumpWithStock("0");

        perform(get("/api/pumps/{pumpId}/credit-ledger/aging", setup.pumpId()), setup.operator())
                .andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/credit-ledger/aging", setup.pumpId()), otherPump.owner())
                .andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/credit-ledger/aging", setup.pumpId()), setup.accountant())
                .andExpect(status().isOk());
    }

    private JsonNode aging() throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/credit-ledger/aging", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
    }

    private JsonNode rowOf(long clientId) throws Exception {
        return rowOf(aging(), clientId);
    }

    private static JsonNode rowOf(JsonNode aging, long clientId) {
        for (JsonNode row : aging.get("clients")) {
            if (row.get("clientId").asLong() == clientId) {
                return row;
            }
        }
        throw new AssertionError("Client " + clientId + " missing from the aging");
    }

    private long createClient(Long parentClientId) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "Client " + shortId());
        body.put("phone", "9" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L));
        body.put("parentClientId", parentClientId);
        return json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(), body)
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private long sellOnCredit(long clientId, String amount) throws Exception {
        JsonNode shift = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId),
                setup.operator(), Map.of("clientName", "Client", "clientId", clientId,
                        "amount", new BigDecimal(amount), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful()));
        JsonNode entries = shift.get("creditEntries");
        return entries.get(entries.size() - 1).get("id").asLong();
    }

    private void backdate(long entryId, int daysAgo) {
        jdbcTemplate.update("UPDATE shift_credit_entries SET created_at = ?, sale_date = ? WHERE id = ?",
                TestDates.now().minusDays(daysAgo), TODAY.minusDays(daysAgo), entryId);
    }

    private void recordPayment(long clientId, String amount, LocalDate paidAt) throws Exception {
        perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId), setup.manager(),
                Map.of("amount", new BigDecimal(amount), "paymentMode", "CASH", "paidAt", paidAt.toString()))
                .andExpect(status().is2xxSuccessful());
    }

    private void setCreditLimit(long clientId, String limit) throws Exception {
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit", setup.pumpId(), clientId),
                setup.manager(), Map.of("creditLimit", new BigDecimal(limit)))
                .andExpect(status().isOk());
    }
}
