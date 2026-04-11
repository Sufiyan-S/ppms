#!/bin/bash
# PPMS — Start all services locally
# Run this from the project root: ./start.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting PPMS..."
echo ""

# 1. Start PostgreSQL via Docker
echo "[1/3] Starting PostgreSQL..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d
echo "      Waiting for PostgreSQL to be ready..."
sleep 5

# 2. Build and start Spring Boot backend (runs Flyway migrations automatically on startup)
echo "[2/3] Starting Spring Boot backend..."
cd "$PROJECT_DIR/ppms-backend"
mvn spring-boot:run -q &
BACKEND_PID=$!
echo "      Backend PID: $BACKEND_PID"
echo "      Waiting for backend to start (this takes ~15s on first run)..."
sleep 20

# 3. Start React frontend
echo "[3/3] Starting React frontend..."
cd "$PROJECT_DIR/ppms-frontend"
npm run dev &
FRONTEND_PID=$!
sleep 3

echo ""
echo "PPMS is running!"
echo ""
echo "  App:      http://localhost:5173"
echo "  API:      http://localhost:8080/api"
echo ""
echo "  Default login:"
echo "  Phone:    9999999999"
echo "  Password: Admin@1234"
echo "  (Change this password immediately after first login)"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait and clean up on exit
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose -f '$PROJECT_DIR/docker-compose.yml' stop; exit" SIGINT SIGTERM
wait
