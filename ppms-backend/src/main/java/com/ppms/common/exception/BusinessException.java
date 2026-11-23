package com.ppms.common.exception;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** A broken business rule (e.g. shift already open, credit limit exceeded); GlobalExceptionHandler answers 400. */
public class BusinessException extends RuntimeException implements CodedError {

    private final String code;
    private final Map<String, Object> params;

    /** code names the error for translated screens; params fill its placeholders; message stays the English text. */
    public BusinessException(String code, Map<String, Object> params, String englishMessage) {
        super(englishMessage);
        this.code = code;
        this.params = Collections.unmodifiableMap(new LinkedHashMap<>(params));
    }

    @Override
    public String getCode() {
        return code;
    }

    @Override
    public Map<String, Object> getParams() {
        return params;
    }
}
