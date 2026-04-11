package com.ppms.common.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Standard paginated response envelope used across all list endpoints.
 *
 * Fields:
 * - content      : the items for the requested page
 * - page          : 0-based page index (matches Spring's Pageable.getPageNumber())
 * - pageSize      : number of items per page
 * - totalElements : total records across all pages
 * - totalPages    : ceil(totalElements / pageSize)
 * - hasNext       : true when there is at least one more page after this one
 * - hasPrevious   : true when the current page is not the first
 */
public record PagedResponse<T>(
        List<T> content,
        int page,
        int pageSize,
        long totalElements,
        int totalPages,
        boolean hasNext,
        boolean hasPrevious
) {

    /**
     * Builds a PagedResponse from a Spring Data {@link Page}.
     * Use this when pagination is delegated to the database (preferred).
     */
    public static <T> PagedResponse<T> of(Page<T> springPage) {
        return new PagedResponse<>(
                springPage.getContent(),
                springPage.getNumber(),
                springPage.getSize(),
                springPage.getTotalElements(),
                springPage.getTotalPages(),
                springPage.hasNext(),
                springPage.hasPrevious()
        );
    }

    /**
     * Builds a PagedResponse from an in-memory list.
     * Use this only when DB-level pagination is not possible (e.g. credit transactions
     * that must be sorted and balanced in memory across multiple tables).
     *
     * @param allItems all items already sorted in the desired display order
     * @param page     0-based page index requested by the caller
     * @param pageSize number of items per page
     */
    public static <T> PagedResponse<T> of(List<T> allItems, int page, int pageSize) {
        long total = allItems.size();
        int safePage = pageSize > 0 ? pageSize : 50;
        int totalPages = safePage > 0 ? (int) Math.ceil((double) total / safePage) : 1;
        int fromIndex = page * safePage;
        int toIndex = (int) Math.min((long) fromIndex + safePage, total);

        List<T> content = fromIndex >= total ? List.of() : allItems.subList(fromIndex, toIndex);

        return new PagedResponse<>(
                content,
                page,
                safePage,
                total,
                totalPages,
                page < totalPages - 1,
                page > 0
        );
    }
}
