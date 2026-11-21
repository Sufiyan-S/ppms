package com.ppms.invoice;

import com.ppms.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GstFieldsTest {

    @Test
    void gstinIsTrimmedAndUpperCased() {
        assertThat(GstFields.normaliseGstin("  27abcde1234f1z5 ")).isEqualTo("27ABCDE1234F1Z5");
    }

    @Test
    void blankValuesClearTheField() {
        assertThat(GstFields.normaliseGstin("   ")).isNull();
        assertThat(GstFields.normaliseHsnCode("")).isNull();
        assertThat(GstFields.normaliseInvoicePrefix(null)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"27ABCDE1234F1Z", "27ABCDE1234F0Z5", "27ABCDE1234F1X5", "A7ABCDE1234F1Z5", "27ABCD11234F1Z5"})
    void malformedGstinIsRefused(String gstin) {
        assertThatThrownBy(() -> GstFields.normaliseGstin(gstin)).isInstanceOf(BusinessException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"2710", "27101980", "340319"})
    void hsnCodeOfFourToEightDigitsIsAccepted(String hsnCode) {
        assertThat(GstFields.normaliseHsnCode(hsnCode)).isEqualTo(hsnCode);
    }

    @ParameterizedTest
    @ValueSource(strings = {"271", "271019801", "27A0"})
    void hsnCodeOutsideFourToEightDigitsIsRefused(String hsnCode) {
        assertThatThrownBy(() -> GstFields.normaliseHsnCode(hsnCode)).isInstanceOf(BusinessException.class);
    }

    @Test
    void invoicePrefixIsUpperCasedAndLimitedToFiveLettersOrDigits() {
        assertThat(GstFields.normaliseInvoicePrefix("pmp3")).isEqualTo("PMP3");
        assertThatThrownBy(() -> GstFields.normaliseInvoicePrefix("PUMP12")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> GstFields.normaliseInvoicePrefix("P/3")).isInstanceOf(BusinessException.class);
    }

    @Test
    void stateCodeIsTheFirstTwoDigitsOfTheGstin() {
        assertThat(GstFields.stateCodeOf("29ABCDE1234F1Z5")).isEqualTo("29");
    }
}
