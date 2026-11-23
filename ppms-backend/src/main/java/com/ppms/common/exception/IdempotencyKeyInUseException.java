package com.ppms.common.exception;

/** Another request with the same Idempotency-Key is still being processed. */
public class IdempotencyKeyInUseException extends RuntimeException {
    public IdempotencyKeyInUseException(String message) {
        super(message);
    }
}
