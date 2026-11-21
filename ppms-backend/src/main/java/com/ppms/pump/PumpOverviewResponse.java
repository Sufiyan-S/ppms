package com.ppms.pump;

import java.util.List;

/** Today's figures for every pump the user can open, with the totals across them. */
public record PumpOverviewResponse(List<PumpOverviewSummary> pumps, PumpOverviewTotals totals) {
}
