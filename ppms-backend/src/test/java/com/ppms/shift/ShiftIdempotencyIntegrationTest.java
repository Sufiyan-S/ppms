package com.ppms.shift;

import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.common.idempotency.IdempotencyKeyRepository;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A resend with the same Idempotency-Key gets the first result back instead of closing, handing over or adding twice. */
class ShiftIdempotencyIntegrationTest extends ApiIntegrationTest {

    @Autowired private ShiftRepository shiftRepository;
    @Autowired private ShiftCreditEntryRepository creditEntryRepository;
    @Autowired private ShiftHandoverRepository handoverRepository;
    @Autowired private CashEventRepository cashEventRepository;
    @Autowired private IdempotencyKeyRepository idempotencyKeyRepository;
    @Autowired private PlatformTransactionManager transactionManager;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("5000");
    }

    @Test
    void resentCloseReturnsTheFirstResponseAndClosesOnlyOnce() throws Exception {
        long shiftId = openShift();
        String key = newKey();

        String first = sendClose(shiftId, key, closing("1010.000", "1000.00"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        MockHttpServletResponse replay = sendClose(shiftId, key, closing("1010.000", "1000.00"))
                .andExpect(status().isOk())
                .andExpect(header().string("Idempotent-Replayed", "true"))
                .andReturn().getResponse();

        assertThat(objectMapper.readTree(replay.getContentAsString())).isEqualTo(objectMapper.readTree(first));
        assertThat(shiftRepository.findById(shiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.CLOSED_BALANCED);
        assertThat(cashInEventCount()).isEqualTo(1);
    }

    @Test
    void resentCreditEntryIsRecordedOnlyOnce() throws Exception {
        long shiftId = openShift();
        String key = newKey();
        Map<String, Object> entry = creditEntry(createCreditClient(), "250.00");

        sendCreditEntry(shiftId, key, entry).andExpect(status().isCreated());
        sendCreditEntry(shiftId, key, entry)
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotent-Replayed", "true"));

        assertThat(creditEntryRepository.findByShiftId(shiftId)).hasSize(1);
    }

    @Test
    void resentHandoverOpensOnlyOneShiftForTheIncomingOperator() throws Exception {
        long shiftId = openShift();
        User incoming = saveUser(UserRole.OPERATOR, setup.pumpId());
        String key = newKey();
        Map<String, Object> handover = Map.of("outgoingShiftId", shiftId, "incomingOperatorId", incoming.getId(),
                "physicalCashVerified", true, "meterReadingsVerified", true, "closing", closing("1010.000", "1000.00"));

        long firstIncomingShiftId = json(sendWithKey(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), key, handover)
                .andExpect(status().isCreated())).get("incomingShiftId").asLong();
        long replayedIncomingShiftId = json(sendWithKey(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), key, handover)
                .andExpect(status().isCreated())).get("incomingShiftId").asLong();

        assertThat(replayedIncomingShiftId).isEqualTo(firstIncomingShiftId);
        assertThat(handoverRepository.findByOutgoingShiftId(shiftId)).isPresent();
        assertThat(shiftRepository.findOpenShiftByOperator(incoming.getId())).isPresent();
        assertThat(cashInEventCount()).isEqualTo(1);
    }

    @Test
    void sameKeyWithADifferentAmountIsRefusedAndAddsNothing() throws Exception {
        long shiftId = openShift();
        long clientId = createCreditClient();
        String key = newKey();
        sendCreditEntry(shiftId, key, creditEntry(clientId, "250.00")).andExpect(status().isCreated());

        sendCreditEntry(shiftId, key, creditEntry(clientId, "300.00"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().string(containsString("already used for a different request")));

        assertThat(creditEntryRepository.findByShiftId(shiftId))
                .extracting(ShiftCreditEntry::getAmount).singleElement()
                .satisfies(amount -> assertThat(amount).isEqualByComparingTo("250.00"));
    }

    @Test
    void resendWhileTheFirstIsStillRunningIsRefusedWithConflict() throws Exception {
        long shiftId = openShift();
        String key = newKey();
        CountDownLatch lockTaken = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<Boolean> firstRequest = executor.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
                boolean locked = idempotencyKeyRepository.tryLockUntilTransactionEnds(setup.manager().getId() + ":" + key);
                lockTaken.countDown();
                awaitQuietly(releaseLock);
                return locked;
            }));
            assertThat(lockTaken.await(10, TimeUnit.SECONDS)).isTrue();

            sendClose(shiftId, key, closing("1010.000", "1000.00")).andExpect(status().isConflict());

            releaseLock.countDown();
            assertThat(firstRequest.get(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            releaseLock.countDown();
            executor.shutdownNow();
        }
        assertThat(shiftRepository.findById(shiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN);
    }

    @Test
    void concurrentResendsCloseTheShiftOnlyOnce() throws Exception {
        long shiftId = openShift();
        String key = newKey();
        Cookie session = loginAs(setup.manager());
        String body = objectMapper.writeValueAsString(closing("1010.000", "1000.00"));
        CountDownLatch start = new CountDownLatch(1);
        Callable<Integer> resend = () -> {
            start.await();
            return mockMvc.perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId)
                            .cookie(session).header("Idempotency-Key", key)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andReturn().getResponse().getStatus();
        };

        ExecutorService executor = Executors.newFixedThreadPool(3);
        List<Integer> statuses = new ArrayList<>();
        try {
            List<Future<Integer>> results = List.of(executor.submit(resend), executor.submit(resend), executor.submit(resend));
            start.countDown();
            for (Future<Integer> result : results) {
                statuses.add(result.get(30, TimeUnit.SECONDS));
            }
        } finally {
            executor.shutdownNow();
        }

        assertThat(statuses).contains(200).allMatch(code -> code == 200 || code == 409);
        assertThat(cashInEventCount()).isEqualTo(1);
        assertThat(idempotencyKeyRepository.findByUserIdAndKey(setup.manager().getId(), key)).isPresent();
    }

    @Test
    void withoutTheHeaderASecondCloseIsRefusedAsBeforeAndNothingIsStored() throws Exception {
        long shiftId = openShift();

        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(),
                closing("1010.000", "1000.00")).andExpect(status().isOk());
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(),
                closing("1010.000", "1000.00")).andExpect(status().isBadRequest());

        assertThat(idempotencyKeyRepository.findAll())
                .noneMatch(stored -> stored.getUserId().equals(setup.manager().getId()));
    }

    @Test
    void refusedCloseStoresNoKeySoACorrectedResendStillRuns() throws Exception {
        long shiftId = openShift();
        String key = newKey();

        sendClose(shiftId, key, closing("990.000", "0")).andExpect(status().isBadRequest());

        assertThat(idempotencyKeyRepository.findByUserIdAndKey(setup.manager().getId(), key)).isEmpty();
        assertThat(shiftRepository.findById(shiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN);
    }

    @Test
    void malformedKeyIsRefused() throws Exception {
        long shiftId = openShift();

        sendClose(shiftId, "bad key!", closing("1010.000", "1000.00")).andExpect(status().isBadRequest());

        assertThat(shiftRepository.findById(shiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN);
    }

    private ResultActions sendClose(long shiftId, String key, Map<String, Object> body) throws Exception {
        return sendWithKey(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), key, body);
    }

    private ResultActions sendCreditEntry(long shiftId, String key, Map<String, Object> body) throws Exception {
        return sendWithKey(post("/api/pumps/{pumpId}/shifts/{id}/credit-entries", setup.pumpId(), shiftId), key, body);
    }

    private ResultActions sendWithKey(MockHttpServletRequestBuilder request, String key, Object body) throws Exception {
        return perform(request.header("Idempotency-Key", key), setup.manager(), body);
    }

    private long openShift() throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private Map<String, Object> closing(String endReading, String cash) {
        Map<String, Object> request = new HashMap<>();
        request.put("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal(endReading))));
        request.put("cashCollected", new BigDecimal(cash));
        request.put("upiCollected", BigDecimal.ZERO);
        request.put("cardCollected", BigDecimal.ZERO);
        request.put("fleetCardCollected", BigDecimal.ZERO);
        request.put("creditTotal", BigDecimal.ZERO);
        request.put("creditEntries", List.of());
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

    private long cashInEventCount() {
        return cashEventRepository.findByPumpIdOrderByEventDateDescCreatedAtDesc(setup.pumpId(), PageRequest.of(0, 20))
                .getContent().stream()
                .filter(event -> event.getEventType() == CashEventType.CASH_IN)
                .count();
    }

    private static String newKey() {
        return UUID.randomUUID().toString();
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(20, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while holding the idempotency lock", e);
        }
    }
}
