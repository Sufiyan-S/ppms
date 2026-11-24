FROM eclipse-temurin:21-jre-jammy

ARG APP_JAR

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# UID 1000 matches the host "ubuntu" user that owns the mounted log directory.
RUN useradd --system --uid 1000 --no-create-home app

WORKDIR /app

COPY ${APP_JAR} /app/app.jar
RUN mkdir -p /app/logs && chown -R app:app /app

USER app

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
