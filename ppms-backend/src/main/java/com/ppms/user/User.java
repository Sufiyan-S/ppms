package com.ppms.user;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false, unique = true)
    private String employeeId;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "phone_number", nullable = false, unique = true)
    private String phoneNumber;

    // Stores bcrypt hash — never plain text (spec Section 3.0)
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    // Optional — used only for password reset email delivery
    @Column(name = "email", unique = true)
    private String email;

    @Column(name = "address")
    private String address;

    @Enumerated(EnumType.STRING)
    @Column(name = "gender")
    private UserGender gender;

    @Column(name = "night_shift_consent", nullable = false)
    private boolean nightShiftConsent;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "role", nullable = false)
    private UserRole role;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private UserStatus status;

    @Column(name = "date_of_joining", nullable = false)
    private LocalDate dateOfJoining;

    // Null for OWNER — owners are not assigned to a specific pump
    @Column(name = "assigned_pump_id")
    private Long assignedPumpId;

    // Flat daily rate for MANAGER / ADMIN / ACCOUNTANT roles.
    // Used when salary_type = DAILY: gross = days_worked × daily_rate.
    @Column(name = "daily_rate")
    private BigDecimal dailyRate;

    // Hourly rate for SHIFT_1 (00:00–08:00, night shift — typically higher pay).
    // Null means payroll rates have not been configured yet for this staff member.
    @Column(name = "shift1_hourly_rate")
    private BigDecimal shift1HourlyRate;

    // Hourly rate for SHIFT_2 (08:00–16:00) and SHIFT_3 (16:00–24:00) — same day rate for both.
    @Column(name = "standard_hourly_rate")
    private BigDecimal standardHourlyRate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    // --- Spring Security UserDetails implementation ---
    // Phone number is the login identifier (spec Q17)

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return phoneNumber;  // phone number is the unique login identifier
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return status == UserStatus.ACTIVE;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return status == UserStatus.ACTIVE;
    }
}
