#!/usr/bin/env bash
# Chorister TimeTable - Start Script
# Developed by Benedict U.
set -e

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup first:"
    echo "  bash scripts/setup.sh"
    exit 1
fi

source .venv/bin/activate

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

echo "=== Chorister TimeTable ==="
echo "Starting server at http://${HOST}:${PORT}"
echo "Press Ctrl+C to stop."
echo ""

python -m uvicorn main:app --host "$HOST" --port "$PORT" --reload
