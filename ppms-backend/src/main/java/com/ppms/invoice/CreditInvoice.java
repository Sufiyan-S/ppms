package com.ppms.invoice;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/** A numbered GST tax invoice for one credit client and period. Every value is a snapshot taken at issue. */
@Entity
@Table(name = "credit_invoices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditInvoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "invoice_number", nullable = false, length = 16)
    private String invoiceNumber;

    @Column(name = "financial_year", nullable = false, length = 7)
    private String financialYear;

    @Column(name = "sequence_number", nullable = false)
    private Integer sequenceNumber;

    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    @Column(name = "issued_on", nullable = false)
    private LocalDate issuedOn;

    @Column(name = "seller_trade_name", nullable = false)
    private String sellerTradeName;

    @Column(name = "seller_legal_name", nullable = false)
    private String sellerLegalName;

    @Column(name = "seller_address")
    private String sellerAddress;

    @Column(name = "seller_gstin", nullable = false, length = 15)
    private String sellerGstin;

    @Column(name = "seller_state_code", nullable = false, length = 2)
    private String sellerStateCode;

    @Column(name = "seller_state_name", length = 60)
    private String sellerStateName;

    @Column(name = "buyer_name", nullable = false)
    private String buyerName;

    @Column(name = "buyer_address")
    private String buyerAddress;

    @Column(name = "buyer_gstin", length = 15)
    private String buyerGstin;

    @Column(name = "buyer_state_code", nullable = false, length = 2)
    private String buyerStateCode;

    @Column(name = "place_of_supply_state_code", nullable = false, length = 2)
    private String placeOfSupplyStateCode;

    @Column(name = "fuel_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal fuelTotal;

    @Column(name = "taxable_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal taxableTotal;

    @Column(name = "cgst_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal cgstTotal;

    @Column(name = "sgst_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal sgstTotal;

    @Column(name = "igst_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal igstTotal;

    @Column(name = "grand_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal grandTotal;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private CreditInvoiceStatus status = CreditInvoiceStatus.ISSUED;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Column(name = "cancelled_by")
    private Long cancelledBy;

    @Column(name = "cancelled_at")
    private OffsetDateTime cancelledAt;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
