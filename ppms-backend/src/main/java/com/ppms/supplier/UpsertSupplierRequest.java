package com.ppms.supplier;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpsertSupplierRequest {

    @NotBlank(message = "name is required")
    private String name;

    private String contactName;
    private String phone;
    private String email;
    private String notes;
}
