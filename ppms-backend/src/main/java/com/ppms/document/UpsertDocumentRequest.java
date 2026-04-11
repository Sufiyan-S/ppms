package com.ppms.document;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

@Data
public class UpsertDocumentRequest {

    @NotBlank(message = "name is required")
    private String name;

    @NotBlank(message = "docType is required")
    private String docType;

    /** Optional — if null, document is treated as having no fixed expiry */
    private LocalDate expiryDate;

    private String notes;
}
