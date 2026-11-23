package com.ppms.common.exception;

import java.util.Map;

/** An error the screen can show in the user's language: errors.json["code"] filled with params. */
public interface CodedError {

    String getCode();

    Map<String, Object> getParams();
}
