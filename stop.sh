#!/bin/bash
# PPMS — Stop all services
# Run this from the project root: ./stop.sh

echo "Stopping PPMS..."

# Kill Spring Boot backend (port 8080)
BACKEND_PID=$(lsof -ti:8080)
if [ -n "$BACKEND_PID" ]; then
  kill -9 $BACKEND_PID 2>/dev/null
  echo "  Backend stopped (port 8080)"
else
  echo "  Backend was not running"
fi

# Kill React frontend (port 5173)
FRONTEND_PID=$(lsof -ti:5173)
if [ -n "$FRONTEND_PID" ]; then
  kill -9 $FRONTEND_PID 2>/dev/null
  echo "  Frontend stopped (port 5173)"
else
  echo "  Frontend was not running"
fi

# Stop PostgreSQL Docker container
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
docker compose -f "$PROJECT_DIR/docker-compose.yml" stop 2>/dev/null
echo "  PostgreSQL stopped"

echo ""
echo "All services stopped."
