package com.ppms.invoice;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class GstTaxSplitTest {

    @Test
    void sameStateSplitsGstEquallyIntoCgstAndSgst() {
        GstTaxSplit split = GstTaxSplit.of(new BigDecimal("36.00"), true);

        assertThat(split.cgst()).isEqualByComparingTo("18.00");
        assertThat(split.sgst()).isEqualByComparingTo("18.00");
        assertThat(split.igst()).isEqualByComparingTo("0.00");
    }

    @Test
    void oddPaisaGoesToCgstAndBothHalvesAddUpToTheGst() {
        GstTaxSplit split = GstTaxSplit.of(new BigDecimal("18.05"), true);

        assertThat(split.cgst()).isEqualByComparingTo("9.03");
        assertThat(split.sgst()).isEqualByComparingTo("9.02");
        assertThat(split.cgst().add(split.sgst())).isEqualByComparingTo("18.05");
    }

    @Test
    void singlePaisaIsNotLost() {
        GstTaxSplit split = GstTaxSplit.of(new BigDecimal("0.01"), true);

        assertThat(split.cgst()).isEqualByComparingTo("0.01");
        assertThat(split.sgst()).isEqualByComparingTo("0.00");
    }

    @Test
    void otherStateGetsTheWholeGstAsIgst() {
        GstTaxSplit split = GstTaxSplit.of(new BigDecimal("18.05"), false);

        assertThat(split.cgst()).isEqualByComparingTo("0.00");
        assertThat(split.sgst()).isEqualByComparingTo("0.00");
        assertThat(split.igst()).isEqualByComparingTo("18.05");
    }
}
