package com.ppms.adjustment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface FuelDipEntryRepository extends JpaRepository<FuelDipEntry, Long> {

    List<FuelDipEntry> findByPumpIdOrderByDipDateDescCreatedAtDesc(Long pumpId);

    /** Fetch all dip entries for a pump within a date range — used by balance sheet generation. */
    List<FuelDipEntry> findByPumpIdAndDipDateBetween(Long pumpId, LocalDate from, LocalDate to);
}
