package com.ppms.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class UpdateLanguageRequest {

    @NotBlank(message = "Language is required")
    @Pattern(regexp = UserLanguage.PATTERN, message = UserLanguage.MESSAGE)
    private String language;
}
