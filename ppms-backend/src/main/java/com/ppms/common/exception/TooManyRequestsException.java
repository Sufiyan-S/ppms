package com.ppms.common.exception;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public class TooManyRequestsException extends RuntimeException implements CodedError {

    private final String code;
    private final Map<String, Object> params;

    public TooManyRequestsException(String code, Map<String, Object> params, String englishMessage) {
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
