package com.ppms.common.text;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Text the server writes for people: screens show enums.json["serverTexts"]["code"] filled with params, or the
 * English text when there is no translation. A param whose name ends in "Code" holds an enum code screens translate.
 */
public record CodedText(String code, Map<String, Object> params, String text) {

    public CodedText {
        params = Collections.unmodifiableMap(new LinkedHashMap<>(params));
    }

    public static CodedText of(String code, String text) {
        return new CodedText(code, Map.of(), text);
    }

    public static CodedText of(String code, String paramName, Object paramValue, String text) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put(paramName, paramValue);
        return new CodedText(code, params, text);
    }
}
