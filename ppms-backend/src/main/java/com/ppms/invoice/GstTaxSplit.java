package com.ppms.invoice;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** How one line's GST is shown: CGST + SGST within the seller's state, IGST across states. */
public record GstTaxSplit(BigDecimal cgst, BigDecimal sgst, BigDecimal igst) {

    private static final BigDecimal TWO = new BigDecimal("2");
    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);

    /** CGST takes the odd paisa, so CGST + SGST always equals the GST charged. */
    public static GstTaxSplit of(BigDecimal gstAmount, boolean sameState) {
        BigDecimal gst = gstAmount.setScale(2, RoundingMode.HALF_UP);
        if (!sameState) {
            return new GstTaxSplit(ZERO, ZERO, gst);
        }
        BigDecimal cgst = gst.divide(TWO, 2, RoundingMode.HALF_UP);
        return new GstTaxSplit(cgst, gst.subtract(cgst), ZERO);
    }
}
