#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ubuntu/ppms"
ENV_FILE="${APP_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

if [ -z "${DUCKDNS_DOMAIN:-}" ] || [ -z "${DUCKDNS_TOKEN:-}" ]; then
  echo "DUCKDNS_DOMAIN or DUCKDNS_TOKEN is not set"
  exit 1
fi

RESPONSE="$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")"

if [ "${RESPONSE}" != "OK" ]; then
  echo "DuckDNS update failed: ${RESPONSE}"
  exit 1
fi

echo "DuckDNS updated successfully"
