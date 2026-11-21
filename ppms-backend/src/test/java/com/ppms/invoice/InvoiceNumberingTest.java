package com.ppms.invoice;

import com.ppms.common.exception.BusinessException;
import com.ppms.support.FixedBusinessClock;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InvoiceNumberingTest {

    @Test
    void thirtyFirstMarchBelongsToTheYearThatStartedTheAprilBefore() {
        assertThat(InvoiceNumbering.financialYearOf(LocalDate.of(2027, 3, 31))).isEqualTo("2026-27");
        assertThat(InvoiceNumbering.financialYearOf(LocalDate.of(2027, 4, 1))).isEqualTo("2027-28");
    }

    @Test
    void financialYearTurnsAtMidnightInIndiaNotUtc() {
        LocalDate lastMinuteOfMarchInIndia = new FixedBusinessClock(OffsetDateTime.parse("2027-03-31T18:29:00Z")).today();
        LocalDate firstMinuteOfAprilInIndia = new FixedBusinessClock(OffsetDateTime.parse("2027-03-31T18:30:00Z")).today();

        assertThat(InvoiceNumbering.financialYearOf(lastMinuteOfMarchInIndia)).isEqualTo("2026-27");
        assertThat(InvoiceNumbering.financialYearOf(firstMinuteOfAprilInIndia)).isEqualTo("2027-28");
    }

    @Test
    void centuryTurnKeepsTwoDigitYears() {
        assertThat(InvoiceNumbering.financialYearOf(LocalDate.of(2099, 6, 1))).isEqualTo("2099-00");
    }

    @Test
    void numberHasPrefixShortYearAndFourDigitSerial() {
        assertThat(InvoiceNumbering.invoiceNumber("PMP3", "2026-27", 1)).isEqualTo("PMP3/26-27/0001");
        assertThat(InvoiceNumbering.invoiceNumber("A", "2026-27", 12345)).isEqualTo("A/26-27/12345");
    }

    @Test
    void longestAllowedNumberIsSixteenCharacters() {
        assertThat(InvoiceNumbering.invoiceNumber("ABCDE", "2026-27", 9999)).hasSize(16);
    }

    @Test
    void numberLongerThanSixteenCharactersIsRefused() {
        assertThatThrownBy(() -> InvoiceNumbering.invoiceNumber("ABCDE", "2026-27", 10000))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("16 characters");
    }
}
