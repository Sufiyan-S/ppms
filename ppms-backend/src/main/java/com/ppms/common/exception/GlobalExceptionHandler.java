package com.ppms.common.exception;

import com.ppms.auth.InvalidCredentialsException;
import com.ppms.auth.PasswordPolicy;
import com.ppms.fuel.PriceDeviationException;
import com.ppms.fuel.PriceDeviationWarning;
import lombok.extern.slf4j.Slf4j;
import jakarta.persistence.LockTimeoutException;
import jakarta.persistence.PessimisticLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleInvalidCredentials(InvalidCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of(HttpStatus.UNAUTHORIZED, ErrorCodes.INVALID_CREDENTIALS, Map.of(), ex.getMessage()));
    }

    /**
     * HTTP 409 Conflict — fuel price deviates >15% and requires explicit confirmation.
     * Frontend must show a warning dialog and re-submit with confirmed=true.
     */
    @ExceptionHandler(PriceDeviationException.class)
    public ResponseEntity<PriceDeviationWarning> handlePriceDeviation(PriceDeviationException ex) {
        String msg = String.format(
                "New price deviates %.2f%% from last price (₹%.4f → ₹%.4f). Please confirm this is correct.",
                ex.getDeviationPercent(), ex.getLastPrice(), ex.getNewPrice());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new PriceDeviationWarning(msg, ex.getLastPrice(), ex.getNewPrice(), ex.getDeviationPercent(),
                        ErrorCodes.PRICE_DEVIATION_NEEDS_CONFIRMATION,
                        Map.of("deviationPercent", ex.getDeviationPercent().setScale(2, RoundingMode.HALF_UP).toPlainString(),
                                "lastPrice", ex.getLastPrice().setScale(4, RoundingMode.HALF_UP).toPlainString(),
                                "newPrice", ex.getNewPrice().setScale(4, RoundingMode.HALF_UP).toPlainString())));
    }

    /**
     * HTTP 409 Conflict — a unique DB constraint was violated.
     * This surfaces when the application-level duplicate checks are bypassed
     * (e.g. duplicate tanker delivery invoice, double interest charge for the same period).
     * Returns a clean 409 so the frontend can show a user-friendly message rather than a
     * generic 500 that exposes nothing actionable to the user.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrity(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of(HttpStatus.CONFLICT, ErrorCodes.DUPLICATE_RECORD, Map.of(),
                        "This record already exists or conflicts with existing data. " +
                        "Please check for duplicate entries (e.g. same invoice reference or interest period)."));
    }

    @ExceptionHandler({PessimisticLockingFailureException.class, PessimisticLockException.class, LockTimeoutException.class})
    public ResponseEntity<ErrorResponse> handleLockWaitTimeout(RuntimeException ex) {
        log.warn("Row lock not acquired: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of(HttpStatus.CONFLICT, ErrorCodes.UPDATE_IN_PROGRESS, Map.of(),
                        "Another update is in progress, please retry."));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, ex.getCode(), ex.getParams(), ex.getMessage()));
    }

    @ExceptionHandler(IdempotencyKeyInUseException.class)
    public ResponseEntity<ErrorResponse> handleIdempotencyKeyInUse(IdempotencyKeyInUseException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of(HttpStatus.CONFLICT, ErrorCodes.REQUEST_ALREADY_IN_PROGRESS, Map.of(), ex.getMessage()));
    }

    @ExceptionHandler(IdempotencyKeyReusedException.class)
    public ResponseEntity<ErrorResponse> handleIdempotencyKeyReused(IdempotencyKeyReusedException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(ErrorResponse.of(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCodes.REQUEST_KEY_REUSED, Map.of(),
                        ex.getMessage()));
    }

    @ExceptionHandler(TooManyRequestsException.class)
    public ResponseEntity<ErrorResponse> handleTooManyRequests(TooManyRequestsException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ErrorResponse.of(HttpStatus.TOO_MANY_REQUESTS, ex.getCode(), ex.getParams(), ex.getMessage()));
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of(HttpStatus.NOT_FOUND, ex.getCode(), ex.getParams(), ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ErrorResponse.of(HttpStatus.FORBIDDEN, ErrorCodes.ACCESS_DENIED, Map.of(),
                        "You do not have permission to perform this action"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new HashMap<>();
        boolean breaksPasswordPolicy = false;
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(error.getField(), error.getDefaultMessage());
            breaksPasswordPolicy |= PasswordPolicy.MESSAGE.equals(error.getDefaultMessage());
        }
        FieldErrorCodes.CodedFieldError codedError = breaksPasswordPolicy
                ? new FieldErrorCodes.CodedFieldError(ErrorCodes.PASSWORD_POLICY, Map.of())
                : FieldErrorCodes.firstOf(ex.getBindingResult().getFieldErrors());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.ofValidation(fieldErrors, codedError.code(), codedError.params()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableMessage(HttpMessageNotReadableException ex) {
        log.warn("Unreadable request body: {}", ex.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, ErrorCodes.MALFORMED_REQUEST, Map.of(),
                        "Malformed request body. Check field types and enum values."));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ErrorResponse.of(HttpStatus.METHOD_NOT_ALLOWED, ErrorCodes.METHOD_NOT_ALLOWED,
                        Map.of("method", ex.getMethod()),
                        "Method " + ex.getMethod() + " is not supported for this endpoint"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoResource(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of(HttpStatus.NOT_FOUND, ErrorCodes.ENDPOINT_NOT_FOUND,
                        Map.of("method", String.valueOf(ex.getHttpMethod()), "path", ex.getResourcePath()),
                        "No endpoint found for " + ex.getHttpMethod() + " " + ex.getResourcePath()));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParam(MissingServletRequestParameterException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, ErrorCodes.PARAMETER_MISSING,
                        Map.of("parameter", ex.getParameterName()),
                        "Required parameter '" + ex.getParameterName() + "' is missing"));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, ErrorCodes.PARAMETER_INVALID,
                        Map.of("parameter", ex.getName(), "value", String.valueOf(ex.getValue())),
                        "Invalid value for parameter '" + ex.getName() + "': " + ex.getValue()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCodes.UNEXPECTED_ERROR, Map.of(),
                        "An unexpected error occurred"));
    }

    /** message is always English; code and params, when present, let the screen show the error in the user's language. */
    public record ErrorResponse(
            int status,
            String message,
            Map<String, String> fieldErrors,
            OffsetDateTime timestamp,
            String code,
            Map<String, Object> params
    ) {
        public static ErrorResponse of(HttpStatus status, String code, Map<String, Object> params, String message) {
            return new ErrorResponse(status.value(), message, null, OffsetDateTime.now(), code, params);
        }

        static ErrorResponse ofValidation(Map<String, String> fieldErrors, String code, Map<String, Object> params) {
            return new ErrorResponse(400, "Validation failed", fieldErrors, OffsetDateTime.now(), code, params);
        }
    }
}
