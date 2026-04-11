package com.ppms.common.exception;

// Thrown when a business rule is violated (e.g., shift already open, credit limit exceeded).
// Maps to HTTP 422 Unprocessable Entity so the frontend can distinguish it from a 400 (bad input).
public class BusinessException extends RuntimeException {
    public BusinessException(String message) {
        super(message);
    }
}
