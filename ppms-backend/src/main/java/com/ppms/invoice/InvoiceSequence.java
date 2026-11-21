package com.ppms.invoice;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

/** Next invoice serial for a pump in one financial year. */
@Entity
@Table(name = "invoice_sequences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class InvoiceSequence {

    @EmbeddedId
    private Key id;

    @Column(name = "next_number", nullable = false)
    private Integer nextNumber;

    @Embeddable
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {

        @Column(name = "pump_id", nullable = false)
        private Long pumpId;

        @Column(name = "financial_year", nullable = false, length = 7)
        private String financialYear;
    }
}
