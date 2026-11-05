#!/usr/bin/env bash
set -e

# Start VisioAttend (FastAPI Backend + React Frontend)
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "=========================================================="
echo " Starting VisioAttend Privacy-Preserving CV Attendance"
echo " Zero Raw Images Transmitted | On-Device ORB + LK Flow"
echo "=========================================================="

# Check Python environment
if [ ! -d "$DIR/backend/venv" ]; then
    echo "Creating Python virtual environment in backend/venv..."
    python3 -m venv "$DIR/backend/venv"
    "$DIR/backend/venv/bin/pip" install --upgrade pip
    "$DIR/backend/venv/bin/pip" install -r "$DIR/backend/requirements.txt"
fi

# Check Node modules
if [ ! -d "$DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd "$DIR/frontend" && npm install
fi

echo "Starting Backend on http://localhost:8000..."
"$DIR/backend/venv/bin/uvicorn" backend.app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Starting Frontend on http://localhost:5173..."
cd "$DIR/frontend" && npm run dev &
FRONTEND_PID=$!

cleanup() {
    echo "Stopping VisioAttend servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "VisioAttend is running:"
echo "  - Student Web App & Professor Dashboard: http://localhost:5173"
echo "  - FastAPI Documentation:                 http://localhost:8000/docs"
echo "  - Live Consensus Graph WebSocket:        ws://localhost:8000/ws/{session_id}"
echo ""
echo "Press Ctrl+C to terminate both servers."
wait
