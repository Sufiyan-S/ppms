package com.ppms.common.idempotency;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ppms.auth.TokenHashing;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.IdempotencyKeyInUseException;
import com.ppms.common.exception.IdempotencyKeyReusedException;
import com.ppms.common.time.BusinessClock;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Optional;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import java.util.Map;

/**
 * Runs a write at most once per user and Idempotency-Key, so a client may safely resend it after a timeout.
 * The stored response is written in the same transaction as the write itself: either both are saved or neither.
 */
@Slf4j
@Service
public class IdempotencyService {

    public static final String HEADER = "Idempotency-Key";
    static final String REPLAYED_HEADER = "Idempotent-Replayed";
    private static final Pattern VALID_KEY = Pattern.compile("[A-Za-z0-9_-]{8,128}");

    private final IdempotencyKeyRepository idempotencyKeyRepository;
    private final ObjectMapper objectMapper;
    private final BusinessClock businessClock;
    private final TransactionTemplate transactionTemplate;

    public IdempotencyService(IdempotencyKeyRepository idempotencyKeyRepository, ObjectMapper objectMapper,
                              BusinessClock businessClock, PlatformTransactionManager transactionManager) {
        this.idempotencyKeyRepository = idempotencyKeyRepository;
        this.objectMapper = objectMapper;
        this.businessClock = businessClock;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * Without a key the write simply runs. With a key: the first request runs the write and stores a 2xx response;
     * the same request again gets that response back; a different request with the key is refused (422), and a
     * repeat while the first is still running is refused (409).
     */
    public ResponseEntity<?> runOnce(IdempotentRequest request, Supplier<ResponseEntity<?>> write) {
        if (request.key() == null) {
            return write.get();
        }
        if (!VALID_KEY.matcher(request.key()).matches()) {
            throw new BusinessException(ErrorCodes.IDEMPOTENCY_KEY_INVALID,
                    Map.of(),
                    "Idempotency-Key must be 8 to 128 letters, digits, '-' or '_'.");
        }
        String requestHash = TokenHashing.sha256Hex(request.endpoint() + "\n" + toJson(request.body()));
        return transactionTemplate.execute(status -> runInTransaction(request, requestHash, write));
    }

    @Transactional
    public int deleteBatchOlderThanHours(int hours, int batchSize) {
        return idempotencyKeyRepository.deleteCreatedBefore(businessClock.now().minusHours(hours), batchSize);
    }

    private ResponseEntity<?> runInTransaction(IdempotentRequest request, String requestHash,
                                               Supplier<ResponseEntity<?>> write) {
        if (!idempotencyKeyRepository.tryLockUntilTransactionEnds(request.userId() + ":" + request.key())) {
            throw new IdempotencyKeyInUseException("This request is already being processed. Please wait a moment.");
        }
        Optional<IdempotencyKey> stored = idempotencyKeyRepository.findByUserIdAndKey(request.userId(), request.key());
        if (stored.isPresent()) {
            return replay(stored.get(), request, requestHash);
        }
        ResponseEntity<?> response = write.get();
        if (response.getStatusCode().is2xxSuccessful()) {
            idempotencyKeyRepository.save(IdempotencyKey.builder()
                    .key(request.key())
                    .userId(request.userId())
                    .endpoint(request.endpoint())
                    .requestHash(requestHash)
                    .responseStatus(response.getStatusCode().value())
                    .responseBody(toJson(response.getBody()))
                    .build());
        }
        return response;
    }

    private ResponseEntity<JsonNode> replay(IdempotencyKey stored, IdempotentRequest request, String requestHash) {
        if (!stored.getEndpoint().equals(request.endpoint()) || !stored.getRequestHash().equals(requestHash)) {
            throw new IdempotencyKeyReusedException(
                    "This Idempotency-Key was already used for a different request. Send a new key for new data.");
        }
        log.info("Replayed stored response for userId={} endpoint={}", request.userId(), request.endpoint());
        return ResponseEntity.status(stored.getResponseStatus())
                .header(REPLAYED_HEADER, "true")
                .body(readJson(stored.getResponseBody()));
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialise " + value.getClass().getSimpleName() + " to JSON", e);
        }
    }

    private JsonNode readJson(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored idempotent response is not valid JSON", e);
        }
    }
}
