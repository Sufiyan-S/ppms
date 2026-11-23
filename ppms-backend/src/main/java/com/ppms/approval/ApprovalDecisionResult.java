package com.ppms.approval;

import java.util.List;
import java.util.Map;

/** What happened to each item of a bulk decision; items fail one by one without undoing the others. */
public record ApprovalDecisionResult(int succeeded, int failed, List<ItemResult> results) {

    /**
     * @param message why the item failed, in English; code and params name it for translated screens.
     *                All three are null when the item succeeded.
     */
    public record ItemResult(ApprovalKind kind, Long id, boolean succeeded, String message, String code,
                             Map<String, Object> params) {}

    static ApprovalDecisionResult of(List<ItemResult> results) {
        int succeeded = (int) results.stream().filter(ItemResult::succeeded).count();
        return new ApprovalDecisionResult(succeeded, results.size() - succeeded, results);
    }
}
