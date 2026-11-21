package com.ppms.auth;

public final class PhoneNumberMasking {

    private static final int VISIBLE_DIGITS = 4;

    private PhoneNumberMasking() {
    }

    public static String mask(String phoneNumber) {
        if (phoneNumber == null) {
            return null;
        }
        int length = phoneNumber.length();
        if (length <= VISIBLE_DIGITS) {
            return "*".repeat(length);
        }
        return "*".repeat(length - VISIBLE_DIGITS) + phoneNumber.substring(length - VISIBLE_DIGITS);
    }
}
