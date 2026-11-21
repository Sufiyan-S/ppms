package com.ppms.ancillary;

import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AncillaryProductIntegrationTest extends ApiIntegrationTest {

    @Autowired private JdbcTemplate jdbcTemplate;

    private PumpSetup setup;
    private long productId;

    @BeforeEach
    void createProductWithPriceAndStock() throws Exception {
        setup = createPumpWithStock("0");
        productId = json(perform(post("/api/pumps/{pumpId}/ancillary/products", setup.pumpId()), setup.owner(),
                Map.of("name", "Engine Oil " + shortId(), "brand", "Castrol", "packageSize", new BigDecimal("1"),
                        "unitOfMeasure", "LITRE", "lowStockThreshold", 2, "gstRatePercent", new BigDecimal("18")))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        perform(post("/api/pumps/{pumpId}/ancillary/products/{id}/prices", setup.pumpId(), productId), setup.owner(),
                Map.of("pricePerUnit", new BigDecimal("450.00")))
                .andExpect(status().is2xxSuccessful());
        stockIn(10, "300.00");
    }

    @Test
    void stockInRaisesTheProductStockAndCreatesALotAtItsCost() throws Exception {
        stockIn(5, "320.00");

        JsonNode product = product();
        assertThat(product.get("currentStockUnits").asInt()).isEqualTo(15);
        JsonNode lots = json(perform(get("/api/pumps/{pumpId}/ancillary/products/{id}/lots", setup.pumpId(), productId),
                setup.manager()).andExpect(status().isOk()));
        assertThat(lots.toString()).contains("300").contains("320");
    }

    @Test
    void saleAtTheConfiguredPriceTakesStockFromTheOldestLot() throws Exception {
        JsonNode sale = json(sell(4, "450.00").andExpect(status().is2xxSuccessful()));

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(6);
        assertThat(sale.toString()).contains("450");
    }

    @Test
    void saleOfMoreUnitsThanInStockIsRefusedAndStockIsUnchanged() throws Exception {
        sell(11, "450.00").andExpect(status().isBadRequest());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);
    }

    @Test
    void managerCannotSellAtADifferentPriceThanConfigured() throws Exception {
        sell(1, "400.00").andExpect(status().isBadRequest());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);
    }

    @Test
    void backfilledSaleBeforeAnyRecordedPriceIsRefused() throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("productId", productId);
        request.put("saleDate", TestDates.today().minusDays(1).toString());
        request.put("quantityUnits", 2);
        request.put("paymentMode", "CASH");

        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().isBadRequest());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);
    }

    @Test
    void backfilledUpiSaleDoesNotCreateASettlement() throws Exception {
        jdbcTemplate.update("UPDATE ancillary_product_prices SET effective_from = effective_from - INTERVAL '5 days' WHERE product_id = ?", productId);
        jdbcTemplate.update("UPDATE ancillary_stock_lots SET delivery_date = delivery_date - 5 WHERE product_id = ?", productId);
        Integer settlementsBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment_settlements WHERE pump_id = ?", Integer.class, setup.pumpId());
        Map<String, Object> request = new HashMap<>();
        request.put("productId", productId);
        request.put("saleDate", TestDates.today().minusDays(1).toString());
        request.put("quantityUnits", 2);
        request.put("paymentMode", "UPI");

        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().is2xxSuccessful());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment_settlements WHERE pump_id = ?", Integer.class, setup.pumpId()))
                .isEqualTo(settlementsBefore);
        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(8);
    }

    @Test
    void salesListShowsRecordedSales() throws Exception {
        sell(2, "450.00").andExpect(status().is2xxSuccessful());

        JsonNode sales = json(perform(get("/api/pumps/{pumpId}/ancillary/sales", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(sales.get("content").size()).isEqualTo(1);
    }

    @Test
    void patchingOnlyTheBrandKeepsTheLowStockThreshold() throws Exception {
        perform(patch("/api/pumps/{pumpId}/ancillary/products/{id}", setup.pumpId(), productId), setup.owner(),
                Map.of("brand", "Shell"))
                .andExpect(status().isOk());

        JsonNode product = product();
        assertThat(product.get("brand").asText()).isEqualTo("Shell");
        assertThat(product.get("lowStockThreshold").asInt()).isEqualTo(2);
    }

    @Test
    void managerCannotEditProducts() throws Exception {
        perform(patch("/api/pumps/{pumpId}/ancillary/products/{id}", setup.pumpId(), productId), setup.manager(),
                Map.of("brand", "Shell"))
                .andExpect(status().isForbidden());

        assertThat(product().get("brand").asText()).isEqualTo("Castrol");
    }

    @Test
    void gstRateAboveOneHundredPercentIsRejected() throws Exception {
        perform(patch("/api/pumps/{pumpId}/ancillary/products/{id}", setup.pumpId(), productId), setup.owner(),
                Map.of("gstRatePercent", new BigDecimal("150")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deactivatedProductIsMarkedInactive() throws Exception {
        perform(patch("/api/pumps/{pumpId}/ancillary/products/{id}/status", setup.pumpId(), productId)
                        .param("status", "INACTIVE"), setup.owner())
                .andExpect(status().isOk());

        assertThat(product().get("status").asText()).isEqualTo("INACTIVE");
    }

    @Test
    void backfilledCashSaleUsesStockDeliveredByThatDayAndPutsItsCashOnTheSaleDay() throws Exception {
        java.time.LocalDate saleDay = TestDates.today().minusDays(1);
        jdbcTemplate.update("UPDATE ancillary_product_prices SET effective_from = effective_from - INTERVAL '5 days' WHERE product_id = ?", productId);
        Map<String, Object> request = new HashMap<>();
        request.put("productId", productId);
        request.put("saleDate", saleDay.toString());
        request.put("quantityUnits", 4);
        request.put("paymentMode", "CASH");

        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().is2xxSuccessful());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(6);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT remaining_quantity FROM ancillary_stock_lots WHERE product_id = ?", Integer.class, productId))
                .isEqualTo(6);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT SUM(amount) FROM cash_events WHERE pump_id = ? AND event_date = ?", BigDecimal.class,
                setup.pumpId(), java.sql.Date.valueOf(saleDay)))
                .isEqualByComparingTo("1800.00");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM audit_logs WHERE pump_id = ? AND action = 'ANCILLARY_SALE_BACKFILLED'",
                Integer.class, setup.pumpId())).isEqualTo(1);
    }

    @Test
    void backfilledSaleCannotUseStockThatArrivedAfterTheSaleDay() throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("productId", productId);
        request.put("saleDate", TestDates.today().minusDays(3).toString());
        request.put("quantityUnits", 1);
        request.put("paymentMode", "CASH");
        jdbcTemplate.update("UPDATE ancillary_product_prices SET effective_from = effective_from - INTERVAL '5 days' WHERE product_id = ?", productId);

        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().isBadRequest());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);
    }

    @Test
    void backfillingASaleForTodayOrAsAManagerIsRefused() throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("productId", productId);
        request.put("saleDate", TestDates.today().toString());
        request.put("quantityUnits", 1);
        request.put("paymentMode", "CASH");

        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().isBadRequest());
        request.put("saleDate", TestDates.today().minusDays(1).toString());
        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.manager(), request)
                .andExpect(status().isForbidden());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);
    }

    @Test
    void correctingALotMovesTheProductStockByTheSameNumberOfUnits() throws Exception {
        Long lotId = jdbcTemplate.queryForObject(
                "SELECT id FROM ancillary_stock_lots WHERE product_id = ?", Long.class, productId);

        perform(patch("/api/pumps/{pumpId}/ancillary/lots/{lotId}", setup.pumpId(), lotId), setup.owner(),
                Map.of("remainingQuantity", 7, "costPricePerUnit", new BigDecimal("310.00")))
                .andExpect(status().isOk());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(7);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT cost_price_per_unit FROM ancillary_stock_lots WHERE id = ?", BigDecimal.class, lotId))
                .isEqualByComparingTo("310.00");
    }

    @Test
    void lotCannotHoldMoreThanWasDeliveredAndEmptyingItMarksItExhausted() throws Exception {
        Long lotId = jdbcTemplate.queryForObject(
                "SELECT id FROM ancillary_stock_lots WHERE product_id = ?", Long.class, productId);

        perform(patch("/api/pumps/{pumpId}/ancillary/lots/{lotId}", setup.pumpId(), lotId), setup.owner(),
                Map.of("remainingQuantity", 11))
                .andExpect(status().isBadRequest());
        perform(patch("/api/pumps/{pumpId}/ancillary/lots/{lotId}", setup.pumpId(), lotId), setup.manager(),
                Map.of("remainingQuantity", 5))
                .andExpect(status().isForbidden());
        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);

        perform(patch("/api/pumps/{pumpId}/ancillary/lots/{lotId}", setup.pumpId(), lotId), setup.owner(),
                Map.of("remainingQuantity", 0))
                .andExpect(status().isOk());
        assertThat(product().get("currentStockUnits").asInt()).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status::text FROM ancillary_stock_lots WHERE id = ?", String.class, lotId)).isEqualTo("EXHAUSTED");
    }

    @Test
    void lotOfAnotherPumpCannotBeCorrected() throws Exception {
        Long lotId = jdbcTemplate.queryForObject(
                "SELECT id FROM ancillary_stock_lots WHERE product_id = ?", Long.class, productId);
        PumpSetup other = createPumpWithStock("0");

        perform(patch("/api/pumps/{pumpId}/ancillary/lots/{lotId}", other.pumpId(), lotId), other.owner(),
                Map.of("remainingQuantity", 0))
                .andExpect(status().isNotFound());

        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);
    }

    private void stockIn(int units, String cost) throws Exception {
        perform(post("/api/pumps/{pumpId}/ancillary/products/{id}/deliveries", setup.pumpId(), productId), setup.manager(),
                Map.of("quantityUnits", units, "costPricePerUnit", new BigDecimal(cost),
                        "deliveryDate", TestDates.today().minusDays(2).toString(), "invoiceReference", "AN-" + shortId()))
                .andExpect(status().is2xxSuccessful());
    }

    private ResultActions sell(int units, String price) throws Exception {
        return perform(post("/api/pumps/{pumpId}/ancillary/sales", setup.pumpId()), setup.manager(),
                Map.of("productId", productId, "quantityUnits", units, "sellingPricePerUnit", new BigDecimal(price),
                        "paymentMode", "CASH"));
    }

    private JsonNode product() throws Exception {
        JsonNode products = json(perform(get("/api/pumps/{pumpId}/ancillary/products", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        JsonNode list = products.has("content") ? products.get("content") : products;
        for (JsonNode product : list) {
            if (product.get("id").asLong() == productId) {
                return product;
            }
        }
        throw new AssertionError("Product " + productId + " missing from " + products);
    }
}
