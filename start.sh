#!/bin/bash
# CareerCraft AI - Startup Script

set -e

export HOME=/root
export PATH="/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$SCRIPT_DIR/logs" "$SCRIPT_DIR/output"

# Load environment variables from .env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo "==> Loading environment from .env..."
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

echo "==> Starting Flask backend on port 8888..."
cd "$SCRIPT_DIR" && python app.py > logs/app.log 2>&1 &

echo "==> Starting React frontend on port 5173..."
cd "$SCRIPT_DIR/client" && npm run dev > "$SCRIPT_DIR/logs/frontend.log" 2>&1 &

echo "==> CareerCraft AI is running."
echo "    Frontend: http://localhost:5173"
echo "    Backend:  http://localhost:8888"