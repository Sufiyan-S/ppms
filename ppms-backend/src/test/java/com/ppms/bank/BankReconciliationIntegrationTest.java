package com.ppms.bank;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BankReconciliationIntegrationTest extends ApiIntegrationTest {

    private static final String HEADER = "Date,Narration,Debit,Credit,Balance,UTR\n";

    private PumpSetup setup;
    private String today;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("1000");
        today = TestDates.today().toString();
    }

    @Test
    void theSameStatementFileCannotBeImportedTwice() throws Exception {
        String csv = HEADER + today + ",UPI credit,0,500.00,500.00,UTR-" + shortId() + "\n";

        importStatement(csv).andExpect(status().isCreated());
        importStatement(csv)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("already imported")));

        assertThat(json(perform(get("/api/pumps/{pumpId}/bank-reconciliation/imports", setup.pumpId()), setup.owner())))
                .hasSize(1);
    }

    @Test
    void aStatementRepeatingALineAlreadyImportedIsRefused() throws Exception {
        String repeatedUtr = "UTR-" + shortId();
        importStatement(HEADER + today + ",UPI credit,0,500.00,500.00," + repeatedUtr + "\n").andExpect(status().isCreated());

        importStatement(HEADER + today + ",UPI credit,0,500.00,500.00," + repeatedUtr + "\n"
                + today + ",UPI credit,0,200.00,700.00,UTR-" + shortId() + "\n")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString(repeatedUtr)));
    }

    @Test
    void aCreditPaymentIsMatchedToOneLineOnlyAndOnlyWithAnEqualAmountOrANote() throws Exception {
        long paymentId = recordCreditPayment("500.00");
        long importId = json(importStatement(HEADER
                + today + ",Payment A,0,500.00,500.00,UTR-" + shortId() + "\n"
                + today + ",Payment again,0,500.00,1000.00,UTR-" + shortId() + "\n"
                + today + ",Short payment,0,480.00,1480.00,UTR-" + shortId() + "\n")
                .andExpect(status().isCreated())).get("id").asLong();
        JsonNode lines = json(perform(get("/api/pumps/{pumpId}/bank-reconciliation/imports/{id}/lines", setup.pumpId(), importId),
                setup.owner()).andExpect(status().isOk()));
        long firstLine = lines.get(0).get("id").asLong();
        long secondLine = lines.get(1).get("id").asLong();
        long shortLine = lines.get(2).get("id").asLong();

        updateLine(firstLine, Map.of("status", "MATCHED"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("exactly one")));
        updateLine(firstLine, Map.of("status", "MATCHED", "matchedPaymentId", paymentId)).andExpect(status().isOk());
        updateLine(secondLine, Map.of("status", "MATCHED", "matchedPaymentId", paymentId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("already matched to another bank line")));

        updateLine(firstLine, Map.of("status", "UNMATCHED")).andExpect(status().isOk())
                .andExpect(jsonPath("$.matchedPaymentId").doesNotExist());
        updateLine(shortLine, Map.of("status", "MATCHED", "matchedPaymentId", paymentId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("does not equal")));
        updateLine(shortLine, Map.of("status", "MATCHED", "matchedPaymentId", paymentId,
                "matchNotes", "Bank deducted ₹20 charges"))
                .andExpect(status().isOk());

        JsonNode summary = json(perform(get("/api/pumps/{pumpId}/bank-reconciliation/imports", setup.pumpId()), setup.owner()));
        assertThat(summary.get(0).get("matchedLines").asInt()).isEqualTo(1);
    }

    private ResultActions importStatement(String csv) throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "statement.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));
        return perform(multipart("/api/pumps/{pumpId}/bank-reconciliation/import", setup.pumpId())
                .file(file).param("bankName", "SBI"), setup.owner());
    }

    private ResultActions updateLine(long lineId, Map<String, Object> body) throws Exception {
        return perform(patch("/api/pumps/{pumpId}/bank-reconciliation/lines/{lineId}", setup.pumpId(), lineId),
                setup.owner(), body);
    }

    private long recordCreditPayment(String amount) throws Exception {
        long shiftId = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        Map<String, Object> client = new HashMap<>();
        client.put("name", "Client " + shortId());
        client.put("phone", "9" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L));
        long clientId = json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(), client)
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        perform(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), setup.operator(),
                Map.of("clientName", "Client", "clientId", clientId, "amount", new BigDecimal(amount), "fuelType", "PETROL"))
                .andExpect(status().is2xxSuccessful());
        return json(perform(post("/api/pumps/{pumpId}/credit-ledger/{clientId}/payments", setup.pumpId(), clientId),
                setup.owner(), Map.of("amount", new BigDecimal(amount), "paymentMode", "UPI", "paidAt", today))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }
}
