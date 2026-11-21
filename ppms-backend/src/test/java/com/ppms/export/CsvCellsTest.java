package com.ppms.export;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class CsvCellsTest {

    @Test
    void textStartingWithAFormulaCharacterOpensAsPlainText() {
        assertThat(CsvCells.text("=HYPERLINK(\"http://x\")")).isEqualTo("\"'=HYPERLINK(\"\"http://x\"\")\"");
        assertThat(CsvCells.text("+91 cash")).isEqualTo("'+91 cash");
        assertThat(CsvCells.text("-2+3")).isEqualTo("'-2+3");
        assertThat(CsvCells.text("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(CsvCells.text("\tcmd")).isEqualTo("'\tcmd");
    }

    @Test
    void textWithACommaIsQuotedSoColumnsStayAligned() {
        assertThat(CsvCells.text("Morning, North")).isEqualTo("\"Morning, North\"");
        assertThat(CsvCells.text("plain")).isEqualTo("plain");
        assertThat(CsvCells.text(null)).isEmpty();
    }

    @Test
    void negativeNumbersAreLeftAsNumbers() {
        assertThat(CsvCells.number(new BigDecimal("-12.50"))).isEqualTo("-12.50");
        assertThat(CsvCells.number(null)).isEmpty();
    }
}
