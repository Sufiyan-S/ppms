package com.ppms.auth;

public final class PasswordPolicy {

    // BCrypt only uses the first 72 bytes, so a longer password would be silently truncated.
    public static final int MAX_LENGTH = 72;
    public static final String REGEX =
            "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{8,72}$";
    public static final String MESSAGE =
            "Password must be 8 to 72 characters and include 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 symbol.";

    private PasswordPolicy() {
    }
}
