package com.ppms.inventory;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DipCheckNozzleReadingRepository extends JpaRepository<DipCheckNozzleReading, Long> {
}
