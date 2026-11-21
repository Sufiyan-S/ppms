package com.ppms.common.dto;

import org.springframework.data.domain.PageRequest;

public final class PageRequests {

    public static final int MAX_PAGE_SIZE = 200;
    public static final int DEFAULT_PAGE_SIZE = 50;

    private PageRequests() {
    }

    public static PageRequest of(int page, int size) {
        return PageRequest.of(safePage(page), cappedSize(size));
    }

    /** A missing or non-positive size gets the default; anything larger than the maximum is capped. */
    public static int cappedSize(int size) {
        return size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
    }

    public static int safePage(int page) {
        return Math.max(page, 0);
    }
}
