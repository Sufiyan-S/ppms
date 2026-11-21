package com.ppms.invoice;

import java.util.Map;

/** State names for the GST state codes, so the place of supply can be printed as "27 – Maharashtra". */
final class GstStateCodes {

    private static final Map<String, String> NAME_BY_CODE = Map.ofEntries(
            Map.entry("01", "Jammu and Kashmir"), Map.entry("02", "Himachal Pradesh"), Map.entry("03", "Punjab"),
            Map.entry("04", "Chandigarh"), Map.entry("05", "Uttarakhand"), Map.entry("06", "Haryana"),
            Map.entry("07", "Delhi"), Map.entry("08", "Rajasthan"), Map.entry("09", "Uttar Pradesh"),
            Map.entry("10", "Bihar"), Map.entry("11", "Sikkim"), Map.entry("12", "Arunachal Pradesh"),
            Map.entry("13", "Nagaland"), Map.entry("14", "Manipur"), Map.entry("15", "Mizoram"),
            Map.entry("16", "Tripura"), Map.entry("17", "Meghalaya"), Map.entry("18", "Assam"),
            Map.entry("19", "West Bengal"), Map.entry("20", "Jharkhand"), Map.entry("21", "Odisha"),
            Map.entry("22", "Chhattisgarh"), Map.entry("23", "Madhya Pradesh"), Map.entry("24", "Gujarat"),
            Map.entry("26", "Dadra and Nagar Haveli and Daman and Diu"), Map.entry("27", "Maharashtra"),
            Map.entry("29", "Karnataka"), Map.entry("30", "Goa"), Map.entry("31", "Lakshadweep"),
            Map.entry("32", "Kerala"), Map.entry("33", "Tamil Nadu"), Map.entry("34", "Puducherry"),
            Map.entry("35", "Andaman and Nicobar Islands"), Map.entry("36", "Telangana"),
            Map.entry("37", "Andhra Pradesh"), Map.entry("38", "Ladakh"), Map.entry("97", "Other Territory"));

    private GstStateCodes() {
    }

    static String describe(String stateCode) {
        String name = NAME_BY_CODE.get(stateCode);
        return name == null ? stateCode : stateCode + " – " + name;
    }
}
