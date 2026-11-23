package com.ppms.common.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class ResourceNotFoundException extends RuntimeException implements CodedError {

    private final String code;
    private final Map<String, Object> params;

    public ResourceNotFoundException(EntityType entity, String englishMessage) {
        this(ErrorCodes.NOT_FOUND, Map.of("entityCode", entity.name()), englishMessage);
    }

    public ResourceNotFoundException(String code, Map<String, Object> params, String englishMessage) {
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
