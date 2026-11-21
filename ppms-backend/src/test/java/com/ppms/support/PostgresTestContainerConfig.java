package com.ppms.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.time.Duration;

/**
 * One Postgres container for the whole test JVM, shared by every Spring test context,
 * so a slow or failed container start cannot take down only the contexts that happened to start one.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresTestContainerConfig {

    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withStartupTimeout(Duration.ofMinutes(2));

    static {
        POSTGRES.start();
    }

    // Empty destroyMethod: closing one cached context must not stop the container the others still use
    @Bean(destroyMethod = "")
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return POSTGRES;
    }
}
