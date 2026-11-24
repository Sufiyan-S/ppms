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
    void saleKeepsTheGstRateItWasSoldAtWhenTheProductRateChangesLater() throws Exception {
        long saleId = json(sell(1, "450.00").andExpect(status().is2xxSuccessful())).get("id").asLong();

        perform(patch("/api/pumps/{pumpId}/ancillary/products/{id}", setup.pumpId(), productId), setup.owner(),
                Map.of("gstRatePercent", new BigDecimal("28")))
                .andExpect(status().isOk());

        assertThat(jdbcTemplate.queryForObject("SELECT gst_rate_percent FROM ancillary_sales WHERE id = ?",
                BigDecimal.class, saleId)).isEqualByComparingTo("18.00");
    }

    @Test
    void backfilledCreditSaleNeedsAClientAndIsAddedToThatClientsBalance() throws Exception {
        jdbcTemplate.update("UPDATE ancillary_product_prices SET effective_from = effective_from - INTERVAL '5 days' WHERE product_id = ?", productId);
        long clientId = json(perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Client " + shortId(), "phone", "9" + String.format("%09d", System.nanoTime() % 1_000_000_000L)))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
        Map<String, Object> request = new HashMap<>();
        request.put("productId", productId);
        request.put("saleDate", TestDates.today().minusDays(1).toString());
        request.put("quantityUnits", 2);
        request.put("paymentMode", "CREDIT");
        request.put("clientName", "Walk-in");

        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().isBadRequest());
        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(10);

        request.put("clientId", clientId);
        perform(post("/api/pumps/{pumpId}/ancillary/sales/backfill", setup.pumpId()), setup.owner(), request)
                .andExpect(status().is2xxSuccessful());

        JsonNode clients = json(perform(get("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        assertThat(clients).anySatisfy(client -> {
            assertThat(client.get("id").asLong()).isEqualTo(clientId);
            assertThat(client.get("outstandingBalance").decimalValue()).isEqualByComparingTo("900.00");
        });
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
    void correctingALotCostRecostsUnitsAlreadySoldAndMarksThatDaysSheetStale() throws Exception {
        Long lotId = jdbcTemplate.queryForObject(
                "SELECT id FROM ancillary_stock_lots WHERE product_id = ?", Long.class, productId);
        long saleId = json(sell(4, "450.00").andExpect(status().is2xxSuccessful())).get("id").asLong();
        jdbcTemplate.update("""
                INSERT INTO balance_sheets (pump_id, report_type, report_date, period_label, generated_by_user_id, generated_at)
                VALUES (?, 'DAY', ?, 'Day End', ?, NOW())
                """, setup.pumpId(), TestDates.today(), setup.owner().getId());

        perform(patch("/api/pumps/{pumpId}/ancillary/lots/{lotId}", setup.pumpId(), lotId), setup.owner(),
                Map.of("costPricePerUnit", new BigDecimal("280.00")))
                .andExpect(status().isOk());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT cost_price_per_unit FROM ancillary_lot_consumptions WHERE sale_id = ?", BigDecimal.class, saleId))
                .isEqualByComparingTo("280.00");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT stale FROM balance_sheets WHERE pump_id = ?", Boolean.class, setup.pumpId())).isTrue();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT description FROM audit_logs WHERE pump_id = ? AND action = 'LOT_COST_CORRECTED'",
                String.class, setup.pumpId())).contains("₹300.00 → ₹280.00", "4 unit(s)");
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

    @Test
    void productCreatedWithAPriceStartsWithThatPriceAsItsFirstPriceRow() throws Exception {
        JsonNode created = json(createProduct(Map.of("sellingPricePerUnit", new BigDecimal("120.5")))
                .andExpect(status().isCreated()));
        long pricedProductId = created.get("id").asLong();
        assertThat(created.get("currentSellingPricePerUnit").decimalValue()).isEqualByComparingTo("120.50");

        JsonNode history = json(perform(get("/api/pumps/{pumpId}/ancillary/products/{id}/prices",
                setup.pumpId(), pricedProductId), setup.manager()).andExpect(status().isOk()));
        assertThat(history.size()).isEqualTo(1);
        assertThat(history.get(0).get("pricePerUnit").decimalValue()).isEqualByComparingTo("120.50");
        assertThat(history.get(0).get("setByUserId").asLong()).isEqualTo(setup.owner().getId());
    }

    @Test
    void productWithASellingPriceBelowOnePaisaIsRefusedAndNotCreated() throws Exception {
        Integer productsBefore = productCount();

        createProduct(Map.of("sellingPricePerUnit", new BigDecimal("0"))).andExpect(status().isBadRequest());

        assertThat(productCount()).isEqualTo(productsBefore);
    }

    @Test
    void productListShowsTheLatestPriceInEffectAndNoPriceForAnUnpricedProduct() throws Exception {
        long unpricedProductId = json(createProduct(Map.of()).andExpect(status().isCreated())).get("id").asLong();
        perform(post("/api/pumps/{pumpId}/ancillary/products/{id}/prices", setup.pumpId(), productId), setup.owner(),
                Map.of("pricePerUnit", new BigDecimal("470.00")))
                .andExpect(status().isCreated());
        jdbcTemplate.update("""
                INSERT INTO ancillary_product_prices (product_id, pump_id, price_per_unit, effective_from, set_by_user_id)
                VALUES (?, ?, 999.00, now() + INTERVAL '1 day', ?)""", productId, setup.pumpId(), setup.owner().getId());

        assertThat(product().get("currentSellingPricePerUnit").decimalValue()).isEqualByComparingTo("470.00");
        assertThat(productById(unpricedProductId).get("currentSellingPricePerUnit").isNull()).isTrue();
    }

    @Test
    void productListShowsOnlyTodaysSalesOfThisPumpAsSoldToday() throws Exception {
        sell(2, "450.00").andExpect(status().isCreated());
        sell(1, "450.00").andExpect(status().isCreated());
        long yesterdaySaleId = json(sell(4, "450.00").andExpect(status().isCreated())).get("id").asLong();
        jdbcTemplate.update("UPDATE ancillary_sales SET sale_date = ? WHERE id = ?",
                java.sql.Date.valueOf(TestDates.today().minusDays(1)), yesterdaySaleId);
        PumpSetup other = createPumpWithStock("0");
        jdbcTemplate.update("""
                INSERT INTO ancillary_sales (pump_id, product_id, quantity_units, selling_price_per_unit, total_amount,
                    gst_amount, total_with_gst, gst_rate_percent, payment_mode, sold_by_user_id, sale_date, created_at)
                VALUES (?, ?, 5, 450.00, 2250.00, 0, 2250.00, 18, 'CASH', ?, ?, now())""",
                other.pumpId(), productId, other.owner().getId(), java.sql.Date.valueOf(TestDates.today()));
        long unsoldProductId = json(createProduct(Map.of()).andExpect(status().isCreated())).get("id").asLong();

        JsonNode product = product();
        assertThat(product.get("soldTodayUnits").asInt()).isEqualTo(3);
        assertThat(product.get("soldTodayAmount").decimalValue()).isEqualByComparingTo("1350.00");
        JsonNode unsold = productById(unsoldProductId);
        assertThat(unsold.get("soldTodayUnits").asInt()).isZero();
        assertThat(unsold.get("soldTodayAmount").decimalValue()).isEqualByComparingTo("0");
    }

    @Test
    void productListRunsTheSameNumberOfQueriesWhateverTheNumberOfProducts() throws Exception {
        sell(1, "450.00").andExpect(status().isCreated());
        long fewProducts = statementsRunBy(get("/api/pumps/{pumpId}/ancillary/products", setup.pumpId()), setup.manager());
        for (int i = 0; i < 4; i++) {
            productId = json(createProduct(Map.of("sellingPricePerUnit", new BigDecimal("50.00")))
                    .andExpect(status().isCreated())).get("id").asLong();
            stockIn(2, "30.00");
            sell(1, "50.00").andExpect(status().isCreated());
        }
        long manyProducts = statementsRunBy(get("/api/pumps/{pumpId}/ancillary/products", setup.pumpId()), setup.manager());

        assertThat(manyProducts).isEqualTo(fewProducts);
    }

    @Test
    void productCanBeSoldRightAfterItsFirstPriceIsSet() throws Exception {
        productId = json(createProduct(Map.of()).andExpect(status().isCreated())).get("id").asLong();
        stockIn(3, "60.00");
        sell(1, "80.00").andExpect(status().isBadRequest());

        perform(post("/api/pumps/{pumpId}/ancillary/products/{id}/prices", setup.pumpId(), productId), setup.owner(),
                Map.of("pricePerUnit", new BigDecimal("80.00")))
                .andExpect(status().isCreated());

        sell(1, "80.00").andExpect(status().isCreated());
        assertThat(product().get("currentStockUnits").asInt()).isEqualTo(2);
    }

    private ResultActions createProduct(Map<String, Object> extraFields) throws Exception {
        Map<String, Object> request = new HashMap<>(Map.of("name", "Coolant " + shortId(),
                "packageSize", new BigDecimal("1"), "unitOfMeasure", "LITRE"));
        request.putAll(extraFields);
        return perform(post("/api/pumps/{pumpId}/ancillary/products", setup.pumpId()), setup.owner(), request);
    }

    private Integer productCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ancillary_products WHERE pump_id = ?",
                Integer.class, setup.pumpId());
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
        return productById(productId);
    }

    private JsonNode productById(long id) throws Exception {
        JsonNode products = json(perform(get("/api/pumps/{pumpId}/ancillary/products", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        JsonNode list = products.has("content") ? products.get("content") : products;
        for (JsonNode product : list) {
            if (product.get("id").asLong() == id) {
                return product;
            }
        }
        throw new AssertionError("Product " + id + " missing from " + products);
    }
}
