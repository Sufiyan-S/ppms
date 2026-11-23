package com.ppms.common.exception;

/** The Idempotency-Key was already used for a different request. */
public class IdempotencyKeyReusedException extends RuntimeException {
    public IdempotencyKeyReusedException(String message) {
        super(message);
    }
}
