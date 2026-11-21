package com.ppms.common.dto;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PageRequestsTest {

    @Test
    void sizeAboveTheMaximumIsCapped() {
        assertThat(PageRequests.of(0, 5_000).getPageSize()).isEqualTo(PageRequests.MAX_PAGE_SIZE);
    }

    @Test
    void zeroOrNegativeSizeFallsBackToTheDefault() {
        assertThat(PageRequests.of(0, 0).getPageSize()).isEqualTo(PageRequests.DEFAULT_PAGE_SIZE);
        assertThat(PageRequests.of(0, -3).getPageSize()).isEqualTo(PageRequests.DEFAULT_PAGE_SIZE);
    }

    @Test
    void negativePageBecomesTheFirstPage() {
        PageRequest request = PageRequests.of(-2, 20);

        assertThat(request.getPageNumber()).isZero();
        assertThat(request.getPageSize()).isEqualTo(20);
    }

    @Test
    void inMemoryPagingUsesTheSameRules() {
        PagedResponse<Integer> response = PagedResponse.of(List.of(1, 2, 3), -1, 0);

        assertThat(response.content()).containsExactly(1, 2, 3);
        assertThat(response.page()).isZero();
        assertThat(response.pageSize()).isEqualTo(PageRequests.DEFAULT_PAGE_SIZE);
        assertThat(response.hasPrevious()).isFalse();
    }
}
