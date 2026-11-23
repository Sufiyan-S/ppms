package com.ppms.pump;

import com.ppms.common.text.CodedText;

import java.util.List;
import java.util.Map;

/** How far a pump's setup has got: each step with its state, and how many of the required steps are done. */
public record SetupChecklistResponse(Long pumpId, int doneCount, int requiredCount, List<Item> items) {

    public enum Step {
        DISPENSERS,
        TANKS,
        FUEL_PRICES,
        SHIFT_DEFINITIONS,
        STAFF,
        GST_DETAILS,
        CREDIT_CLIENTS
    }

    /**
     * One step; {@code detail} says what is set up or what is still missing, and {@code detailCode} with
     * {@code detailParams} name it for translated screens.
     */
    public record Item(Step step, boolean done, boolean optional, String detail, String detailCode,
                       Map<String, Object> detailParams) {

        static Item of(Step step, boolean done, boolean optional, CodedText detail) {
            return new Item(step, done, optional, detail.text(), detail.code(), detail.params());
        }
    }

    static SetupChecklistResponse of(Long pumpId, List<Item> items) {
        int required = (int) items.stream().filter(item -> !item.optional()).count();
        int done = (int) items.stream().filter(item -> !item.optional() && item.done()).count();
        return new SetupChecklistResponse(pumpId, done, required, items);
    }
}
