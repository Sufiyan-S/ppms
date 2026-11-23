package com.ppms.common.exception;

import jakarta.validation.ConstraintViolation;
import org.springframework.validation.FieldError;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Names the first broken field rule of a request with an error code, so the screen can say in the user's
 * language which field is wrong. The field travels as "fieldCode" (e.g. OPENING_READING), shown from enums.json
 * or, without a translation there, as readable English words.
 */
final class FieldErrorCodes {

    record CodedFieldError(String code, Map<String, Object> params) {
    }

    private FieldErrorCodes() {
    }

    static CodedFieldError firstOf(List<FieldError> errors) {
        return errors.stream()
                .min(Comparator.comparing(FieldError::getField))
                .map(FieldErrorCodes::codeFor)
                .orElse(new CodedFieldError(ErrorCodes.VALIDATION_FAILED, Map.of()));
    }

    private static CodedFieldError codeFor(FieldError error) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("fieldCode", fieldCode(error.getField()));
        Map<String, Object> rule = ruleAttributes(error);
        String constraint = error.getCode() == null ? "" : error.getCode();
        String code = switch (constraint) {
            case "NotNull", "NotBlank", "NotEmpty" -> ErrorCodes.FIELD_REQUIRED;
            case "Size" -> sizeCode(rule, params);
            case "Min", "DecimalMin" -> {
                params.put("min", String.valueOf(rule.get("value")));
                yield ErrorCodes.FIELD_BELOW_MIN;
            }
            case "Max", "DecimalMax" -> {
                params.put("max", String.valueOf(rule.get("value")));
                yield ErrorCodes.FIELD_ABOVE_MAX;
            }
            case "Positive" -> ErrorCodes.FIELD_NOT_POSITIVE;
            case "PositiveOrZero" -> ErrorCodes.FIELD_NEGATIVE;
            case "Pattern", "Email" -> ErrorCodes.FIELD_INVALID_FORMAT;
            case "Past", "PastOrPresent" -> ErrorCodes.FIELD_DATE_IN_FUTURE;
            case "Future", "FutureOrPresent" -> ErrorCodes.FIELD_DATE_IN_PAST;
            default -> ErrorCodes.FIELD_INVALID;
        };
        return new CodedFieldError(code, params);
    }

    private static String sizeCode(Map<String, Object> rule, Map<String, Object> params) {
        Object min = rule.get("min");
        params.put("max", String.valueOf(rule.get("max")));
        if (min == null || "0".equals(String.valueOf(min))) {
            return ErrorCodes.FIELD_TOO_LONG;
        }
        params.put("min", String.valueOf(min));
        return ErrorCodes.FIELD_SIZE;
    }

    private static Map<String, Object> ruleAttributes(FieldError error) {
        if (!error.contains(ConstraintViolation.class)) {
            return Map.of();
        }
        return error.unwrap(ConstraintViolation.class).getConstraintDescriptor().getAttributes();
    }

    /** "items[0].openingReading" becomes OPENING_READING. */
    private static String fieldCode(String fieldPath) {
        String field = fieldPath.substring(fieldPath.lastIndexOf('.') + 1).replaceAll("\\[\\d*]", "");
        return field.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT);
    }
}
