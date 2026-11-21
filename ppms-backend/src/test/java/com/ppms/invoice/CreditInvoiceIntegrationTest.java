package com.ppms.invoice;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.ancillary.AncillaryProductStatus;
import com.ppms.ancillary.AncillarySale;
import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.ancillary.UnitOfMeasure;
import com.ppms.common.exception.BusinessException;
import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientRepository;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.transaction.TransactionPaymentMode;
import com.ppms.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CreditInvoiceIntegrationTest extends ApiIntegrationTest {

    private static final String PUMP_GSTIN = "27AAAPL1234C1ZV";
    private static final String SAME_STATE_GSTIN = "27BBBCS5678D1Z2";
    private static final String OTHER_STATE_GSTIN = "29CCCDE9012F1Z8";
    private static final LocalDate TODAY = TestDates.today();
    private static final String FINANCIAL_YEAR = InvoiceNumbering.financialYearOf(TODAY).substring(2);

    @Autowired private CreditClientRepository creditClientRepository;
    @Autowired private AncillaryProductRepository productRepository;
    @Autowired private AncillarySaleRepository saleRepository;
    @Autowired private CreditInvoiceService invoiceService;

    private PumpSetup setup;
    private long shiftId;

    @BeforeEach
    void createPumpWithGstDetailsAndOpenShift() throws Exception {
        setup = createPumpWithStock("5000");
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(),
                Map.of("gstin", PUMP_GSTIN.toLowerCase(), "legalName", "Lakshmi Fuels Pvt Ltd",
                        "stateName", "Maharashtra", "invoicePrefix", "pmp3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gstin").value(PUMP_GSTIN))
                .andExpect(jsonPath("$.invoicePrefix").value("PMP3"));
        JsonNode opened = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful()));
        shiftId = opened.get("id").asLong();
    }

    @Test
    void invoiceHasFuelOutsideGstAndProductsWithCgstAndSgst() throws Exception {
        long clientId = createClient(SAME_STATE_GSTIN);
        sellFuelOnCredit(clientId, "1000.00");
        long saleId = sellProductOnCredit(clientId, "236.00", 2);

        JsonNode invoice = json(generate(clientId).andExpect(status().isCreated()));

        assertThat(invoice.get("invoiceNumber").asText()).isEqualTo("PMP3/" + FINANCIAL_YEAR + "/0001");
        assertThat(invoice.get("fuelTotal").decimalValue()).isEqualByComparingTo("1000.00");
        assertThat(invoice.get("taxableTotal").decimalValue()).isEqualByComparingTo("200.00");
        assertThat(invoice.get("cgstTotal").decimalValue()).isEqualByComparingTo("18.00");
        assertThat(invoice.get("sgstTotal").decimalValue()).isEqualByComparingTo("18.00");
        assertThat(invoice.get("igstTotal").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(invoice.get("grandTotal").decimalValue()).isEqualByComparingTo("1236.00");
        assertThat(invoice.get("placeOfSupplyStateCode").asText()).isEqualTo("27");

        JsonNode lines = detail(invoice).get("lines");
        assertThat(lines).hasSize(2);
        assertThat(lines).anySatisfy(line -> {
            assertThat(line.get("lineType").asText()).isEqualTo("ANCILLARY");
            assertThat(line.get("sourceId").asLong()).isEqualTo(saleId);
            assertThat(line.get("hsnCode").asText()).isEqualTo("27101980");
        });
    }

    @Test
    void voidedEntriesOtherClientsAndCashSalesAreLeftOut() throws Exception {
        long clientId = createClient(null);
        long otherClientId = createClient(null);
        long keptEntryId = sellFuelOnCredit(clientId, "300.00");
        long voidedEntryId = sellFuelOnCredit(clientId, "700.00");
        perform(patch("/api/pumps/{pumpId}/shifts/{shiftId}/credit-entries/{entryId}/void", setup.pumpId(), shiftId, voidedEntryId),
                setup.manager(), Map.of("voidReason", "Wrong amount"))
                .andExpect(status().is2xxSuccessful());
        sellFuelOnCredit(otherClientId, "450.00");
        saveProductSale(clientId, "118.00", 1, TransactionPaymentMode.CASH);

        JsonNode invoice = json(generate(clientId).andExpect(status().isCreated()));

        JsonNode lines = detail(invoice).get("lines");
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).get("sourceId").asLong()).isEqualTo(keptEntryId);
        assertThat(invoice.get("grandTotal").decimalValue()).isEqualByComparingTo("300.00");
    }

    @Test
    void clientInAnotherStateIsChargedIgst() throws Exception {
        long clientId = createClient(OTHER_STATE_GSTIN);
        sellProductOnCredit(clientId, "236.00", 2);

        JsonNode invoice = json(generate(clientId).andExpect(status().isCreated()));

        assertThat(invoice.get("igstTotal").decimalValue()).isEqualByComparingTo("36.00");
        assertThat(invoice.get("cgstTotal").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(invoice.get("placeOfSupplyStateCode").asText()).isEqualTo("29");
    }

    @Test
    void unregisteredClientIsBilledWithinThePumpsStateAndPrintedAsUnregistered() throws Exception {
        long clientId = createClient(null);
        sellProductOnCredit(clientId, "118.00", 1);

        JsonNode invoice = json(generate(clientId).andExpect(status().isCreated()));

        assertThat(invoice.get("cgstTotal").decimalValue()).isEqualByComparingTo("9.00");
        assertThat(invoice.get("sgstTotal").decimalValue()).isEqualByComparingTo("9.00");
        assertThat(invoice.get("placeOfSupplyStateCode").asText()).isEqualTo("27");
        print(invoice.get("id").asLong()).andExpect(content().string(containsString("Unregistered")));
    }

    @Test
    void saleAlreadyOnAnIssuedInvoiceCannotBeInvoicedAgain() throws Exception {
        long clientId = createClient(null);
        sellFuelOnCredit(clientId, "500.00");
        generate(clientId).andExpect(status().isCreated());

        generate(clientId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Nothing to invoice")));
    }

    @Test
    void twoGenerationsAtOnceBillEachSaleOnlyOnce() throws Exception {
        long clientId = createClient(null);
        sellFuelOnCredit(clientId, "500.00");
        sellProductOnCredit(clientId, "118.00", 1);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<CreditInvoice>> attempts = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            attempts.add(executor.submit(() -> {
                start.await();
                return invoiceService.issue(setup.pumpId(), clientId, TODAY, TODAY, setup.owner());
            }));
        }
        start.countDown();
        executor.shutdown();
        assertThat(executor.awaitTermination(30, TimeUnit.SECONDS)).isTrue();

        int issued = 0;
        int refused = 0;
        for (Future<CreditInvoice> attempt : attempts) {
            try {
                attempt.get();
                issued++;
            } catch (ExecutionException e) {
                assertThat(e.getCause()).isInstanceOf(BusinessException.class).hasMessageContaining("Nothing to invoice");
                refused++;
            }
        }
        assertThat(issued).isEqualTo(1);
        assertThat(refused).isEqualTo(1);
        JsonNode invoices = listFor(clientId).get("content");
        assertThat(invoices).hasSize(1);
        assertThat(detail(invoices.get(0)).get("lines")).hasSize(2);
    }

    @Test
    void cancellingFreesTheSalesAndTheNextInvoiceTakesTheNextNumber() throws Exception {
        long clientId = createClient(null);
        sellFuelOnCredit(clientId, "500.00");
        long firstId = json(generate(clientId).andExpect(status().isCreated())).get("id").asLong();

        cancel(firstId, Map.of("reason", " ")).andExpect(status().isBadRequest());
        cancel(firstId, Map.of("reason", "Wrong period"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        cancel(firstId, Map.of("reason", "Again")).andExpect(status().isBadRequest());

        JsonNode reissued = json(generate(clientId).andExpect(status().isCreated()));

        assertThat(reissued.get("invoiceNumber").asText()).isEqualTo("PMP3/" + FINANCIAL_YEAR + "/0002");
        assertThat(reissued.get("grandTotal").decimalValue()).isEqualByComparingTo("500.00");
        print(firstId).andExpect(content().string(containsString("CANCELLED")));
    }

    @Test
    void generatingForAllClientsNumbersInvoicesConsecutivelyAndSkipsClientsWithNothingToBill() throws Exception {
        long firstClientId = createClient(null);
        long secondClientId = createClient(SAME_STATE_GSTIN);
        createClient(null);
        sellFuelOnCredit(firstClientId, "100.00");
        sellFuelOnCredit(secondClientId, "200.00");

        JsonNode result = json(perform(post("/api/pumps/{pumpId}/credit-invoices/generate-all", setup.pumpId()),
                setup.admin(), Map.of("periodFrom", TODAY.toString(), "periodTo", TODAY.toString()))
                .andExpect(status().isOk()));

        assertThat(result.get("invoicesIssued").asInt()).isEqualTo(2);
        assertThat(result.get("clientsSkipped").asInt()).isEqualTo(1);
        assertThat(result.get("clientsFailed").asInt()).isZero();
        JsonNode invoices = json(perform(get("/api/pumps/{pumpId}/credit-invoices", setup.pumpId()), setup.owner())
                .andExpect(status().isOk())).get("content");
        assertThat(invoices).extracting(invoice -> invoice.get("invoiceNumber").asText())
                .containsExactlyInAnyOrder("PMP3/" + FINANCIAL_YEAR + "/0001", "PMP3/" + FINANCIAL_YEAR + "/0002");
    }

    @Test
    void pumpWithoutGstDetailsCannotIssueInvoices() throws Exception {
        long clientId = createClient(null);
        sellFuelOnCredit(clientId, "100.00");
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(), Map.of("gstin", ""))
                .andExpect(status().isOk());

        generate(clientId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Add GST details in pump setup first")));
    }

    @Test
    void malformedGstDetailsAreRefused() throws Exception {
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(), Map.of("gstin", "27ABC"))
                .andExpect(status().isBadRequest());
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(), Map.of("invoicePrefix", "PUMP12"))
                .andExpect(status().isBadRequest());
        perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Client " + shortId(), "phone", uniquePhone(), "gstin", "NOT-A-GSTIN"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void defaultPeriodIsTheClientsLastCompletedMonth() throws Exception {
        long clientId = createClient(null);
        LocalDate firstOfLastMonth = TODAY.minusMonths(1).withDayOfMonth(1);

        perform(get("/api/pumps/{pumpId}/credit-invoices/default-period", setup.pumpId()).param("clientId", String.valueOf(clientId)),
                setup.accountant())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.periodFrom").value(firstOfLastMonth.toString()))
                .andExpect(jsonPath("$.periodTo").value(firstOfLastMonth.plusMonths(1).minusDays(1).toString()));
    }

    @Test
    void onlyOwnerAndAdminIssueOrCancelWhileAccountantsCanReadAndPrint() throws Exception {
        long clientId = createClient(null);
        sellFuelOnCredit(clientId, "100.00");

        generate(clientId, setup.manager()).andExpect(status().isForbidden());
        generate(clientId, setup.accountant()).andExpect(status().isForbidden());
        long invoiceId = json(generate(clientId, setup.admin()).andExpect(status().isCreated())).get("id").asLong();

        perform(get("/api/pumps/{pumpId}/credit-invoices", setup.pumpId()), setup.accountant()).andExpect(status().isOk());
        perform(get("/api/pumps/{pumpId}/credit-invoices/{id}", setup.pumpId(), invoiceId), setup.manager())
                .andExpect(status().isOk());
        print(invoiceId).andExpect(status().isOk());
        perform(get("/api/pumps/{pumpId}/credit-invoices", setup.pumpId()), setup.operator()).andExpect(status().isForbidden());
        perform(post("/api/pumps/{pumpId}/credit-invoices/{id}/cancel", setup.pumpId(), invoiceId), setup.manager(),
                Map.of("reason", "Mistake"))
                .andExpect(status().isForbidden());
    }

    @Test
    void anotherPumpCannotReachThisPumpsInvoicesOrClients() throws Exception {
        long clientId = createClient(null);
        sellFuelOnCredit(clientId, "100.00");
        long invoiceId = json(generate(clientId).andExpect(status().isCreated())).get("id").asLong();
        PumpSetup otherPump = createPumpWithStock("0");

        perform(get("/api/pumps/{pumpId}/credit-invoices/{id}", setup.pumpId(), invoiceId), otherPump.owner())
                .andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/credit-invoices/{id}/print", otherPump.pumpId(), invoiceId), otherPump.owner())
                .andExpect(status().isNotFound());
        perform(post("/api/pumps/{pumpId}/credit-invoices/{id}/cancel", otherPump.pumpId(), invoiceId), otherPump.owner(),
                Map.of("reason", "Not mine"))
                .andExpect(status().isNotFound());
        perform(post("/api/pumps/{pumpId}/credit-invoices", otherPump.pumpId()), otherPump.owner(),
                Map.of("clientId", clientId, "periodFrom", TODAY.toString(), "periodTo", TODAY.toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void printedInvoiceEscapesStoredTextAndForbidsScripts() throws Exception {
        CreditClient client = creditClientRepository.save(CreditClient.builder()
                .pumpId(setup.pumpId())
                .name("</title><script>alert(1)</script>")
                .billingAddress("<img src=x onerror='alert(2)'>")
                .build());
        sellFuelOnCredit(client.getId(), "100.00");
        long invoiceId = json(generate(client.getId()).andExpect(status().isCreated())).get("id").asLong();

        print(invoiceId)
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", containsString("default-src 'none'")))
                .andExpect(content().string(not(containsString("<script>"))))
                .andExpect(content().string(not(containsString("<img"))))
                .andExpect(content().string(containsString("&lt;/title&gt;&lt;script&gt;")))
                .andExpect(content().string(containsString("outside GST")));
    }

    @Test
    void invoicedFuelEntryCannotBeVoidedUntilItsInvoiceIsCancelled() throws Exception {
        long clientId = createClient(null);
        long entryId = sellFuelOnCredit(clientId, "500.00");
        long invoiceId = json(generate(clientId).andExpect(status().isCreated())).get("id").asLong();

        voidEntry(entryId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "This sale is on invoice PMP3/" + FINANCIAL_YEAR + "/0001. Cancel the invoice first."));

        cancel(invoiceId, Map.of("reason", "Entry was wrong")).andExpect(status().isOk());
        voidEntry(entryId).andExpect(status().is2xxSuccessful());
    }

    @Test
    void invoicedFuelEntryCannotBeMovedToAnotherAccountUntilItsInvoiceIsCancelled() throws Exception {
        long parentId = createClient(null);
        long subAccountId = createSubAccount(parentId);
        long entryId = sellFuelOnCredit(subAccountId, "500.00");
        long invoiceId = json(generate(subAccountId).andExpect(status().isCreated())).get("id").asLong();

        moveEntry(entryId, parentId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Cancel the invoice first")));

        cancel(invoiceId, Map.of("reason", "Billed to the wrong account")).andExpect(status().isOk());
        moveEntry(entryId, parentId).andExpect(status().is2xxSuccessful());
    }

    @Test
    void invoicedFuelEntryCannotBeReplacedWhenTheShiftClosesUntilItsInvoiceIsCancelled() throws Exception {
        long clientId = createClient(null);
        long entryId = sellFuelOnCredit(clientId, "250.00");
        long invoiceId = json(generate(clientId).andExpect(status().isCreated())).get("id").asLong();

        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(),
                closeReplacing(entryId, clientId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Cancel the invoice first")));

        cancel(invoiceId, Map.of("reason", "Amount corrected at close")).andExpect(status().isOk());
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(),
                closeReplacing(entryId, clientId))
                .andExpect(status().is2xxSuccessful());
    }

    private ResultActions voidEntry(long entryId) throws Exception {
        return perform(patch("/api/pumps/{pumpId}/shifts/{shiftId}/credit-entries/{entryId}/void", setup.pumpId(), shiftId, entryId),
                setup.manager(), Map.of("voidReason", "Wrong amount"));
    }

    private ResultActions moveEntry(long entryId, long toClientId) throws Exception {
        return perform(post("/api/pumps/{pumpId}/credit-ledger/entries/{entryId}/reassign", setup.pumpId(), entryId),
                setup.manager(), Map.of("toClientId", toClientId, "reason", "Driver belongs to the parent"));
    }

    /** One nozzle sold 10 L at ₹100: ₹700 cash plus a ₹300 credit entry that replaces the original one. */
    private Map<String, Object> closeReplacing(long replacedEntryId, long clientId) {
        Map<String, Object> request = new HashMap<>();
        request.put("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal("1010.000"))));
        request.put("cashCollected", new BigDecimal("700.00"));
        request.put("upiCollected", BigDecimal.ZERO);
        request.put("cardCollected", BigDecimal.ZERO);
        request.put("fleetCardCollected", BigDecimal.ZERO);
        request.put("creditTotal", new BigDecimal("300.00"));
        request.put("creditEntries", List.of(Map.of("clientName", "Client", "clientId", clientId,
                "amount", new BigDecimal("300.00"), "fuelType", "PETROL")));
        request.put("replacedCreditEntryIds", List.of(replacedEntryId));
        return request;
    }

    private long createSubAccount(long parentId) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Driver " + shortId(), "phone", uniquePhone(), "parentClientId", parentId))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private long createClient(String gstin) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "Client " + shortId());
        body.put("phone", uniquePhone());
        body.put("gstin", gstin);
        body.put("billingAddress", "Plot 4, MIDC, Pune");
        return json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(), body)
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private long sellFuelOnCredit(long clientId, String amount) throws Exception {
        JsonNode shift = json(perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId),
                setup.operator(), Map.of("clientName", "Client", "clientId", clientId,
                        "amount", new BigDecimal(amount), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful()));
        JsonNode entries = shift.get("creditEntries");
        return entries.get(entries.size() - 1).get("id").asLong();
    }

    private long sellProductOnCredit(long clientId, String pricePaid, int quantity) {
        return saveProductSale(clientId, pricePaid, quantity, TransactionPaymentMode.CREDIT);
    }

    private long saveProductSale(long clientId, String pricePaid, int quantity, TransactionPaymentMode paymentMode) {
        AncillaryProduct product = productRepository.save(AncillaryProduct.builder()
                .pumpId(setup.pumpId())
                .name("Engine oil " + shortId())
                .packageSize(new BigDecimal("1.000"))
                .unitOfMeasure(UnitOfMeasure.LITRE)
                .currentStockUnits(0)
                .gstRatePercent(new BigDecimal("18.00"))
                .hsnCode("27101980")
                .status(AncillaryProductStatus.ACTIVE)
                .build());
        BigDecimal total = new BigDecimal(pricePaid);
        return saleRepository.save(AncillarySale.builder()
                .pumpId(setup.pumpId())
                .productId(product.getId())
                .quantityUnits(quantity)
                .sellingPricePerUnit(total.divide(new BigDecimal(quantity)))
                .totalAmount(total)
                .gstAmount(BigDecimal.ZERO.setScale(2))
                .totalWithGst(total)
                .paymentMode(paymentMode)
                .clientId(clientId)
                .clientName("Client")
                .soldByUserId(setup.manager().getId())
                .saleDate(TODAY)
                .build()).getId();
    }

    private ResultActions generate(long clientId) throws Exception {
        return generate(clientId, setup.owner());
    }

    private ResultActions generate(long clientId, User user) throws Exception {
        return perform(post("/api/pumps/{pumpId}/credit-invoices", setup.pumpId()), user,
                Map.of("clientId", clientId, "periodFrom", TODAY.toString(), "periodTo", TODAY.toString()));
    }

    private ResultActions cancel(long invoiceId, Map<String, Object> body) throws Exception {
        return perform(post("/api/pumps/{pumpId}/credit-invoices/{id}/cancel", setup.pumpId(), invoiceId), setup.owner(), body);
    }

    private ResultActions print(long invoiceId) throws Exception {
        return perform(get("/api/pumps/{pumpId}/credit-invoices/{id}/print", setup.pumpId(), invoiceId), setup.accountant());
    }

    private JsonNode detail(JsonNode invoice) throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/credit-invoices/{id}", setup.pumpId(), invoice.get("id").asLong()),
                setup.owner()).andExpect(status().isOk()));
    }

    private JsonNode listFor(long clientId) throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/credit-invoices", setup.pumpId()).param("clientId", String.valueOf(clientId)),
                setup.owner()).andExpect(status().isOk()));
    }

    private static String uniquePhone() {
        return "9" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L);
    }
}
