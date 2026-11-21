package com.ppms.settlement;

import java.math.BigDecimal;
import java.util.List;
import lombok.Builder;
import lombok.Data;

/** One entry per date in the requested range. Combines shift collections and recorded settlements. */
@Data @Builder
public class DailySummaryEntry {
    private String     date;               // YYYY-MM-DD
    private BigDecimal upiCollected;       // from closed shifts
    private BigDecimal cardCollected;
    private BigDecimal fleetCardCollected;
    private BigDecimal upiSettled;         // FIFO-allocated from recorded settlements
    private BigDecimal cardSettled;        // FIFO-allocated from recorded settlements
    private BigDecimal fleetCardSettled;   // FIFO-allocated from recorded settlements
    private List<SettlementResponse> settlements; // individual records for this date
}
