package com.ppms.invoice;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One sale on an invoice, copied from the credit entry or ancillary sale when the invoice was issued. */
@Entity
@Table(name = "credit_invoice_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditInvoiceLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "invoice_id", nullable = false)
    private Long invoiceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "line_type", nullable = false)
    private InvoiceLineType lineType;

    /** Id of the shift credit entry (FUEL) or ancillary sale (ANCILLARY). */
    @Column(name = "source_id", nullable = false)
    private Long sourceId;

    @Column(name = "sale_date", nullable = false)
    private LocalDate saleDate;

    @Column(name = "bill_no", length = 50)
    private String billNo;

    @Column(name = "description", nullable = false, length = 300)
    private String description;

    @Column(name = "vehicle_registration", length = 20)
    private String vehicleRegistration;

    @Column(name = "hsn_code", length = 8)
    private String hsnCode;

    @Column(name = "quantity")
    private Integer quantity;

    @Column(name = "rate", precision = 12, scale = 2)
    private BigDecimal rate;

    @Column(name = "taxable_value", precision = 14, scale = 2)
    private BigDecimal taxableValue;

    @Column(name = "gst_rate", precision = 5, scale = 2)
    private BigDecimal gstRate;

    @Column(name = "cgst", nullable = false, precision = 12, scale = 2)
    private BigDecimal cgst;

    @Column(name = "sgst", nullable = false, precision = 12, scale = 2)
    private BigDecimal sgst;

    @Column(name = "igst", nullable = false, precision = 12, scale = 2)
    private BigDecimal igst;

    @Column(name = "line_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal lineTotal;

    /** True while the invoice is ISSUED; the unique index on active lines stops a sale being billed twice. */
    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean isActive = true;
}
