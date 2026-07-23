#!/bin/bash

# Smart Invoice Processor (SIP) — Development Runner Script

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "=================================================="
echo " Starting Smart Invoice Processor (SIP) Services  "
echo "=================================================="

# 1. Load environment variables
if [ -f ".env" ]; then
    echo "[*] Loading environment variables from .env..."
    set -a
    source .env
    set +a
elif [ -f ".env.example" ]; then
    echo "[*] Creating .env from .env.example..."
    cp .env.example .env
    set -a
    source .env
    set +a
fi

# 2. Boot Docker Infrastructure (Postgres, Redis, MinIO)
echo "[*] Booting containerized infrastructure (Postgres, Redis, MinIO)..."
docker compose stop backend frontend &>/dev/null || true
docker rm -f sip_backend sip_frontend &>/dev/null || true
docker compose up -d --wait postgres redis minio 2>/dev/null || docker compose up -d postgres redis minio

# 3. Virtual Environment & Dependencies Setup
if [ ! -d "venv" ]; then
    echo "[*] Creating Python virtual environment in ./venv..."
    python3 -m venv venv
fi

echo "[*] Activating Python virtual environment..."
source venv/bin/activate

echo "[*] Installing/verifying Python dependencies..."
pip install -q -r backend/requirements.txt

# 4. Database & MinIO Storage Initialization
echo "[*] Running DB and Object Storage initialization check..."
python3 setup_project.py --init-only

# 5. Frontend Node Modules Check
if [ ! -d "frontend/node_modules" ]; then
    echo "[*] Installing Frontend Node dependencies..."
    cd frontend && npm install && cd ..
fi

# 6. Cleanup Stale Processes
echo "[*] Cleaning up any stale processes on ports 8000 and 5173..."
docker compose stop backend frontend &>/dev/null || true
docker rm -f sip_backend sip_frontend &>/dev/null || true
pkill -9 -f "uvicorn" &>/dev/null || true
pkill -9 -f "celery worker" &>/dev/null || true
pkill -9 -f "vite" &>/dev/null || true

python3 -c "
import os, subprocess, re, socket

for port in [8000, 5173]:
    try:
        out = subprocess.check_output('ss -tulpn 2>/dev/null || lsof -i :' + str(port) + ' 2>/dev/null || true', shell=True, text=True)
        pids = set(re.findall(r'pid=(\d+)', out) + re.findall(r'\b(\d+)/(?:python|uvicorn|node|vite|docker)', out))
        for pid in pids:
            try:
                os.kill(int(pid), 9)
            except Exception:
                pass
    except Exception:
        pass
" &>/dev/null || true

if command -v fuser &>/dev/null; then
    fuser -k -9 8000/tcp &>/dev/null || true
    fuser -k -9 5173/tcp &>/dev/null || true
fi
if command -v lsof &>/dev/null; then
    lsof -ti:8000 | xargs -r kill -9 &>/dev/null || true
    lsof -ti:5173 | xargs -r kill -9 &>/dev/null || true
fi

sleep 2

# Verify Port Availability
python3 -c "
import socket, subprocess, sys

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(('0.0.0.0', 8000))
    s.close()
except Exception as e:
    print('[!] WARNING: Port 8000 cannot be bound!')
    try:
        out = subprocess.check_output('ss -tulpn 2>/dev/null | grep :8000 || true', shell=True, text=True)
        if out.strip():
            print('[!] Details of process holding port 8000:\n' + out.strip())
    except Exception:
        pass
"

# PIDs tracking array
PIDS=()

cleanup() {
    echo ""
    echo "=================================================="
    echo " Terminating SIP Application Services...          "
    echo "=================================================="
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    exit 0
}

trap cleanup INT TERM

# 7. Launch FastAPI Backend
echo "[*] Launching FastAPI Backend (logging to backend/fastapi.log)..."
cd "$SCRIPT_DIR"/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > fastapi.log 2>&1 &
FASTAPI_PID=$!
PIDS+=($FASTAPI_PID)

# 8. Launch Celery Worker
echo "[*] Launching Celery Worker (logging to backend/celery.log)..."
celery -A app.tasks.celery_worker worker --loglevel=info --concurrency=4 > celery.log 2>&1 &
CELERY_PID=$!
PIDS+=($CELERY_PID)

# 9. Launch React Frontend (Vite)
echo "[*] Launching React Frontend (logging to frontend/vite.log)..."
cd "$SCRIPT_DIR"/frontend
npm run dev -- --port 5173 --host 0.0.0.0 > vite.log 2>&1 &
FRONTEND_PID=$!
PIDS+=($FRONTEND_PID)

# Wait for process initialization
sleep 3

# Liveness Check
FAILED=false
if ! kill -0 "$FASTAPI_PID" 2>/dev/null; then
    echo "[!] FastAPI failed to start! Content of backend/fastapi.log:"
    cat "$SCRIPT_DIR"/backend/fastapi.log 2>/dev/null || true
    FAILED=true
fi
if ! kill -0 "$CELERY_PID" 2>/dev/null; then
    echo "[!] Celery worker failed to start! Content of backend/celery.log:"
    cat "$SCRIPT_DIR"/backend/celery.log 2>/dev/null || true
    FAILED=true
fi
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "[!] React Frontend failed to start! Content of frontend/vite.log:"
    cat "$SCRIPT_DIR"/frontend/vite.log 2>/dev/null || true
    FAILED=true
fi

if [ "$FAILED" = true ]; then
    cleanup
fi

echo ""
echo "=================================================="
echo " All SIP Development Services are Online!        "
echo "=================================================="
echo "    FastAPI Backend  : http://localhost:8000 (PID: ${FASTAPI_PID})"
echo "    API OpenAPI Docs : http://localhost:8000/docs"
echo "    React Frontend   : http://localhost:5173 (PID: ${FRONTEND_PID})"
echo "    MinIO Storage    : http://localhost:9001 (User: minioadmin)"
echo ""
echo "[*] Press Ctrl+C to stop all development services."

# Keep process alive
wait $FRONTEND_PID $FASTAPI_PID $CELERY_PID
cleanup
