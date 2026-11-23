package com.ppms.report;

import com.ppms.common.text.CodedText;
import com.ppms.common.text.ServerTextCodes;
import com.ppms.fuel.FuelType;

import java.util.LinkedHashMap;
import java.util.Map;

/** Why a saved balance sheet went out of date, in English and as a code with params for translated screens. */
public final class StaleReasons {

    private static final String AFTER_GENERATED = " after this sheet was generated.";

    private StaleReasons() {
    }

    public static CodedText drainRecorded(String litres) {
        return CodedText.of(ServerTextCodes.STALE_DRAIN_RECORDED, "litres", litres,
                "A drain of " + litres + " L was recorded" + AFTER_GENERATED);
    }

    public static CodedText shiftBackfilled(Long shiftId) {
        return CodedText.of(ServerTextCodes.STALE_SHIFT_BACKFILLED, "shiftId", shiftId,
                "Shift #" + shiftId + " was backfilled" + AFTER_GENERATED);
    }

    public static CodedText shiftClosed(Long shiftId) {
        return CodedText.of(ServerTextCodes.STALE_SHIFT_CLOSED, "shiftId", shiftId,
                "Shift #" + shiftId + " was closed" + AFTER_GENERATED);
    }

    public static CodedText cashRecovered(Long shiftId) {
        return CodedText.of(ServerTextCodes.STALE_CASH_RECOVERED, "shiftId", shiftId,
                "Cash was recovered for the shortage on Shift #" + shiftId + AFTER_GENERATED);
    }

    public static CodedText dipCheckRecorded(String tankIdentifier) {
        return CodedText.of(ServerTextCodes.STALE_DIP_CHECK_RECORDED, "tankIdentifier", tankIdentifier,
                "A dip check on tank '" + tankIdentifier + "' was recorded" + AFTER_GENERATED);
    }

    public static CodedText productCostCorrected(String productName, String oldCost, String newCost) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("productName", productName);
        params.put("oldCost", oldCost);
        params.put("newCost", newCost);
        return new CodedText(ServerTextCodes.STALE_PRODUCT_COST_CORRECTED, params,
                "The purchase cost of '" + productName + "' was corrected from ₹" + oldCost + " to ₹" + newCost
                        + AFTER_GENERATED);
    }

    public static CodedText fuelCostCorrected(FuelType fuelType, String invoiceReference, String oldCost, String newCost) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("fuelTypeCode", fuelType.name());
        params.put("invoiceReference", invoiceReference);
        params.put("oldCost", oldCost);
        params.put("newCost", newCost);
        return new CodedText(ServerTextCodes.STALE_FUEL_COST_CORRECTED, params,
                "The purchase cost of " + fuelType + " delivery (invoice " + invoiceReference + ") was corrected ₹"
                        + oldCost + " → ₹" + newCost + "/L" + AFTER_GENERATED);
    }
}
