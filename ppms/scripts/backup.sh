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

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BACKUP_FILE="${BACKUP_DIR}/ppms_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

docker exec ppms-postgres pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -F c \
  -f "/tmp/ppms_${TIMESTAMP}.dump"

docker cp "ppms-postgres:/tmp/ppms_${TIMESTAMP}.dump" "${BACKUP_FILE}"
docker exec ppms-postgres rm -f "/tmp/ppms_${TIMESTAMP}.dump"

find "${BACKUP_DIR}" -type f -name 'ppms_*.dump' -mtime +14 -delete

echo "Backup created: ${BACKUP_FILE}"
