#!/usr/bin/env bash
# Local development launcher: FastAPI backend (:9967) + Vite frontend (:5173).
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND="$SCRIPT_DIR/backend"
VENV="$BACKEND/.venv"

if [ -x "$VENV/bin/python" ]; then
  PY="$VENV/bin/python"
else
  echo "Setting up Python virtual environment..."
  python3 -m venv "$VENV"
  PY="$VENV/bin/python"
  "$PY" -m pip install -q -r "$BACKEND/requirements.txt" -r "$BACKEND/requirements-dev.txt"
fi

if [ "${1:-}" = "backup" ]; then
  shift
  exec "$PY" "$BACKEND/scripts/export_db.py" "$@"
fi

if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd "$SCRIPT_DIR/frontend" && npm install --no-audit --no-fund)
fi

echo "Starting backend on http://127.0.0.1:9967..."
(cd "$BACKEND" && "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 9967 --reload) &
BACKEND_PID=$!

echo "Starting frontend on http://127.0.0.1:5173..."
(cd "$SCRIPT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' EXIT
echo "--------------------------------------------------------"
echo "🎁 Present is running: http://localhost:5173"
echo "API docs:              http://localhost:9967/docs"
echo "--------------------------------------------------------"
wait
