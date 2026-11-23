package com.ppms.credit;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditLogRepository;
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

/**
 * Interest already charged is recalculated when a payment or a voided sale lands inside the charged period.
 * Rate 3%/month is 0.1% a day, so ₹10,000 owed for a day costs ₹10.00.
 */
class CreditInterestRecalculationIntegrationTest extends ApiIntegrationTest {

    private static final int SALE_DAYS_AGO = 40;
    private static final int PAYMENT_DAYS_AGO = 20;

    @Autowired private CreditInterestChargeRepository interestChargeRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private PumpSetup setup;
    private long shiftId;

    @BeforeEach
    void createPumpWithOpenShift() throws Exception {
        setup = createPumpWithStock("5000");
        shiftId = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    @Test
    void backdatedPaymentInsideAChargedPeriodLowersTheInterestToWhatItWouldHaveBeen() throws Exception {
        long clientId = createClientWithInterest(null);
        backdate(sellOnCredit(clientId, "10000.00"), SALE_DAYS_AGO);
        applyInterest(clientId);
        // 40 days (sale day + 1 grace day to today) x ₹10,000 x 0.1%
        assertThat(liveInterestOf(clientId)).isEqualByComparingTo("400.00");

        recordPayment(clientId, "4000.00", TestDates.today().minusDays(PAYMENT_DAYS_AGO));

        // 19 days on ₹10,000 (₹190.00) + 21 days on ₹6,000 (₹126.00)
        assertThat(liveInterestOf(clientId)).isEqualByComparingTo("316.00");
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("6316.00");
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(clientId))
                .filteredOn(charge -> charge.getVoidedAt() != null)
                .singleElement()
                .satisfies(waived -> {
                    assertThat(waived.getAmount()).isEqualByComparingTo("400.00");
                    assertThat(waived.getVoidReason())
                            .isEqualTo("Recalculated after payment dated " + TestDates.today().minusDays(PAYMENT_DAYS_AGO));
                });
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.INTEREST_RECALCULATED)
                .singleElement()
                .satisfies(log -> assertThat(log.getDescription()).contains("₹400.00 waived").contains("₹316.00 charged again"));
    }

    @Test
    void lateApprovalOfAPaymentDatedInsideAChargedPeriodRecalculatesTheInterest() throws Exception {
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(),
                Map.of("expenseApprovalThreshold", new BigDecimal("100.00"))).andExpect(status().isOk());
        long clientId = createClientWithInterest(null);
        backdate(sellOnCredit(clientId, "10000.00"), SALE_DAYS_AGO);
        applyInterest(clientId);

        long paymentId = recordPayment(clientId, "4000.00", TestDates.today().minusDays(PAYMENT_DAYS_AGO))
                .get("id").asLong();
        assertThat(liveInterestOf(clientId)).isEqualByComparingTo("400.00");

        perform(patch("/api/pumps/{pumpId}/credit-ledger/payments/{paymentId}/approve", setup.pumpId(), paymentId),
                setup.owner(), Map.of("status", "APPROVED"))
                .andExpect(status().isOk());

        assertThat(liveInterestOf(clientId)).isEqualByComparingTo("316.00");
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("6316.00");
    }

    @Test
    void voidingACreditSaleInsideAChargedPeriodTakesItsInterestOff() throws Exception {
        long clientId = createClientWithInterest(null);
        long oldSaleId = sellOnCredit(clientId, "10000.00");
        long todaysSaleId = sellOnCredit(clientId, "5000.00");
        backdate(oldSaleId, SALE_DAYS_AGO);
        applyInterest(clientId);
        // ₹400.00 on the old sale + 1 day on ₹15,000 instead of ₹10,000 (₹5.00)
        assertThat(liveInterestOf(clientId)).isEqualByComparingTo("405.00");

        perform(patch("/api/pumps/{pumpId}/shifts/{shiftId}/credit-entries/{entryId}/void", setup.pumpId(), shiftId, todaysSaleId),
                setup.manager(), Map.of("voidReason", "Entered twice"))
                .andExpect(status().isOk());

        assertThat(liveInterestOf(clientId)).isEqualByComparingTo("400.00");
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("10400.00");
    }

    @Test
    void paymentOnASubAccountRecalculatesTheGroupInterestChargedOnTheParent() throws Exception {
        long parentId = createClientWithInterest(null);
        long childId = createClient(parentId);
        backdate(sellOnCredit(childId, "10000.00"), SALE_DAYS_AGO);
        applyInterest(parentId);
        assertThat(liveInterestOf(parentId)).isEqualByComparingTo("400.00");

        recordPayment(childId, "4000.00", TestDates.today().minusDays(PAYMENT_DAYS_AGO));

        assertThat(liveInterestOf(parentId)).isEqualByComparingTo("316.00");
        assertThat(liveInterestOf(childId)).isEqualByComparingTo("0");
        assertThat(outstandingOf(parentId)).isEqualByComparingTo("6316.00");
        assertThat(outstandingOf(childId)).isEqualByComparingTo("6000.00");
    }

    @Test
    void paymentDatedAfterTheLastChargedPeriodLeavesTheChargesAlone() throws Exception {
        long clientId = createClientWithInterest(null);
        long saleId = sellOnCredit(clientId, "10000.00");
        backdate(saleId, SALE_DAYS_AGO);
        applyInterest(clientId);
        jdbcTemplate.update("UPDATE credit_interest_charges SET period_to = ?, days_applied = 30 WHERE client_id = ?",
                TestDates.today().minusDays(10), clientId);
        BigDecimal charged = liveInterestOf(clientId);

        recordPayment(clientId, "1000.00", TestDates.today().minusDays(5));

        assertThat(liveInterestOf(clientId)).isEqualByComparingTo(charged);
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(clientId))
                .allSatisfy(charge -> assertThat(charge.getVoidedAt()).isNull());
    }

    private long createClientWithInterest(Long parentClientId) throws Exception {
        long clientId = createClient(parentClientId);
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/interest-settings", setup.pumpId(), clientId),
                setup.owner(), Map.of("monthlyInterestRate", new BigDecimal("3.00"), "interestGraceDays", 1))
                .andExpect(status().isOk());
        return clientId;
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
                TestDates.now().minusDays(daysAgo), TestDates.today().minusDays(daysAgo), entryId);
    }

    private void applyInterest(long clientId) throws Exception {
        perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/interest/apply", setup.pumpId(), clientId), setup.owner())
                .andExpect(status().is2xxSuccessful());
    }

    private JsonNode recordPayment(long clientId, String amount, LocalDate paidAt) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId),
                setup.manager(), Map.of("amount", new BigDecimal(amount), "paymentMode", "CASH", "paidAt", paidAt.toString()))
                .andExpect(status().is2xxSuccessful()));
    }

    private BigDecimal liveInterestOf(long clientId) {
        return interestChargeRepository.sumAmountByClientId(clientId);
    }

    private BigDecimal outstandingOf(long clientId) throws Exception {
        JsonNode clients = json(perform(get("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        for (JsonNode client : clients) {
            if (client.get("id").asLong() == clientId) {
                return client.get("outstandingBalance").decimalValue();
            }
        }
        throw new AssertionError("Client " + clientId + " missing from the client list");
    }
}
