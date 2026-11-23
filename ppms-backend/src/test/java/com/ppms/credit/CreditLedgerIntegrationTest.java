package com.ppms.credit;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditLogRepository;
import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.scheduler.CreditExtensionExpiryJob;
import com.ppms.support.ApiIntegrationTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CreditLedgerIntegrationTest extends ApiIntegrationTest {

    @Autowired private CreditClientRepository creditClientRepository;
    @Autowired private CreditExtensionRepository extensionRepository;
    @Autowired private CreditExtensionExpiryJob extensionExpiryJob;
    @Autowired private CreditInterestChargeRepository interestChargeRepository;
    @Autowired private AuditLogRepository auditLogRepository;
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
    void paymentByAManagerWithNoThresholdIsApprovedAndLowersTheBalance() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "1000.00");

        JsonNode payment = json(recordPayment(clientId, "400.00").andExpect(status().is2xxSuccessful()));

        assertThat(payment.get("paymentApprovalStatus").asText()).isEqualTo("APPROVED");
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("600.00");
    }

    @Test
    void paymentLargerThanWhatIsOwedIsRefused() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "300.00");

        recordPayment(clientId, "300.01").andExpect(status().isBadRequest());

        assertThat(outstandingOf(clientId)).isEqualByComparingTo("300.00");
    }

    @Test
    void paymentAboveTheThresholdWaitsForTheOwnerAndCountsOnlyOnceApproved() throws Exception {
        setExpenseApprovalThreshold("100.00");
        long clientId = createClient(null);
        sellOnCredit(clientId, "1000.00");

        JsonNode payment = json(recordPayment(clientId, "500.00").andExpect(status().is2xxSuccessful()));
        long paymentId = payment.get("id").asLong();
        assertThat(payment.get("paymentApprovalStatus").asText()).isEqualTo("PENDING_APPROVAL");
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("1000.00");

        JsonNode pending = json(perform(get("/api/pumps/{pumpId}/credit-ledger/payments/pending", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        assertThat(pending).extracting(node -> node.get("id").asLong()).contains(paymentId);

        perform(patch("/api/pumps/{pumpId}/credit-ledger/payments/{paymentId}/approve", setup.pumpId(), paymentId),
                setup.manager(), Map.of("status", "APPROVED"))
                .andExpect(status().isForbidden());
        perform(patch("/api/pumps/{pumpId}/credit-ledger/payments/{paymentId}/approve", setup.pumpId(), paymentId),
                setup.owner(), Map.of("status", "APPROVED"))
                .andExpect(status().isOk());

        assertThat(outstandingOf(clientId)).isEqualByComparingTo("500.00");
    }

    @Test
    void rejectedPaymentLeavesTheBalanceUnchanged() throws Exception {
        setExpenseApprovalThreshold("100.00");
        long clientId = createClient(null);
        sellOnCredit(clientId, "1000.00");
        long paymentId = json(recordPayment(clientId, "500.00")).get("id").asLong();

        perform(patch("/api/pumps/{pumpId}/credit-ledger/payments/{paymentId}/approve", setup.pumpId(), paymentId),
                setup.owner(), Map.of("status", "REJECTED"))
                .andExpect(status().isOk());

        assertThat(outstandingOf(clientId)).isEqualByComparingTo("1000.00");
        JsonNode transactions = json(perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions", setup.pumpId(), clientId),
                setup.owner()).andExpect(status().isOk()));
        assertThat(transactions.get("content")).anySatisfy(row -> {
            assertThat(row.get("type").asText()).isEqualTo("PAYMENT");
            assertThat(row.get("countedInBalance").asBoolean()).isFalse();
        });
    }

    @Test
    void rejectingASinglePaymentKeepsTheReasonInTheAudit() throws Exception {
        setExpenseApprovalThreshold("100.00");
        long clientId = createClient(null);
        sellOnCredit(clientId, "1000.00");
        long paymentId = json(recordPayment(clientId, "500.00")).get("id").asLong();

        perform(patch("/api/pumps/{pumpId}/credit-ledger/payments/{paymentId}/approve", setup.pumpId(), paymentId),
                setup.owner(), Map.of("status", "REJECTED", "reason", "Cheque bounced"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentApprovalStatus").value("REJECTED"));

        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getEntityId().equals(String.valueOf(paymentId)))
                .anySatisfy(log -> assertThat(log.getDescription()).contains("REJECTED").contains("reason=Cheque bounced"));
    }

    @Test
    void creditSaleBeyondTheClientsLimitIsRefused() throws Exception {
        long clientId = createClient(null);
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit", setup.pumpId(), clientId),
                setup.manager(), Map.of("creditLimit", new BigDecimal("500.00")))
                .andExpect(status().isOk());
        sellOnCredit(clientId, "400.00");

        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                creditEntry(clientId, "150.00"))
                .andExpect(status().isBadRequest());

        assertThat(outstandingOf(clientId)).isEqualByComparingTo("400.00");
    }

    @Test
    void creditForASubAccountOfADisabledParentIsRefused() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        perform(patch("/api/pumps/{pumpId}/credit-clients/{clientId}/status", setup.pumpId(), parentId),
                setup.manager(), Map.of("isActive", false))
                .andExpect(status().isOk());

        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                creditEntry(childId, "100.00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("disabled")))
                .andExpect(jsonPath("$.code").value("CREDIT_PARENT_ACCOUNT_DISABLED"));

        assertThat(outstandingOf(childId)).isEqualByComparingTo("0");
    }

    @Test
    void overdueBillingCycleBlocksAGroupWhoseOldSalesAreOnlyOnASubAccount() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        long oldEntryId = sellOnCredit(childId, "300.00");
        backdateCreditEntry(oldEntryId, 40);

        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                creditEntry(parentId, "100.00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("billing cycle overdue")))
                .andExpect(jsonPath("$.code").value("CREDIT_BILLING_CYCLE_OVERDUE"));
        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                creditEntry(childId, "100.00"))
                .andExpect(status().isBadRequest());

        assertThat(outstandingOf(parentId)).isEqualByComparingTo("300.00");
    }

    @Test
    void recentPaymentOnASubAccountKeepsTheWholeGroupOutOfTheOverdueBlock() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        long oldEntryId = sellOnCredit(parentId, "500.00");
        sellOnCredit(childId, "200.00");
        backdateCreditEntry(oldEntryId, 40);
        recordPayment(childId, "150.00").andExpect(status().is2xxSuccessful());

        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                creditEntry(parentId, "100.00"))
                .andExpect(status().is2xxSuccessful());

        assertThat(outstandingOf(parentId)).isEqualByComparingTo("650.00");
    }

    @Test
    void onlyOwnerOrAdminCanChangeInterestSettingsAndTheChangeIsAudited() throws Exception {
        long clientId = createClient(null);
        Map<String, Object> settings = Map.of("monthlyInterestRate", new BigDecimal("2.50"), "interestGraceDays", 5);

        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/interest-settings", setup.pumpId(), clientId),
                setup.manager(), settings)
                .andExpect(status().isForbidden());
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/interest-settings", setup.pumpId(), clientId),
                setup.owner(), settings)
                .andExpect(status().isOk());

        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.INTEREST_SETTINGS_CHANGED)
                .singleElement()
                .satisfies(log -> assertThat(log.getDescription()).contains("0.00% → 2.50%").contains("1 → 5"));
    }

    @Test
    void onlyOwnerOrAdminCanWaiveInterestAndTheWaiverNeedsAReasonAndIsAudited() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "1000.00");
        CreditInterestCharge charge = interestChargeRepository.save(CreditInterestCharge.builder()
                .pumpId(setup.pumpId())
                .clientId(clientId)
                .amount(new BigDecimal("40.00"))
                .outstandingBalance(new BigDecimal("1000.00"))
                .rateApplied(new BigDecimal("2.00"))
                .daysApplied(30)
                .periodFrom(TestDates.today().minusDays(30))
                .periodTo(TestDates.today().minusDays(1))
                .source("MANUAL")
                .build());
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("1040.00");

        perform(patch("/api/pumps/{pumpId}/credit-ledger/{clientId}/interest/{chargeId}/waive", setup.pumpId(), clientId, charge.getId()),
                setup.manager(), Map.of("reason", "Goodwill"))
                .andExpect(status().isForbidden());
        perform(patch("/api/pumps/{pumpId}/credit-ledger/{clientId}/interest/{chargeId}/waive", setup.pumpId(), clientId, charge.getId()),
                setup.owner(), Map.of("reason", " "))
                .andExpect(status().isBadRequest());
        perform(delete("/api/pumps/{pumpId}/credit-ledger/{clientId}/interest/{chargeId}", setup.pumpId(), clientId, charge.getId()),
                setup.owner())
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(404, 405));
        assertThat(outstandingOf(clientId)).isEqualByComparingTo("1040.00");

        perform(patch("/api/pumps/{pumpId}/credit-ledger/{clientId}/interest/{chargeId}/waive", setup.pumpId(), clientId, charge.getId()),
                setup.owner(), Map.of("reason", "Goodwill"))
                .andExpect(status().isNoContent());

        assertThat(outstandingOf(clientId)).isEqualByComparingTo("1000.00");
        assertThat(interestChargeRepository.findById(charge.getId()).orElseThrow().getVoidReason()).isEqualTo("Goodwill");
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.INTEREST_CHARGE_WAIVED)
                .singleElement()
                .satisfies(log -> assertThat(log.getDescription()).contains("40.00").contains("Goodwill"));
        perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/statement", setup.pumpId(), clientId), setup.owner())
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("WAIVED")));
    }

    @Test
    void parentBalanceIncludesItsSubAccounts() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        sellOnCredit(parentId, "100.00");
        sellOnCredit(childId, "250.00");

        assertThat(outstandingOf(parentId)).isEqualByComparingTo("350.00");
        assertThat(outstandingOf(childId)).isEqualByComparingTo("250.00");
    }

    @Test
    void parentStatementListsSubAccountRowsByNameWithTheGroupOutstanding() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        String childName = creditClientRepository.findById(childId).orElseThrow().getName();
        sellOnCredit(parentId, "100.00");
        sellOnCredit(childId, "250.00");

        String parentStatement = statementOf(parentId);
        String childStatement = statementOf(childId);

        assertThat(parentStatement)
                .contains("<th>Account</th>")
                .contains("<td>" + childName + "</td>")
                .contains("250.00")
                .contains("Sub-accounts:</strong> " + childName)
                .contains("Group Outstanding Balance (incl. sub-accounts): ₹350.00");
        assertThat(childStatement)
                .doesNotContain("<th>Account</th>")
                .doesNotContain("Sub-accounts:")
                .contains("Outstanding Balance: ₹250.00");
    }

    @Test
    void standaloneStatementShowsOnlyItsOwnRowsAndBalance() throws Exception {
        long clientId = createClient(null);
        long otherClientId = createClient(null);
        sellOnCredit(clientId, "120.00");
        sellOnCredit(otherClientId, "999.00");

        assertThat(statementOf(clientId))
                .doesNotContain("<th>Account</th>")
                .doesNotContain("999.00")
                .contains("Outstanding Balance: ₹120.00");
    }

    @Test
    void reassigningACreditEntryMovesItsAmountToAnotherSubAccountOfTheSameGroup() throws Exception {
        long parent = createClient(null);
        long fromClient = createClient(parent);
        long toClient = createClient(parent);
        long entryId = sellOnCredit(fromClient, "220.00");

        perform(post("/api/pumps/{pumpId}/credit-ledger/entries/{entryId}/reassign", setup.pumpId(), entryId),
                setup.manager(), Map.of("toClientId", toClient, "reason", "Billed to wrong vehicle"))
                .andExpect(status().is2xxSuccessful());

        assertThat(outstandingOf(fromClient)).isEqualByComparingTo("0");
        assertThat(outstandingOf(toClient)).isEqualByComparingTo("220.00");
        assertThat(outstandingOf(parent)).isEqualByComparingTo("220.00");
    }

    @Test
    void reassigningACreditEntryToAnUnrelatedClientIsRefused() throws Exception {
        long fromClient = createClient(null);
        long unrelated = createClient(null);
        long entryId = sellOnCredit(fromClient, "220.00");

        perform(post("/api/pumps/{pumpId}/credit-ledger/entries/{entryId}/reassign", setup.pumpId(), entryId),
                setup.manager(), Map.of("toClientId", unrelated, "reason", "Wrong fleet"))
                .andExpect(status().isBadRequest());

        assertThat(outstandingOf(fromClient)).isEqualByComparingTo("220.00");
    }

    @Test
    void statementPageEscapesTheClientNameAndForbidsScripts() throws Exception {
        CreditClient stored = creditClientRepository.save(CreditClient.builder()
                .pumpId(setup.pumpId())
                .name("</title><script>alert(1)</script>")
                .build());

        perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/statement", setup.pumpId(), stored.getId()), setup.owner())
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", containsString("default-src 'none'")))
                .andExpect(content().string(not(containsString("<script>"))))
                .andExpect(content().string(containsString("&lt;/title&gt;&lt;script&gt;")));

        perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "<b>Bold</b>", "phone", uniquePhone()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void paymentDatedInTheFutureIsRejected() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "100.00");

        perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId), setup.owner(),
                Map.of("amount", new BigDecimal("50.00"), "paymentMode", "CASH", "paidAt", TestDates.today().plusDays(3).toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void accountantCanReadTheLedgerButCannotRecordPayments() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "500.00");

        perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions", setup.pumpId(), clientId), setup.accountant())
                .andExpect(status().isOk());
        perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/statement", setup.pumpId(), clientId), setup.accountant())
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("500.00")));
        perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId), setup.accountant(),
                paymentBody("100.00"))
                .andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/credit-ledger", setup.pumpId()), setup.operator())
                .andExpect(status().isForbidden());
    }

    @Test
    void onlyOwnerOrAdminCanGrantACreditExtensionAndTheGrantIsAudited() throws Exception {
        long clientId = createClient(null);
        Map<String, Object> extension = Map.of("extensionType", "AMOUNT_EXTENSION",
                "extensionAmount", new BigDecimal("1000.00"),
                "expiryDate", TestDates.today().plusDays(7).toString(),
                "reason", "Festival season");

        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions", setup.pumpId(), clientId),
                setup.manager(), extension)
                .andExpect(status().isForbidden());
        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions", setup.pumpId(), clientId),
                setup.owner(), extension)
                .andExpect(status().is2xxSuccessful());

        JsonNode active = json(perform(get("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions/active", setup.pumpId(), clientId),
                setup.manager()).andExpect(status().isOk()));
        assertThat(active.toString()).contains("AMOUNT_EXTENSION");
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.CREDIT_EXTENSION_GRANTED)
                .singleElement()
                .satisfies(log -> assertThat(log.getDescription()).contains("AMOUNT_EXTENSION", "1000.00", "Festival season"));
    }

    @Test
    void publicBalanceLookupNeedsTheClientsPinAndHidesTheName() throws Exception {
        String phone = uniquePhone();
        long clientId = json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Portal Client", "phone", phone))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        sellOnCredit(clientId, "75.00");

        lookUpBalance(phone, "4321").andExpect(status().isNotFound());

        perform(put("/api/pumps/{pumpId}/credit-clients/{clientId}/portal-pin", setup.pumpId(), clientId),
                setup.manager(), Map.of("pin", "4321"))
                .andExpect(status().isForbidden());
        perform(put("/api/pumps/{pumpId}/credit-clients/{clientId}/portal-pin", setup.pumpId(), clientId),
                setup.owner(), Map.of("pin", "4321"))
                .andExpect(status().isNoContent());

        lookUpBalance(phone, "9999").andExpect(status().isNotFound())
                .andExpect(content().string(containsString("No credit account matches these details.")));
        lookUpBalance(phone, "4321")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outstandingAmount").value(75.00))
                .andExpect(jsonPath("$.clientName").doesNotExist());

        perform(delete("/api/pumps/{pumpId}/credit-clients/{clientId}/portal-pin", setup.pumpId(), clientId), setup.owner())
                .andExpect(status().isNoContent());
        lookUpBalance(phone, "4321").andExpect(status().isNotFound());
    }

    @Test
    void publicBalanceLookupIsRefusedForASuspendedPump() throws Exception {
        String phone = uniquePhone();
        long clientId = json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Suspended Pump Client", "phone", phone))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        perform(put("/api/pumps/{pumpId}/credit-clients/{clientId}/portal-pin", setup.pumpId(), clientId),
                setup.owner(), Map.of("pin", "2468"))
                .andExpect(status().isNoContent());
        setup.pump().setEnabled(false);
        pumpLocationRepository.save(setup.pump());

        lookUpBalance(phone, "2468").andExpect(status().isNotFound());
    }

    @Test
    void repeatedLookupsForOnePhoneAreLimitedEvenFromDifferentAddresses() throws Exception {
        String phone = uniquePhone();
        for (int attempt = 1; attempt <= 5; attempt++) {
            lookUpBalanceFrom(phone, "1111", "203.0.113." + attempt).andExpect(status().isNotFound());
        }
        lookUpBalanceFrom(phone, "1111", "203.0.113.99").andExpect(status().isTooManyRequests());
    }

    @Test
    void clientWithLedgerHistoryCannotBeDeletedButANewOneCan() throws Exception {
        long withHistory = createClient(null);
        sellOnCredit(withHistory, "10.00");
        long withoutHistory = createClient(null);

        perform(delete("/api/pumps/{pumpId}/credit-clients/{clientId}", setup.pumpId(), withHistory), setup.owner())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("deactivate instead")));
        perform(delete("/api/pumps/{pumpId}/credit-clients/{clientId}", setup.pumpId(), withoutHistory), setup.owner())
                .andExpect(status().isNoContent());
    }

    @Test
    void wholeLedgerComesInOneResponseWithTheSameRowsAndBalancesAsThePages() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "100.00");
        sellOnCredit(clientId, "40.00");
        recordPayment(clientId, "30.00").andExpect(status().is2xxSuccessful());
        sellOnCredit(clientId, "15.00");

        JsonNode all = json(perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions/all",
                setup.pumpId(), clientId), setup.owner()).andExpect(status().isOk()));
        List<String> pagedRows = new ArrayList<>();
        for (int page = 0; page < 2; page++) {
            JsonNode content = json(perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions",
                    setup.pumpId(), clientId).param("page", String.valueOf(page)).param("size", "2"), setup.owner())
                    .andExpect(status().isOk())).get("content");
            content.forEach(row -> pagedRows.add(rowKey(row)));
        }

        List<String> allRows = new ArrayList<>();
        all.forEach(row -> allRows.add(rowKey(row)));
        assertThat(allRows).containsExactlyElementsOf(pagedRows).hasSize(4);
        assertThat(all.get(0).get("runningBalance").decimalValue()).isEqualByComparingTo("125.00");
        assertThat(all.get(0).get("clientId").asLong()).isEqualTo(clientId);
    }

    @Test
    void wholeLedgerOfAParentIncludesSubAccountRowsOnlyWhenAsked() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        sellOnCredit(parentId, "100.00");
        sellOnCredit(childId, "250.00");

        JsonNode own = json(perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions/all",
                setup.pumpId(), parentId), setup.owner()).andExpect(status().isOk()));
        JsonNode withChildren = json(perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions/all",
                setup.pumpId(), parentId).param("includeChildren", "true"), setup.owner()).andExpect(status().isOk()));

        assertThat(own).hasSize(1);
        assertThat(withChildren).hasSize(2);
        JsonNode childRow = withChildren.get(0).get("clientId").asLong() == childId ? withChildren.get(0) : withChildren.get(1);
        assertThat(childRow.get("clientId").asLong()).isEqualTo(childId);
        assertThat(childRow.get("runningBalance").decimalValue()).isEqualByComparingTo("250.00");
    }

    @Test
    void wholeLedgerRunsTheSameNumberOfQueriesHoweverLongItIs() throws Exception {
        long clientId = createClient(null);
        sellOnCredit(clientId, "10.00");
        recordPayment(clientId, "5.00").andExpect(status().is2xxSuccessful());
        long shortLedger = statementsRunBy(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions/all",
                setup.pumpId(), clientId), setup.owner());

        for (int i = 0; i < 6; i++) {
            sellOnCredit(clientId, "10.00");
        }
        recordPayment(clientId, "5.00").andExpect(status().is2xxSuccessful());
        long longLedger = statementsRunBy(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/transactions/all",
                setup.pumpId(), clientId), setup.owner());

        assertThat(longLedger).isEqualTo(shortLedger);
    }

    @Test
    void changingACreditLimitReturnsTheTotalsOfTheClientsOwnGroup() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        sellOnCredit(parentId, "100.00");
        sellOnCredit(childId, "250.00");
        sellOnCredit(createClient(null), "20.00");

        JsonNode parent = json(perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit",
                setup.pumpId(), parentId), setup.owner(), Map.of("creditLimit", new BigDecimal("1000.00")))
                .andExpect(status().isOk()));
        JsonNode child = json(perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit",
                setup.pumpId(), childId), setup.owner(), Map.of("creditLimit", new BigDecimal("0")))
                .andExpect(status().isOk()));

        assertThat(parent.get("isParent").asBoolean()).isTrue();
        assertThat(parent.get("creditLimit").decimalValue()).isEqualByComparingTo("1000.00");
        assertThat(parent.get("outstandingBalance").decimalValue()).isEqualByComparingTo("350.00");
        assertThat(child.get("parentClientName").asText()).isEqualTo(parent.get("name").asText());
        assertThat(child.get("outstandingBalance").decimalValue()).isEqualByComparingTo("250.00");
    }

    @Test
    void lapsedExtensionStopsCountingAtOnceAndIsMarkedExpiredByTheDailyJob() throws Exception {
        long clientId = createClient(null);
        CreditExtension lapsed = extensionRepository.save(CreditExtension.builder()
                .pumpId(setup.pumpId())
                .clientId(clientId)
                .extensionType(CreditExtensionType.BILLING_CYCLE_EXTENSION)
                .expiryDate(TestDates.today().minusDays(1))
                .grantedByUserId(setup.owner().getId())
                .reason("Lapsed")
                .build());

        perform(get("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions/active", setup.pumpId(), clientId), setup.owner())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions", setup.pumpId(), clientId), setup.owner(),
                Map.of("extensionType", "BILLING_CYCLE_EXTENSION",
                        "expiryDate", TestDates.today().plusDays(7).toString(), "reason", "Renewed"))
                .andExpect(status().is2xxSuccessful());
        assertThat(extensionRepository.findById(lapsed.getId()).orElseThrow().getStatus()).isEqualTo(CreditExtensionStatus.ACTIVE);

        extensionExpiryJob.expireOverdueExtensions();

        assertThat(extensionRepository.findById(lapsed.getId()).orElseThrow().getStatus()).isEqualTo(CreditExtensionStatus.EXPIRED);
    }

    @Test
    void extensionOnASubAccountIsRefusedAndPointsToTheParentWhereItTakesEffect() throws Exception {
        long parentId = createClient(null);
        long childId = createClient(parentId);
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit", setup.pumpId(), parentId),
                setup.owner(), Map.of("creditLimit", new BigDecimal("500.00")))
                .andExpect(status().isOk());
        sellOnCredit(childId, "450.00");
        Map<String, Object> extension = Map.of("extensionType", "AMOUNT_EXTENSION",
                "extensionAmount", new BigDecimal("1000.00"),
                "expiryDate", TestDates.today().plusDays(7).toString(),
                "reason", "Fleet renewal");

        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions", setup.pumpId(), childId),
                setup.owner(), extension)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Grant the extension on the parent account")));
        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions", setup.pumpId(), parentId),
                setup.owner(), extension)
                .andExpect(status().is2xxSuccessful());

        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                creditEntry(childId, "300.00"))
                .andExpect(status().is2xxSuccessful());
        assertThat(outstandingOf(parentId)).isEqualByComparingTo("750.00");
    }

    @Test
    void ownerRevokesAnExtensionWithAReasonAfterWhichItNoLongerLetsCreditThrough() throws Exception {
        long clientId = createClient(null);
        perform(patch("/api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit", setup.pumpId(), clientId),
                setup.owner(), Map.of("creditLimit", new BigDecimal("500.00")))
                .andExpect(status().isOk());
        long extensionId = json(perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions", setup.pumpId(), clientId),
                setup.owner(), Map.of("extensionType", "AMOUNT_EXTENSION", "extensionAmount", new BigDecimal("1000.00"),
                        "expiryDate", TestDates.today().plusDays(7).toString(), "reason", "Festival season"))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        sellOnCredit(clientId, "900.00");

        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions/{id}/revoke", setup.pumpId(), clientId, extensionId),
                setup.manager(), Map.of("reason", "Missed payment"))
                .andExpect(status().isForbidden());
        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions/{id}/revoke", setup.pumpId(), clientId, extensionId),
                setup.owner(), Map.of("reason", " "))
                .andExpect(status().isBadRequest());
        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions/{id}/revoke", setup.pumpId(), clientId, extensionId),
                setup.admin(), Map.of("reason", "Missed payment"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVOKED"));
        perform(post("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions/{id}/revoke", setup.pumpId(), clientId, extensionId),
                setup.owner(), Map.of("reason", "Again"))
                .andExpect(status().isBadRequest());

        CreditExtension revoked = extensionRepository.findById(extensionId).orElseThrow();
        assertThat(revoked.getRevokedByUserId()).isEqualTo(setup.admin().getId());
        assertThat(revoked.getRevokeReason()).isEqualTo("Missed payment");
        perform(get("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions/active", setup.pumpId(), clientId), setup.owner())
                .andExpect(jsonPath("$.length()").value(0));
        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                creditEntry(clientId, "50.00"))
                .andExpect(status().isBadRequest());
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.CREDIT_EXTENSION_REVOKED)
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getActorId()).isEqualTo(setup.admin().getId());
                    assertThat(log.getDescription()).contains("Missed payment");
                });
    }

    @Test
    void movingACreditEntryToAnotherAccountIsAudited() throws Exception {
        long parent = createClient(null);
        long fromClient = createClient(parent);
        long toClient = createClient(parent);
        long entryId = sellOnCredit(fromClient, "220.00");

        perform(post("/api/pumps/{pumpId}/credit-ledger/entries/{entryId}/reassign", setup.pumpId(), entryId),
                setup.manager(), Map.of("toClientId", toClient, "reason", "Billed to wrong vehicle"))
                .andExpect(status().is2xxSuccessful());

        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.CREDIT_ENTRY_REASSIGNED)
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getEntityId()).isEqualTo(String.valueOf(entryId));
                    assertThat(log.getDescription()).contains("clientId=" + toClient).contains("Billed to wrong vehicle");
                });
    }

    private static String rowKey(JsonNode row) {
        return row.get("type").asText() + ":" + row.get("referenceId").asLong() + ":" + row.get("runningBalance").decimalValue();
    }

    private ResultActions lookUpBalance(String phone, String pin) throws Exception {
        return lookUpBalanceFrom(phone, pin, "198.51.100." + (Math.abs(phone.hashCode()) % 250));
    }

    private ResultActions lookUpBalanceFrom(String phone, String pin, String remoteAddress) throws Exception {
        return mockMvc.perform(post("/api/public/credit-balance")
                .with(request -> {
                    request.setRemoteAddr(remoteAddress);
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                        Map.of("pumpId", setup.pumpId(), "phone", phone, "pin", pin))));
    }

    private long createClient(Long parentClientId) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "Client " + shortId());
        body.put("phone", uniquePhone());
        body.put("parentClientId", parentClientId);
        return json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(), body)
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private String statementOf(long clientId) throws Exception {
        return perform(get("/api/pumps/{pumpId}/credit-ledger/{clientId}/statement", setup.pumpId(), clientId), setup.owner())
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private long sellOnCredit(long clientId, String amount) throws Exception {
        JsonNode shift = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId),
                setup.operator(), creditEntry(clientId, amount))
                .andExpect(status().is2xxSuccessful()));
        JsonNode entries = shift.get("creditEntries");
        return entries.get(entries.size() - 1).get("id").asLong();
    }

    private Map<String, Object> creditEntry(long clientId, String amount) {
        return Map.of("clientName", "Client", "clientId", clientId, "amount", new BigDecimal(amount), "fuelType", "PETROL");
    }

    private void backdateCreditEntry(long entryId, int daysAgo) {
        jdbcTemplate.update("UPDATE shift_credit_entries SET created_at = ?, sale_date = ? WHERE id = ?",
                TestDates.now().minusDays(daysAgo), TestDates.today().minusDays(daysAgo), entryId);
    }

    private ResultActions recordPayment(long clientId, String amount) throws Exception {
        return perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId),
                setup.manager(), paymentBody(amount));
    }

    private Map<String, Object> paymentBody(String amount) {
        return Map.of("amount", new BigDecimal(amount), "paymentMode", "CASH", "paidAt", TestDates.today().toString());
    }

    private void setExpenseApprovalThreshold(String threshold) throws Exception {
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(),
                Map.of("expenseApprovalThreshold", new BigDecimal(threshold)))
                .andExpect(status().isOk());
    }

    private BigDecimal outstandingOf(long clientId) throws Exception {
        JsonNode summary = json(perform(get("/api/pumps/{pumpId}/credit-ledger", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        for (JsonNode client : summary) {
            if (client.get("id").asLong() == clientId) {
                return client.get("outstandingBalance").decimalValue();
            }
        }
        JsonNode clients = json(perform(get("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        for (JsonNode client : clients) {
            if (client.get("id").asLong() == clientId) {
                return client.get("outstandingBalance").decimalValue();
            }
        }
        throw new AssertionError("Client " + clientId + " missing from ledger");
    }

    private static String uniquePhone() {
        return "9" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L);
    }
}
